#!/usr/bin/env node
// End-to-end booking check in a real cabinet: logs in as the owner, lets a model play the client in the
// website chat of that business until a booking is made, then checks the booking in the owner's calendar
// (name, phone, date, time, service). Test bookings are cancelled at the end.
//   UMNIK_EMAIL=… UMNIK_PASSWORD=… node scripts/booking-flow.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://umnik.weboostai.workers.dev";
let cookie = "", cost = 0;
async function api(path, body, method = body ? "POST" : "GET") {
  const res = await fetch(SITE + path, { method, headers: { origin: SITE, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return [res.status, await res.json().catch(() => null)];
}
async function llm(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-6.1-terra", reasoning_effort: "none", response_format: { type: "json_object" }, messages }) });
  const d = await res.json(); if (!res.ok) throw new Error(JSON.stringify(d).slice(0, 200));
  cost += (d.usage.prompt_tokens * 2 + d.usage.completion_tokens * 8) / 1e6;
  return JSON.parse(d.choices[0].message.content);
}

const [st] = await api("/api/auth/login", { email: process.env.UMNIK_EMAIL, password: process.env.UMNIK_PASSWORD });
if (st !== 200) throw new Error("login failed " + st);
const [, me] = await api("/api/app/me");
const [, s0] = await api("/api/app/state");
const known = new Set(s0.bookings.map((b) => b.id));
const today = s0.today;
console.log(`logged in: ${s0.settings.shop_name} (${me.slug}), today ${today}, hours ${JSON.stringify(s0.settings.hours)}`);
const add = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Each: what the client wants (in their own colloquial Armenian), and what the booking must look like.
const SCENES = [
  { name: "дата с месяцем", goal: "Ուզում ես նոյեմբերի 5-ին, ցերեկը ժամը 12-ին մազերդ կտրել։ Անունդ Վահե է, համարդ՝ 099 11 22 33։", expect: { who: ["Վահե"], phone: "+37499112233", date: "2026-11-05", service: "haircut" } },
  { name: "через 30 минут", goal: "Ուզում ես հենց հիմա կամ կես ժամից գալ թրաշդ դզելու, իսկ եթե այսօր չի ստացվում՝ համաձայն ես ամենամոտ ազատ ժամին։ Անունդ Գոռ է, համարդ՝ 077 55 44 33։", expect: { who: ["Գոռ"], phone: "+37477554433", service: "beard_trim" } },
  { name: "через час", goal: "Ուզում ես մի ժամից գալ, մազ ու թրաշ միասին, իսկ եթե չի ստացվում՝ համաձայն ես ամենամոտ ազատ ժամին։ Անունդ Արման է, համարդ՝ 094 12 34 56։", expect: { who: ["Արման"], phone: "+37494123456", service: "haircut_beard" } },
  { name: "ամսի 10-ին երեկոյան", goal: "Ուզում ես ամսի 10-ին երեկոյան ֆեյդ անել, ցանկացած ազատ ժամ երեկոյան։ Անունդ Տիգրան է, համարդ՝ 091 98 76 54։", expect: { who: ["Տիգրան"], phone: "+37491987654", service: "fade_cut" } },
  { name: "послезавтра утром", goal: "Ուզում ես վաղը չէ մյուս օրը առավոտյան, ժամը 11-ին մազերդ կտրել։ Անունդ Սամվել է, համարդ՝ 098 22 33 44։", expect: { who: ["Սամվել"], phone: "+37498223344", service: "haircut" } },
  { name: "я и брат", goal: "Դու ու ախպերդ ուզում եք վաղը չէ մյուս օրը ժամը 4-ին գալ․ քեզ ֆեյդ, ախպորդ՝ մենակ թրաշ։ Եթե միաժամանակ չի ստացվում, համաձայն ես իրար հետևից։ Քո անունը Դավիթ է, ախպորդ՝ Հայկ, համարդ՝ 093 45 67 89 (երկուսի համար)։", expect: { who: ["Դավիթ", "Հայկ"], phone: "+37493456789", service: "fade_cut|beard_trim" } },
];

const report = [];
for (const sc of SCENES) {
  const id = `flow-${Date.now().toString(36)}`;
  const messages = [{ role: "assistant", content: "Բարև ձեզ, ես Անին եմ։ Ինչո՞վ օգնեմ։" }];
  const transcript = [];
  let booked = false;
  for (let turn = 0; turn < 9; turn++) {
    const c = await llm([
      { role: "system", content: `You play a client writing to a barbershop's website chat in colloquial Yerevan Armenian (short, natural, slang ok). Your goal: ${sc.goal}\nAnswer only what the assistant asks; give your name and phone only when asked. When the assistant confirms the booking (or bookings) is done, set done true. Reply JSON {"say": "...", "done": false}.` },
      { role: "user", content: messages.map((m) => `${m.role === "user" ? "YOU" : "ASSISTANT"}: ${m.content}`).join("\n") },
    ]);
    if (c.done) break;
    messages.push({ role: "user", content: c.say });
    transcript.push(`Клиент: ${c.say}`);
    const [code, r] = await api("/api/chat", { id, biz: me.slug, messages });
    if (code !== 200) { transcript.push(`ОШИБКА чата ${code} ${JSON.stringify(r)}`); break; }
    messages.push({ role: "assistant", content: r.reply });
    transcript.push(`Ассистент: ${r.reply}`);
    if (r.booked) booked = true;
  }
  const [, s] = await api("/api/app/state");
  const fresh = s.bookings.filter((b) => !known.has(b.id) && b.status === "confirmed");
  fresh.forEach((b) => known.add(b.id));
  const problems = [];
  if (!fresh.length) problems.push("запись не создана");
  for (const b of fresh) {
    if (!sc.expect.who.includes(b.client_name)) problems.push(`имя «${b.client_name}» (ждали ${sc.expect.who.join("/")})`);
    if (b.phone !== sc.expect.phone) problems.push(`телефон ${b.phone ?? "нет"} (ждали ${sc.expect.phone})`);
    if (sc.expect.date && b.date !== sc.expect.date) problems.push(`дата ${b.date} (ждали ${sc.expect.date})`);
    if (!new RegExp(`^(${sc.expect.service})$`).test(b.service_id)) problems.push(`услуга ${b.service_id} (ждали ${sc.expect.service})`);
  }
  if (sc.expect.who.length > 1 && fresh.length !== sc.expect.who.length) problems.push(`записей ${fresh.length}, ждали ${sc.expect.who.length}`);
  report.push({ sc: sc.name, ok: !problems.length, problems, bookings: fresh.map((b) => `B-${1000 + b.id} ${b.client_name} ${b.phone} ${b.date} ${String(Math.floor(b.start_min / 60)).padStart(2, "0")}:${String(b.start_min % 60).padStart(2, "0")} ${b.service_id}`), transcript });
  console.log(`\n=== ${sc.name}: ${problems.length ? "✗ " + problems.join("; ") : "✓"}`);
  for (const l of transcript) console.log("   " + l);
  for (const b of report.at(-1).bookings) console.log("   → " + b);
}

// clean up: test bookings cancelled (they stay visible, crossed out, in the calendar)
for (const id of known) if (!s0.bookings.some((b) => b.id === id)) await api(`/api/app/bookings/${id}/cancel`, {});
console.log(`\nflows ok ${report.filter((r) => r.ok).length}/${report.length}; client-model cost ≈ $${cost.toFixed(2)}`);
