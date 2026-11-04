#!/usr/bin/env node
// Grammar sweep: a model plays a client in the website chat of the demo barbershop for several turns, then
// gpt-6-astra lists ONLY the assistant's Armenian grammar / wording mistakes. Stops at a spend limit.
//   LIMIT=2.8 node scripts/grammar-sweep.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://umnik.weboostai.workers.dev";
const LIMIT = Number(process.env.LIMIT ?? 2.8);
const CHAT_STEP = 0.0045; // measured average per chat reply with tools (gpt-6.1-terra)
let spent = 0;

const GOALS = [
  // easy
  "Ուզում ես վաղը առավոտյան մազերդ կտրել։ Անունդ Արամ է, համարդ՝ 099 11 22 33։",
  "Հարցնում ես մորուքի մշակման գինը և որքան է տևում, հետո գրանցվում ես ամենամոտ ազատ ժամին։ Անունդ Գոռ է, համարդ՝ 077 12 34 56։",
  "Հարցնում ես աշխատանքային ժամերը կիրակի և երկուշաբթի, հետո ասում ես՝ կմտածես։",
  "Ուզում ես ֆեյդ անել այսօր երեկոյան, եթե չէ՝ վաղը։ Անունդ Տիգրան է, համարդ՝ 091 45 67 89։",
  "Հարցնում ես, թե ինչ ծառայություններ ունեն և ամենաէժանը որն է։",
  "Ուզում ես երեխայիդ համար կտրվածք շաբաթ օրը։ Անունդ Լուսինե է (կին ես), համարդ՝ 093 22 11 00։",
  "Ուզում ես մազերդ ներկել, հարցնում ես գինը և երբ կարող ես գալ։ Անունդ Սամվել է, համարդ՝ 098 76 54 32։",
  "Բարևում ես, հարցնում ես հասցեն, հետո շնորհակալություն ես հայտնում և հրաժեշտ տալիս։",
  "Ուզում ես գլուխդ զրո սափրել վաղը ժամը 3-ին։ Անունդ Վահե է, համարդ՝ 094 55 66 77։",
  "Ուզում ես կտրվածք և հարդարում հարսանիքից առաջ, շաբաթ ժամը 11-ին։ Անունդ Դավիթ է, համարդ՝ 099 00 11 22։",
  // medium
  "Դու ու ընկերդ եք ուզում գալ վաղը ժամը 4-ին․ քեզ մազ ու թրաշ, ընկերոջդ՝ մենակ ֆեյդ։ Քո անունը Արման է, ընկերոջդ՝ Հայկ, համարդ՝ 099 33 44 55։",
  "Սկզբում ասում ես վաղը, հետո փոխում ես՝ վաղը չէ մյուս օրը, ժամը 6-ին։ Մազ կտրել։ Անունդ Նարեկ է, համարդ՝ 091 12 12 12։",
  "Հարցնում ես՝ հենց հիմա կարո՞ղ ես գալ, եթե չէ՝ որն է ամենամոտ ժամը։ Թրաշ։ Անունդ Էդգար է, համարդ՝ 077 98 98 98։",
  "Ուզում ես նոյեմբերի 10-ին երեկոյան ֆեյդ անել։ Անունդ Կարեն է, համարդ՝ 093 10 20 30։",
  "Մի քանի հարց միանգամից ես տալիս՝ գինը, տևողությունը, քարտով վճարում, և վաղը առավոտ ազատ ժամ։ Հետո գրանցվում ես։ Անունդ Մհեր է, համարդ՝ 098 11 99 88։",
  "Գրանցվում ես մորուքի համար, հետո հիշում ես, որ մազերդ էլ ես ուզում կտրել և խնդրում ես ավելացնել։ Անունդ Հովհաննես է, համարդ՝ 094 44 33 22։",
  "Ասում ես, որ համարդ ուրիշ է, ու մի թվով սխալ ես թելադրում (10 թիվ), հետո ուղղում ես՝ 099 27 22 77։ Մազ կտրել վաղը ժամը 12-ին։ Անունդ Աշոտ է։",
  "Հարցնում ես, արդյոք կարող ես գալ շանդ հետ, և արդյոք կա սուրճ, հետո գրանցվում ես մազ կտրելու երեքշաբթի։ Անունդ Գևորգ է, համարդ՝ 099 13 13 13։",
  "Խոսում ես ռուսերեն․ хочешь записаться на стрижку бороды в пятницу вечером. Имя Артур, номер 091 23 45 67.",
  "Ուզում ես առանց գրանցման գալ և հարցնում ես՝ որքան ես սպասելու, հետո համաձայնում ես գրանցվել վաղը ժամը 2-ին։ Անունդ Արթուր է, համարդ՝ 077 45 45 45։",
  // hard
  "Ուժեղ ժարգոնով ես գրում (ախպեր ջան, էգուց, կարամ, թրաշս դզեմ), ուզում ես էգուց երեկոյան թրաշ ու մազ, միայն թե մինչև յոթը պրծնես։ Անունդ Սաքո է, համարդ՝ 099 77 88 99։",
  "Ուզում ես ամենաշուտ ազատ ժամը, բայց միայն ցերեկը, և ոչ երկուշաբթի։ Մազ ու թրաշ։ Անունդ Ռուբեն է, համարդ՝ 091 55 44 33։",
  "Երեք հոգով եք ուզում գալ շաբաթ օրը, բոլորը կտրվածք։ Համաձայն ես իրար հետևից։ Անուններ՝ Արամ, Դավիթ, Հայկ։ Համարդ՝ 098 00 99 00։",
  "Դժգոհ ես անցած անգամվա կտրվածքից, կոպիտ ես գրում, բայց հետո համաձայնում ես նորից գալ ուրիշ օր։ Անունդ Վարդան է, համարդ՝ 093 66 55 44։",
  "Հարցնում ես շատ անսովոր բաներ՝ վաճառու՞մ են մազի յուղ, կա՞ նվեր քարտ, կարո՞ղ ես տնից կանչել բարբերին։",
  "Ժամը մի քանի անգամ ես փոխում՝ նախ 3, հետո 5, հետո ասում ես՝ ամենաուշը որն է։ Ֆեյդ։ Անունդ Լևոն է, համարդ՝ 077 11 11 22։",
  "Խառը լեզվով ես գրում՝ հայերեն լատինատառ և ռուսերեն բառեր (zavtra, strizhka, borodas)։ Ուզում ես էգուց ժամը 11-ին մազ ու մորուք։ Անունդ Իգոր է, համարդ՝ 091 88 77 66։",
  "Ուզում ես տղայիդ և քեզ միաժամանակ, տղային՝ երեխայի կտրվածք, քեզ՝ մեքենայով կտրվածք, և հարցնում ես ընդհանուր գինը։ Անունդ Արտակ է, տղայինը՝ Էրիկ, համարդ՝ 094 12 21 12։",
  "Գրանցվելուց հետո հարցնում ես՝ ո՞ր ժամին ես գրանցված, իսկ հետո խնդրում ես ժամը մեկ ժամով ուշ տեղափոխել։ Թրաշ, վաղը ժամը 1-ին։ Անունդ Սուրեն է, համարդ՝ 099 31 31 31։",
  "Շատ երկար, խճճված մի նախադասությամբ ես ամեն ինչ ասում՝ ով ես, ինչ ես ուզում, երբ, ինչ սահմանափակում ունես, և երկու հարց։ Մազ ու թրաշ, շաբաթ կամ կիրակի, ցերեկը։ Անունդ Մանվել է, համարդ՝ 093 70 70 70։",
];

