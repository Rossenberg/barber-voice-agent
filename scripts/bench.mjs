#!/usr/bin/env node
// Recognizer benchmark on phrases the owner recorded at /lab/bench/ (known text in web/lab/bench/phrases.js).
// Every recording goes through OpenAI gpt-transcribe (as in calls: language hy + vocabulary hint) and Gemini
// Flash-Lite; "both" = a text model picks the most likely phrase from the two transcripts. Each result is scored:
// phone digits must match exactly, everything else is judged on meaning ("would the assistant act right?").
//   node scripts/bench.mjs                 (latest bench session)
//   node scripts/bench.mjs bench-mvtnzxra  (a given one)
//   ONLY=openai node scripts/bench.mjs     (just OpenAI, e.g. after changing TRANSCRIBE_HINT in index.ts)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHRASES } from "../web/lab/bench/phrases.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = join(ROOT, "backend");
const env = Object.fromEntries(readFileSync(join(BACKEND, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const src = readFileSync(join(BACKEND, "src/index.ts"), "utf8");
// the same hint and prompt the live site uses
const HINT = src.match(/const TRANSCRIBE_HINT = "([^"]+)"/)[1];
const STT_PROMPT = eval(src.match(/const STT_PROMPT = (\[[\s\S]*?\])\.join/)[1]).join("\n");
const sql = (q) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "barber-voice-agent", "--remote", "--json", "--command", q], { cwd: BACKEND, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }))[0].results;

const session = process.argv[2] ?? sql("SELECT call_id FROM realtime_log WHERE call_id LIKE 'bench-%' ORDER BY id DESC LIMIT 1")[0].call_id;
const OUT = join(ROOT, "scripts/bench-out", session);
mkdirSync(OUT, { recursive: true });

// ---- recordings (cached on disk)
const rows = sql(`SELECT max(id) id, turn FROM realtime_log WHERE call_id = '${session}' AND role = 'user_audio' GROUP BY turn ORDER BY turn`);
for (const r of rows) {
  const file = join(OUT, `${r.turn}.wav`);
  if (existsSync(file)) continue;
  const [a] = sql(`SELECT hex(audio) h FROM realtime_log WHERE id = ${r.id}`);
  writeFileSync(file, Buffer.from(a.h, "hex"));
}
console.log(`${session}: ${rows.length} recordings`);

// ---- recognizers
async function timed(fn) {
  const t = Date.now();
  try {
    return { text: await fn(), ms: Date.now() - t };
  } catch (e) {
    return { text: "", ms: Date.now() - t, error: String(e.message).slice(0, 160) };
  }
}
async function openai(wav) {
  const form = new FormData();
  form.append("model", "gpt-transcribe");
  form.append("language", "hy");
  form.append("prompt", HINT);
  form.append("file", new Blob([wav], { type: "audio/wav" }), "phrase.wav");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form });
  if (!res.ok) throw new Error(`openai ${res.status} ${await res.text()}`);
  return ((await res.json()).text ?? "").trim();
}
async function gemini(wav) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ model: "gemini-3.5-flash-lite", store: false, input: [{ type: "text", text: STT_PROMPT }, { type: "audio", data: Buffer.from(wav).toString("base64"), mime_type: "audio/wav" }], generation_config: { temperature: 0, thinking_level: "minimal" } }),
    });
    if (res.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 15000)); continue; }
    if (!res.ok) throw new Error(`gemini ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).map((c) => c.text ?? "").join(" ").trim();
  }
}
async function chat(messages, json = false) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-6.1-terra", reasoning_effort: "none", messages, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`chat ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  cost += (data.usage.prompt_tokens * 2 + data.usage.completion_tokens * 8) / 1e6; // rough
  return data.choices[0].message.content.trim();
}
let cost = 0;
const both = (a, b) =>
  chat([
    { role: "system", content: "Two speech recognizers transcribed the same short phrase from a caller phoning a barbershop in Yerevan (colloquial Armenian). Write the single most likely thing the caller said, using whichever words make more sense; for phone digits prefer the version whose numbers are spelled out completely. Output only the phrase." },
    { role: "user", content: `A: ${a || "-"}\nB: ${b || "-"}` },
  ]);

