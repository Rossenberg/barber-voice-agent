#!/usr/bin/env node
// "Brain" test: long, tangled caller questions (scripts/brain-questions.mjs) go to the same realtime model,
// instructions and tools as a real call (text in, text out; calendar tools hit the live site), then
// gpt-6-astra grades each reply. Bookings the model makes are cancelled at the end.
//   node scripts/brain-test.mjs                  (default reasoning)
//   EFFORT=low node scripts/brain-test.mjs       (session reasoning effort)
//   ONLY=3,9 node scripts/brain-test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS } from "./brain-questions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://barber-voice-agent.weboostai.workers.dev";
const ORIGIN = { origin: SITE };
const EFFORT = process.env.EFFORT ?? "";
const only = process.env.ONLY?.split(",").map(Number);

async function session() {
  const res = await fetch(`${SITE}/api/realtime-session?voice=male&speech=elevenlabs&turn=manual${EFFORT ? `&effort=${EFFORT}` : ""}`, { method: "POST", headers: ORIGIN });
  const data = await res.json();
  if (!data.key) throw new Error(JSON.stringify(data));
  return data.key;
}

// One question: replay the earlier turns as text, send the caller's phrase the way the page does
// (the phrase + the recognizer's transcript as a system note), run tools until the model answers.
async function ask(item) {
  const key = await session();
  const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", ["realtime", `openai-insecure-api-key.${key}`]);
  const send = (o) => ws.send(JSON.stringify(o));
  const log = [];
  const booked = [];
  let firstTextMs = null, t0 = 0, reasoning = 0;
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = (e) => fail(new Error("ws " + (e.message ?? "error"))); });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => (ws.close(), reject(new Error("timeout"))), 60000);
    let texts = [];
    ws.onmessage = async (msg) => {
      const ev = JSON.parse(msg.data);
      if (ev.type === "error") { clearTimeout(timer); ws.close(); return reject(new Error(ev.error?.message)); }
      if (ev.type === "response.output_text.delta" && firstTextMs === null) firstTextMs = Date.now() - t0;
      if (ev.type === "response.output_text.done") { texts.push(ev.text); log.push(["assistant", ev.text]); }
      if (ev.type === "response.done") {
        reasoning += ev.response.usage?.output_token_details?.reasoning_tokens ?? 0;
        const calls = (ev.response.output ?? []).filter((o) => o.type === "function_call");
        if (calls.length) {
          for (const c of calls) {
            const args = JSON.parse(c.arguments || "{}");
            const out = await (await fetch(`${SITE}/api/rt-tool`, { method: "POST", headers: { ...ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ name: c.name, args }) })).json();
            if (c.name === "create_booking" && out.booking_id) booked.push(out.booking_id);
            log.push(["tool", `${c.name} ${JSON.stringify(args)} → ${JSON.stringify(out).slice(0, 900)}`]);
            send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) } });
          }
          send({ type: "response.create" });
          return;
        }
        clearTimeout(timer);
        ws.close();
        resolve({ reply: texts.join(" "), log, firstTextMs, totalMs: Date.now() - t0, reasoning, booked });
      }
    };
    for (const [role, text] of item.before ?? []) {
      send({ type: "conversation.item.create", item: { type: "message", role, content: [{ type: role === "user" ? "input_text" : "output_text", text }] } });
      log.push([role, text]);
    }
    send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: item.q }] } });
    send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `Speech recognizer heard the caller say: «${item.q}». Use it together with the audio; where they differ, trust what makes sense for a barbershop booking.` }] } });
    log.push(["user", item.q]);
    t0 = Date.now();
    send({ type: "response.create" });
  });
}