async function openai(body) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(d).slice(0, 200));
  return d;
}

const client = async (goal, transcript) => {
  const d = await openai({ model: "gpt-6.1-terra", reasoning_effort: "none", response_format: { type: "json_object" }, messages: [
    { role: "system", content: `You play a client chatting with a barbershop's website chat. Goal: ${goal}\nWrite like a real person (short, natural; Armenian in Latin or Armenian letters, slang if the goal says so). Give name/phone only when asked. When your goal is done or the assistant confirmed a booking, set done true. JSON {"say":"...","done":false}` },
    { role: "user", content: transcript.map((m) => `${m.role === "user" ? "YOU" : "ASSISTANT"}: ${m.content}`).join("\n") },
  ] });
  spent += (d.usage.prompt_tokens * 2 + d.usage.completion_tokens * 8) / 1e6;
  return JSON.parse(d.choices[0].message.content);
};

const RUBRIC = `You are a strict native editor of Eastern Armenian. Below is a chat between a CLIENT and a barbershop's ASSISTANT. Check ONLY the ASSISTANT's lines for language mistakes: grammar (cases, articles «ը/ն», verb forms, agreement), wrong or unnatural word forms («ամենաշուտ ազատ է» → «ամենաշուտը ազատ է»), calques from Russian/English, informal «դու»/«-դ» forms (must be polite «Դուք»), slang, English/Russian words in Armenian letters, awkward or robotic phrasing, punctuation that is clearly wrong. Russian replies (to a Russian-speaking client) — check them as Russian. Ignore facts, times, prices and logic. Ignore the CLIENT. Return JSON {"errors":[{"quote":"exact assistant words","problem":"short, in Russian","fix":"corrected wording"}]} — empty list if the Armenian is correct. Don't flag correct things or matters of taste.`;