// ---- scoring
const UNITS = { զրո: 0, մեկ: 1, երկու: 2, երեք: 3, չորս: 4, հինգ: 5, վեց: 6, յոթ: 7, ութ: 8, ինը: 9, իննը: 9, ինն: 9 };
const TENS = { տասն: 10, քսան: 20, երեսուն: 30, քառասուն: 40, հիսուն: 50, վաթսուն: 60, յոթանասուն: 70, ութսուն: 80, իննսուն: 90 };
function wordToNum(w) {
  if (w in UNITS) return String(UNITS[w]);
  if (w === "տասը" || w === "տաս") return "10";
  for (const [t, v] of Object.entries(TENS)) {
    if (w === t) return String(v);
    if (w.startsWith(t) && w.slice(t.length) in UNITS) return String(v + UNITS[w.slice(t.length)]);
  }
  return null;
}
function digitsOf(text) {
  const nums = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).map((w) => (/^\d+$/.test(w) ? w : wordToNum(w) ?? ""));
  // «հիսուն հինգ» written apart is still 55, not 50 and 5
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i], next = nums[i + 1];
    if (/^[2-9]0$/.test(n) && /^[1-9]$/.test(next ?? "")) { out.push(String(Number(n) + Number(next))); i++; } else out.push(n);
  }
  return out.join("");
}
async function judge(p, cands) {
  const out = await chat([
    { role: "system", content: 'You check speech recognition for a barbershop phone assistant. Given what the caller really said and several transcripts, say for each transcript whether the assistant would understand the caller correctly from it (same meaning: same yes/no, names, day, time, services, question). Small spelling or slang differences are fine. Answer JSON {"ok":[true/false,...],"why":["short reason in Russian if false",...]}.' },
    { role: "user", content: `Said: ${p.text}\n${cands.map((c, i) => `${i + 1}: ${c || "(nothing)"}`).join("\n")}` },
  ], true);
  return JSON.parse(out);
}

// ---- run
const ONLY = process.env.ONLY === "openai";
const NAMES = ONLY ? ["OpenAI"] : ["OpenAI", "Gemini", "Both"];
const results = [];
for (const r of rows) {
  const noise = r.turn >= 1000;
  const p = PHRASES.find((x) => x.id === r.turn % 1000);
  const wav = readFileSync(join(OUT, `${r.turn}.wav`));
  let cands;
  if (ONLY) cands = [await timed(() => openai(wav))];
  else {
    const [o, g] = await Promise.all([timed(() => openai(wav)), timed(() => gemini(wav))]);
    const b = await timed(() => both(o.text, g.text));
    b.ms += Math.max(o.ms, g.ms); // waits for both recognizers, then picks
    cands = [o, g, b];
  }
  const verdict = p.digits ? { ok: cands.map((c) => digitsOf(c.text).endsWith(p.digits) || digitsOf(c.text).includes(p.digits)), why: cands.map((c) => `цифры ${digitsOf(c.text) || "—"}`) } : await judge(p, cands.map((c) => c.text));
  results.push({ id: p.id, noise, kind: p.kind, said: p.text, ...Object.fromEntries(NAMES.map((n, i) => [n, { ...cands[i], ok: !!verdict.ok[i], why: verdict.ok[i] ? undefined : verdict.why?.[i] }])) });
  console.log(`${noise ? "🔊" : "  "} #${p.id} ${NAMES.map((n, i) => `${n} ${verdict.ok[i] ? "✓" : "✗"} ${(cands[i].ms / 1000).toFixed(1)}s`).join(" | ")}`);
}
writeFileSync(join(OUT, ONLY ? "results-openai.json" : "results.json"), JSON.stringify(results, null, 2));

// ---- summary
const pct = (list, n) => `${list.filter((x) => x[n].ok).length}/${list.length}`;
const med = (list, n) => { const v = list.map((x) => x[n].ms).sort((a, b) => a - b); return (v[Math.floor(v.length / 2)] / 1000).toFixed(1); };
const groups = { "Всё": results, "Тишина": results.filter((x) => !x.noise), "Шум": results.filter((x) => x.noise), "Да/нет": results.filter((x) => x.kind === "yesno"), "Номера": results.filter((x) => x.kind === "number"), "Имена": results.filter((x) => x.kind === "name"), "Время": results.filter((x) => x.kind === "time"), "Услуги/жаргон": results.filter((x) => x.kind === "service"), "Сложные": results.filter((x) => x.kind === "complex") };
console.log(`\n${"".padEnd(15)}${NAMES.map((n) => n.padEnd(10)).join("")}`);
for (const [g, list] of Object.entries(groups)) if (list.length) console.log(`${g.padEnd(15)}${NAMES.map((n) => pct(list, n).padEnd(10)).join("")}`);
console.log(`${"Скорость (мед.)".padEnd(15)}${NAMES.map((n) => `${med(results, n)} с`.padEnd(10)).join("")}`);
console.log(`\nОшибки:`);
for (const x of results) for (const n of NAMES) if (!x[n].ok) console.log(`${x.noise ? "🔊" : "  "} #${x.id} ${n}: «${x[n].text || x[n].error || ""}» — ${x[n].why ?? ""}`);
console.log(`\nchat cost ≈ $${cost.toFixed(3)} · details in ${join(OUT, ONLY ? "results-openai.json" : "results.json")}`);
