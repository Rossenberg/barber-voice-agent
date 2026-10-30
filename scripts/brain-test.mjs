#!/usr/bin/env node
// "Brain" test: caller situations (scripts/brain-cases.mjs) go to the same realtime model, instructions and
// tools as a real call (text in, text out; calendar tools hit the live site with a test caller ID), then
// gpt-6-astra grades each reply against what the assistant should do. Test bookings are cancelled after
// every situation.
//   node scripts/brain-test.mjs                  (all)
//   CAT=group,change node scripts/brain-test.mjs (some categories)
//   ONLY=201,202 node scripts/brain-test.mjs
//   PICK=long:20,group:14 node scripts/brain-test.mjs   (first N of each category)
//   EFFORT=low node scripts/brain-test.mjs       (session reasoning effort)
//   REGRADE=scripts/bench-out/brain-….json node scripts/brain-test.mjs   (grade saved answers again)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./brain-cases.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://barber-voice-agent.weboostai.workers.dev";
const ORIGIN = { origin: SITE };
const TEST_PHONE = "+37499000111"; // the test caller's "caller ID"; its bookings are cancelled after each case
const EFFORT = process.env.EFFORT ?? "";
const only = process.env.ONLY?.split(",").map(Number);
const cats = process.env.CAT?.split(",");
// PICK=long:20,service:10 — only the first N situations of each named category
const pick = process.env.PICK ? Object.fromEntries(process.env.PICK.split(",").map((x) => x.split(":")).map(([c, n]) => [c, Number(n)])) : null;
const picked = {};

async function session() {
  const res = await fetch(`${SITE}/api/realtime-session?voice=male&speech=elevenlabs&turn=manual&caller=${encodeURIComponent(TEST_PHONE)}${EFFORT ? `&effort=${EFFORT}` : ""}`, { method: "POST", headers: ORIGIN });
  const data = await res.json();
  if (!data.key || !data.call_token) throw new Error(JSON.stringify(data));
  return data;
}
const tool = async (token, name, args) => (await fetch(`${SITE}/api/rt-tool`, { method: "POST", headers: { ...ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ name, args, call_token: token }) })).json();

