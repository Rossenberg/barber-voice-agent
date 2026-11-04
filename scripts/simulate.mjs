#!/usr/bin/env node
// Text-only test calls against the real agent: a simulated client (another LLM) talks to the assistant.
// check_availability hits the live backend; create_booking is mocked so tests don't fill the calendar.
//   node scripts/simulate.mjs            (all scenarios)
//   node scripts/simulate.mjs 2          (only scenario #2)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { agent_id } = JSON.parse(readFileSync(join(ROOT, "agent/elevenlabs.json"), "utf8"));
const SITE = "https://umnik.weboostai.workers.dev";

const SCENARIOS = [
  {
    lang: "hy",
    first: "Ախպեր ջան, բարև, էգուց ժամը 11-ին կարամ գամ մազերս կտրեմ։",
    prompt: "Դու տղա ես, որ զանգում ես բարբերշոփ։ Խոսիր միայն երևանյան խոսակցական հայերենով, շատ կարճ, ժարգոնով (ախպեր ջան, հա, էգուց, կարամ)։ Ուզում ես վաղը 11-ին մազերդ կտրել։ Եթե հարցնեն անունդ՝ Արամ։ Եթե հարցնեն պահե՞լ համարդ՝ ասա «հա, պահի»։ Վերջում ասա «մերսի, ախպեր» և հրաժեշտ տուր։",
  },
  {
    lang: "hy",
    first: "Բարև, թրաշս դզեմ ինչ արժե՞։",
    prompt: "Դու զանգում ես բարբերշոփ։ Խոսիր կարճ, խոսակցական հայերենով։ Նախ հարցրու մորուքի մշակման («թրաշս դզեմ») գինը։ Հետո հարցրու՝ մազերս էլ կտրեմ հետը, ընդհանուր ինչքա՞ն կլինի։ Հետո ասա «լավ, հետո կզանգեմ» և հրաժեշտ տուր։",
  },
  {
    lang: "hy",
    first: "Բարև ձեզ, էսօր երեկոյան ֆեյդ անել կարա՞մ, մոտ յոթին։",
    prompt: "Դու զանգում ես բարբերշոփ, խոսիր կարճ, խոսակցական հայերենով։ Ուզում ես այսօր երեկոյան մոտ ժամը 7-ին ֆեյդ անել։ Եթե առաջարկեն մեկ այլ ժամ, համաձայնիր։ Անունդ Դավիթ է։ Երբ հարցնեն համարի մասին, ասա, որ ուրիշ համար գրեն՝ զրո իննսունինը, տասներկու, երեսունչորս, հիսունվեց։ Հետո հրաժեշտ տուր։",
    caller: "unknown",
  },
  {
    lang: "hy",
    first: "Hi, can I book a fade for tomorrow at 6 pm?",
    prompt: "You call a barbershop and speak only English, briefly. Book a fade tomorrow at 6 pm; if it's not free accept the closest time. Your name is Mike. Agree to save the number you're calling from. Then say thanks, bye.",
  },
];

async function api(method, path, body) {
  const res = await fetch("https://api.elevenlabs.io" + path, { method, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 800)}`);
  return JSON.parse(text);
}

// Same dynamic variables the landing page sends.
const cfg = await (await fetch(`${SITE}/api/public/config`)).json();
const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(cfg.today + "T00:00:00Z").getUTCDay()];
const vars = (caller) => ({
  assistant_name: "Անի",
  shop_name: cfg.shop_name,
  address: cfg.address,
  greeting: cfg.greeting.replaceAll("{shop}", cfg.shop_name).replaceAll("{name}", "Անի"),
  today: `${cfg.today} (${weekday})`,
  hours: cfg.hours_text,
  services: cfg.services_text,
  extra_instructions: cfg.extra_instructions || "-",
  caller_phone: caller ?? "+37491234567",
  system__conversation_id: "simulation",
});

const only = Number(process.argv[2]);
for (const [i, sc] of SCENARIOS.entries()) {
  if (only && only !== i + 1) continue;
  const t0 = Date.now();
  try {
    const res = await api("POST", `/v1/convai/agents/${agent_id}/simulate-conversation`, {
      simulation_specification: {
        simulated_user_config: { first_message: sc.first, language: sc.lang, prompt: { prompt: sc.prompt, llm: "gemini-3.5-flash" } },
        tool_mock_config: { create_booking: { default_return_value: JSON.stringify({ success: true, booking_id: "B-1042", phone_saved: true }) } },
        dynamic_variables: vars(sc.caller),
      },
      new_turns_limit: 16,
    });
    console.log(`\n=== #${i + 1} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    for (const turn of res.simulated_conversation) {
      for (const c of turn.tool_calls || []) console.log(`   [${c.tool_name} ${c.params_as_json ?? ""}]`);
      if (turn.message) console.log(`${turn.role === "agent" ? "ԻԻ " : "ՀԱՃ"}: ${turn.message}`);
    }
  } catch (e) {
    console.log(`\n=== #${i + 1}: ERROR ${e.message}`);
  }
}