let cost = 0;
async function grade(item, r, ctx) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-6-astra",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You grade a phone receptionist AI of a barbershop in Yerevan. The caller just said something long or tangled. Judge ONLY the assistant's reply to that last phrase (after any calendar checks).
Good = it understood what the caller really needs (the main question first, e.g. "the soonest time" when they list options), answered every part that matters correctly from the tool results, didn't invent facts (free times, prices, policies it doesn't know), moved the booking forward with one clear next step, and the Armenian is correct and polite (Դուք), 1–3 short sentences. Booking the caller is not required yet; asking the one missing thing (name, service) is right. A booking from an EARLIER call can't be changed by the assistant: the administrator calls back — that's correct.
House rules (correct, don't flag): «թրաշ» = beard trim (beard_trim), not a shave; haircut + beard trim = 16 000 AMD, 1 hour. Every service is 30 min, two = 1 h, three = 1.5 h. The assistant knows only the price list, hours and calendar: for anything else (address if not given, parking, payment, specific barber, skin advice) «no exact information» + offering the administrator is right. Up to 2 people can be served at once. When the caller hasn't named a service the assistant may check with haircut but must ask the service.
Context: ${ctx}${item.note ? `\nNote: ${item.note}` : ""}
Answer JSON {"grade":"good"|"weak"|"bad","why":"one short sentence in Russian"}. weak = understandable but missed a part, clumsy, or too long; bad = misunderstood, wrong or invented facts, or ignored the main question.`,
        },
        { role: "user", content: r.log.map(([who, t]) => `${who}: ${t}`).join("\n") },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  cost += (data.usage.prompt_tokens * 10 + data.usage.completion_tokens * 50) / 1e6;
  return JSON.parse(data.choices[0].message.content);
}

const cfg = await (await fetch(`${SITE}/api/public/config`)).json();
const ctx = `today ${cfg.today}; hours ${cfg.hours_text}; services ${cfg.services_text}`;
const results = [];
if (process.env.REGRADE) {
  for (const old of JSON.parse(readFileSync(process.env.REGRADE, "utf8"))) {
    const item = QUESTIONS.find((q) => q.id === old.id);
    const g = await grade(item, old, ctx);
    results.push({ ...old, ...g });
    console.log(`#${item.id} ${g.grade === "good" ? "✓" : g.grade === "weak" ? "~" : "✗"} ${g.grade !== "good" ? g.why : ""}`);
  }
}
for (const item of process.env.REGRADE ? [] : QUESTIONS) {
  if (only && !only.includes(item.id)) continue;
  let r;
  try {
    r = await ask(item);
  } catch (e) {
    console.log(`#${item.id} ERROR ${e.message}`);
    results.push({ id: item.id, grade: "error", why: e.message });
    continue;
  }
  const g = await grade(item, r, ctx);
  results.push({ id: item.id, ...g, reply: r.reply, firstTextMs: r.firstTextMs, totalMs: r.totalMs, reasoning: r.reasoning, log: r.log, booked: r.booked });
  console.log(`#${item.id} ${g.grade === "good" ? "✓" : g.grade === "weak" ? "~" : "✗"} ${(r.firstTextMs / 1000).toFixed(1)}/${(r.totalMs / 1000).toFixed(1)}s r${r.reasoning}  ${r.reply}\n     ${g.grade !== "good" ? "→ " + g.why : ""}`);
}

// test bookings must not stay in the calendar
const ids = results.flatMap((r) => r.booked ?? []).map((b) => Number(String(b).replace(/\D/g, "")) - 1000).filter((n) => n > 0);
if (ids.length) {
  execFileSync("npx", ["wrangler", "d1", "execute", "barber-voice-agent", "--remote", "--command", `UPDATE bookings SET status = 'cancelled' WHERE id IN (${ids.join(",")})`], { cwd: join(ROOT, "backend"), stdio: "ignore" });
  console.log(`cancelled test bookings ${ids.join(", ")}`);
}

const n = (g) => results.filter((r) => r.grade === g).length;
const times = results.map((r) => r.totalMs).filter(Boolean).sort((a, b) => a - b);
console.log(`\nEFFORT=${EFFORT || "default"}: good ${n("good")} · weak ${n("weak")} · bad ${n("bad")} · errors ${n("error")} of ${results.length}; full reply median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s; grading ≈ $${cost.toFixed(2)}`);
mkdirSync(join(ROOT, "scripts/bench-out"), { recursive: true });
writeFileSync(join(ROOT, `scripts/bench-out/brain-${EFFORT || "default"}-${Date.now()}.json`), JSON.stringify(results, null, 2));