const out = [];
for (const [i, goal] of GOALS.entries()) {
  if (spent >= LIMIT) { console.log(`\nSTOP: spend limit $${LIMIT} reached`); break; }
  const id = `gram-${Date.now().toString(36)}`;
  const messages = [{ role: "assistant", content: "Բարև ձեզ, Blade Barbershop, ես Անին եմ։ Ինչո՞վ օգնեմ։" }];
  for (let turn = 0; turn < 6; turn++) {
    const c = await client(goal, messages);
    if (c.done) break;
    messages.push({ role: "user", content: c.say });
    const r = await (await fetch(`${SITE}/api/chat`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify({ id, messages }) })).json();
    spent += CHAT_STEP * 2; // a reply often takes a tool round too
    messages.push({ role: "assistant", content: r.reply ?? `[error ${r.error}]` });
  }
  const d = await openai({ model: "gpt-6-astra", reasoning_effort: "low", response_format: { type: "json_object" }, messages: [{ role: "system", content: RUBRIC }, { role: "user", content: messages.map((m) => `${m.role === "user" ? "CLIENT" : "ASSISTANT"}: ${m.content}`).join("\n") }] });
  const cached = d.usage.prompt_tokens_details?.cached_tokens ?? 0;
  spent += ((d.usage.prompt_tokens - cached) * 10 + cached * 1 + d.usage.completion_tokens * 50) / 1e6;
  const errors = JSON.parse(d.choices[0].message.content).errors ?? [];
  out.push({ i: i + 1, goal, errors, transcript: messages });
  console.log(`#${i + 1} ${errors.length ? `✗ ${errors.length}` : "✓"}  ($${spent.toFixed(2)})`);
  for (const e of errors) console.log(`   «${e.quote}» → «${e.fix}» — ${e.problem}`);
}
// demo test bookings made by these chats are cancelled
execFileSync("npx", ["wrangler", "d1", "execute", "barber-voice-agent", "--remote", "--command", "UPDATE bookings SET status='cancelled' WHERE business_id=1 AND conversation_id LIKE 'chat-gram-%' AND status='confirmed'"], { cwd: join(ROOT, "backend"), stdio: "ignore" });
mkdirSync(join(ROOT, "scripts/bench-out"), { recursive: true });
writeFileSync(join(ROOT, `scripts/bench-out/grammar-${Date.now()}.json`), JSON.stringify(out, null, 2));
console.log(`\nconversations ${out.length}, with errors ${out.filter((o) => o.errors.length).length}, total errors ${out.reduce((t, o) => t + o.errors.length, 0)}; spent ≈ $${spent.toFixed(2)}`);