const cfg = await (await fetch(`${SITE}/api/public/config`)).json();
const dayFrom = (n) => { const d = new Date(cfg.today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// One situation: make its bookings, replay the earlier turns, send the caller's phrase the way the page does
// (the phrase + the recognizer's transcript as a system note), run tools until the model answers.
async function ask(item) {
  const ids = []; // every booking to cancel afterwards
  const items = []; // conversation items to replay
  // "earlier call" bookings first, from another session with the same caller ID: the real call session
  // then finds them when it starts, like it would on the phone
  for (const b of (item.setup ?? []).filter((b) => !b.here)) {
    const out = await tool((await session()).call_token, "create_booking", { service_id: b.service, date: dayFrom(b.day), time: b.time, client_name: b.who, phone: TEST_PHONE, service_named: true });
    if (!out.success) throw new Error(`setup ${b.who} → ${JSON.stringify(out)}`);
    ids.push(out.booking_id);
  }
  const sess = await session();
  for (const [i, b] of (item.setup ?? []).entries()) {
    if (!b.here) continue;
    const args = { service_id: b.service, date: dayFrom(b.day), time: b.time, client_name: b.who, phone: TEST_PHONE, service_named: true };
    const out = await tool(sess.call_token, "create_booking", args);
    if (!out.success) throw new Error(`setup ${JSON.stringify(args)} → ${JSON.stringify(out)}`);
    ids.push(out.booking_id);
    if (b.here) {
      items.push({ type: "function_call", call_id: `setup_${i}`, name: "create_booking", arguments: JSON.stringify(args) });
      items.push({ type: "function_call_output", call_id: `setup_${i}`, output: JSON.stringify(out) });
    }
  }
  const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", ["realtime", `openai-insecure-api-key.${sess.key}`]);
  const send = (o) => ws.send(JSON.stringify(o));
  const log = [];
  let firstTextMs = null, t0 = 0, reasoning = 0, retried = false;
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = (e) => fail(new Error("ws " + (e.message ?? "error"))); });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => (ws.close(), reject(new Error("timeout"))), 60000);
      const texts = [];
      ws.onmessage = async (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === "error") { clearTimeout(timer); ws.close(); return reject(new Error(ev.error?.message)); }
        if (ev.type === "response.output_text.delta" && firstTextMs === null) firstTextMs = Date.now() - t0;
        if (ev.type === "response.output_text.done") { texts.push(ev.text); log.push(["assistant", ev.text]); }
        if (ev.type === "response.done") {
          if (ev.response.status !== "completed") log.push(["status", `${ev.response.status} ${JSON.stringify(ev.response.status_details ?? {}).slice(0, 300)}`]);
          // same as the call page: one retry when OpenAI fails a response
          if (ev.response.status === "failed" && !retried) { retried = true; setTimeout(() => send({ type: "response.create" }), 600); return; }
          reasoning += ev.response.usage?.output_token_details?.reasoning_tokens ?? 0;
          rtCost += rtUsage(ev.response.usage);
          const calls = (ev.response.output ?? []).filter((o) => o.type === "function_call");
          if (calls.length) {
            for (const c of calls) {
              const args = JSON.parse(c.arguments || "{}");
              const out = await tool(sess.call_token, c.name, args);
              if (c.name === "create_booking" && out.booking_id) ids.push(out.booking_id);
              log.push(["tool", `${c.name} ${JSON.stringify(args)} → ${JSON.stringify(out).slice(0, 900)}`]);
              send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) } });
            }
            send({ type: "response.create" });
            return;
          }
          clearTimeout(timer);
          ws.close();
          resolve({ reply: texts.join(" "), log, firstTextMs, totalMs: Date.now() - t0, reasoning });
        }
      };
      for (const it of items) send({ type: "conversation.item.create", item: it });
      if (item.setup?.length) log.push(["setup", item.setup.map((b) => `${b.who}: ${b.service} ${dayFrom(b.day)} ${b.time}${b.here ? " (booked earlier in this call)" : " (booked in an earlier call under the caller's number)"}`).join("; ")]);
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
  } finally {
    // the test caller's bookings never stay in the calendar
    const left = await tool(sess.call_token, "find_bookings", {});
    for (const b of left.bookings ?? []) await tool(sess.call_token, "cancel_booking", { booking_id: b.booking_id });
    for (const id of ids) await tool(sess.call_token, "cancel_booking", { booking_id: id });
  }
}

// $ per 1M tokens. Realtime from OpenAI's pricing (as in scripts/cost-report.mjs); the grader is
// gpt-6.1-terra (about 5x cheaper than gpt-6-astra, which stays for the live-call detector).
const RT = { text_in: 4, cached_in: 0.4, text_out: 24 };
const GRADER = { model: process.env.GRADER ?? "gpt-6.1-terra", in: 2, cached: 0.2, out: 8 };
let cost = 0, rtCost = 0;
const rtUsage = (u) => {
  const cached = u?.input_token_details?.cached_tokens ?? 0;
  return (((u?.input_tokens ?? 0) - cached) * RT.text_in + cached * RT.cached_in + (u?.output_tokens ?? 0) * RT.text_out) / 1e6;
};
async function grade(item, r) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: GRADER.model,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You grade a phone receptionist AI of a barbershop in Yerevan. Judge ONLY what the assistant did after the caller's LAST phrase (its tool calls and reply).
${item.expect ? `What it should do: ${item.expect}\nGrade mainly against this.` : "Good = it understood what the caller really needs (the main question first), answered every part that matters from the tool results, didn't invent facts, and ended with one clear next step."}
Always: correct, polite Armenian (Դուք) — or the caller's language if they speak Russian/English; 1–3 short sentences; no invented free times, prices or policies; never «Գրանցե՞մ» or a booking before the service is known; never cancel or change a booking before the caller agreed (unless they clearly asked for exactly that).
House rules (correct, don't flag): «թրաշ» = beard trim (beard_trim), not a shave; haircut + beard trim = 16 000 AMD, 1 hour. Every service is 30 min, two = 1 h, three = 1.5 h. The assistant knows only the price list, hours and calendar: for anything else «no exact information» + offering the administrator is right. Up to 2 people can be served at once. The caller's bookings from earlier calls are already listed in the assistant's instructions (the "setup" line), so using their booking_id without calling find_bookings is correct. They are found with find_bookings (by caller ID) and changed with replace_booking_id or cancel_booking; the administrator is only for bookings it can't find. «Ձեզ հետ կկապվի» is correct.
Context: today ${cfg.today}; hours ${cfg.hours_text}; address ${cfg.address}; services ${cfg.services_text}${item.note ? `\nNote: ${item.note}` : ""}
Answer JSON {"grade":"good"|"weak"|"bad","why":"one short sentence in Russian"}. weak = right idea but missed a part, clumsy Armenian, or too long; bad = did the wrong thing, wrong or invented facts, or ignored the main point.`,
        },
        { role: "user", content: r.log.map(([who, t]) => `${who}: ${t}`).join("\n") },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  const cachedG = data.usage.prompt_tokens_details?.cached_tokens ?? 0;
  cost += ((data.usage.prompt_tokens - cachedG) * GRADER.in + cachedG * GRADER.cached + data.usage.completion_tokens * GRADER.out) / 1e6;
  return JSON.parse(data.choices[0].message.content);
}

const mark = (g) => (g === "good" ? "✓" : g === "weak" ? "~" : "✗");
const results = [];
if (process.env.REGRADE) {
  for (const old of JSON.parse(readFileSync(process.env.REGRADE, "utf8"))) {
    if (old.grade === "error") { results.push(old); continue; }
    const g = await grade(CASES.find((c) => c.id === old.id), old);
    results.push({ ...old, ...g });
    console.log(`#${old.id} ${mark(g.grade)} ${g.grade !== "good" ? g.why : ""}`);
  }
}
for (const item of process.env.REGRADE ? [] : CASES) {
  if (only && !only.includes(item.id)) continue;
  if (cats && !cats.includes(item.cat)) continue;
  if (pick) {
    if (!(item.cat in pick) || (picked[item.cat] ?? 0) >= pick[item.cat]) continue;
    picked[item.cat] = (picked[item.cat] ?? 0) + 1;
  }
  let r;
  try {
    r = await ask(item);
  } catch (e) {
    console.log(`#${item.id} ERROR ${e.message}`);
    results.push({ id: item.id, cat: item.cat, grade: "error", why: e.message });
    if (/credit|quota/i.test(e.message)) break;
    continue;
  }
  const g = await grade(item, r);
  results.push({ id: item.id, cat: item.cat, ...g, reply: r.reply, firstTextMs: r.firstTextMs, totalMs: r.totalMs, reasoning: r.reasoning, log: r.log });
  console.log(`#${item.id} ${mark(g.grade)} ${(r.totalMs / 1000).toFixed(1)}s  ${r.reply.replace(/\s+/g, " ")}${g.grade !== "good" ? `\n     → ${g.why}` : ""}`);
}

const n = (list, g) => list.filter((r) => r.grade === g).length;
const times = results.map((r) => r.totalMs).filter(Boolean).sort((a, b) => a - b);
console.log("");
for (const c of [...new Set(results.map((r) => r.cat))]) {
  const l = results.filter((r) => r.cat === c);
  console.log(`${String(c).padEnd(8)} good ${n(l, "good")}/${l.length}  weak ${n(l, "weak")}  bad ${n(l, "bad")}`);
}
console.log(`\nEFFORT=${EFFORT || "default"}: good ${n(results, "good")} · weak ${n(results, "weak")} · bad ${n(results, "bad")} · errors ${n(results, "error")} of ${results.length}; full reply median ${times.length ? (times[Math.floor(times.length / 2)] / 1000).toFixed(1) : "-"} s; conversations $${rtCost.toFixed(2)} + grading $${cost.toFixed(2)} = $${(rtCost + cost).toFixed(2)}`);
mkdirSync(join(ROOT, "scripts/bench-out"), { recursive: true });
writeFileSync(join(ROOT, `scripts/bench-out/brain-${EFFORT || "default"}-${Date.now()}.json`), JSON.stringify(results, null, 2));
