import PHRASEBOOK from "../../agent/phrasebook-hy.md"; // shared with the ElevenLabs agent (scripts/setup-elevenlabs.mjs)
import {
  addDays,
  checkToken,
  cleanText,
  daysBetween,
  isDate,
  json,
  localNow,
  makeToken,
  normalizePhone,
  parseHHMM,
  safeEqual,
  toHHMM,
  weekdayName,
  weekdayOf,
} from "./util";

interface Env {
  DB: D1Database;
  TOOL_SECRET: string; // ElevenLabs webhook tools send "Authorization: Bearer <TOOL_SECRET>"
  ADMIN_PASSWORD: string; // dashboard login
  SESSION_SECRET: string; // signs dashboard session tokens
  GEMINI_API_KEY: string; // speech-to-text (ElevenLabs' realtime recognition is weak on spoken Armenian)
  ELEVENLABS_API_KEY: string; // fallback speech-to-text (Scribe) when Gemini stalls
  AZURE_SPEECH_KEY: string; // candidate speech-to-text with native hy-AM (compared on /lab/)
  AZURE_SPEECH_REGION: string;
  OPENAI_API_KEY: string; // candidate speech-to-text and the Realtime (speech-to-speech) test page
}

interface Settings {
  enabled: boolean;
  shop_name: string;
  shop_name_spoken?: string; // the name in Armenian letters, so the voice doesn't say it with an English accent
  address: string;
  greeting: string; // {shop} and {name} are filled in by the landing page
  barbers: number; // how many clients can be served at the same time
  hours: ([number, number] | null)[]; // index 0 = Sunday; minutes since midnight; null = closed
  extra_instructions: string;
}

interface Service {
  id: string;
  category: string;
  name_hy: string;
  name_en: string;
  duration_min: number;
  price_min: number;
  price_max: number | null;
  active: number;
  sort: number;
}

const GRID_MIN = 30; // appointments start on :00 and :30 (every service is 30 min, two services 60)
const MIN_NOTICE_MIN = 30; // no bookings starting within the next half hour
const MAX_DAYS_AHEAD = 60;
const SESSION_TTL_MS = 30 * 86_400_000;
const CATEGORIES = ["main", "combo", "color"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- data

async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare("SELECT data FROM settings WHERE id = 1").first<{ data: string }>();
  return JSON.parse(row!.data);
}

async function getServices(db: D1Database, activeOnly: boolean): Promise<Service[]> {
  const sql = `SELECT * FROM services ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort, name_en`;
  return (await db.prepare(sql).all<Service>()).results;
}

const priceText = (s: Service) => (s.price_max ? `${s.price_min}–${s.price_max} AMD` : `${s.price_min} AMD`);

/** The price list and hours as plain text for the assistant's prompt. */
function promptFacts(settings: Settings, services: Service[]) {
  const servicesText = services.map((s) => `- ${s.id} | ${s.name_hy} | ${s.name_en} | ${s.duration_min} min | ${priceText(s)}`).join("\n");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const hoursText = settings.hours.map((h, i) => `${days[i]}: ${h ? `${toHHMM(h[0])}–${toHHMM(h[1])}` : "closed"}`).join("; ");
  return { servicesText, hoursText };
}

// ---------------------------------------------------------------- availability

type ClosedReason = "past" | "too_far" | "closed_weekday";

function closedReason(settings: Settings, date: string): ClosedReason | null {
  const today = localNow().date;
  if (date < today) return "past";
  if (daysBetween(today, date) > MAX_DAYS_AHEAD) return "too_far";
  if (!settings.hours[weekdayOf(date)]) return "closed_weekday";
  return null;
}

/** Free start times (minutes since midnight) on a date for a service of the given length.
 * `people` > 1: a group coming together needs that many free chairs at the same time. */
async function freeStarts(db: D1Database, settings: Settings, date: string, durationMin: number, people = 1): Promise<number[]> {
  if (closedReason(settings, date)) return [];
  const [open, close] = settings.hours[weekdayOf(date)]!;
  const { results } = await db
    .prepare("SELECT start_min, end_min FROM bookings WHERE date = ? AND status = 'confirmed'")
    .bind(date)
    .all<{ start_min: number; end_min: number }>();

  const now = localNow();
  const earliest = date === now.date ? now.minutes + MIN_NOTICE_MIN : 0;
  const starts: number[] = [];
  for (let s = Math.ceil(open / GRID_MIN) * GRID_MIN; s + durationMin <= close; s += GRID_MIN) {
    if (s < earliest) continue;
    const e = s + durationMin;
    if (results.filter((b) => b.start_min < e && b.end_min > s).length + people <= settings.barbers) starts.push(s);
  }
  return starts;
}

// Times in words, exactly as the phrasebook says them, so the assistant reads them instead of composing
// (it got 13:30 wrong as «տասներկուսն անց կեսին» when it had to convert digits itself).
const HOUR_AT = ["", "մեկին", "երկուսին", "երեքին", "չորսին", "հինգին", "վեցին", "յոթին", "ութին", "իննին", "տասին", "տասնմեկին", "տասներկուսին"];
const HOUR_PAST = ["", "մեկն", "երկուսն", "երեքն", "չորսն", "հինգն", "վեցն", "յոթն", "ութն", "ինն", "տասն", "տասնմեկն", "տասներկուսն"];
const MINUTES_AT: Record<number, string> = { 15: "տասնհինգին", 30: "կեսին", 45: "քառասունհինգին" };

function timeHy(min: number): string {
  const h12 = Math.floor(min / 60) % 12 || 12;
  const m = min % 60;
  if (m === 0) return `ժամը ${HOUR_AT[h12]}`;
  return `${HOUR_PAST[h12]} անց ${MINUTES_AT[m] ?? `${m} րոպեին`}`;
}
const hy = (times: string[]) => times.map((t) => timeHy(parseHHMM(t)!));

const PARTS_OF_DAY: Record<string, [number, number]> = { morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60] };

const nearest = (starts: number[], target: number, count = 3) =>
  [...starts].sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, count).sort((a, b) => a - b).map(toHHMM);

/** Up to `max` times spread across the day. */
function spread(starts: number[], max = 6): string[] {
  if (starts.length <= max) return starts.map(toHHMM);
  const step = starts.length / max;
  return Array.from({ length: max }, (_, i) => toHHMM(starts[Math.floor(i * step)]));
}

async function nextOpenDays(db: D1Database, settings: Settings, date: string, durationMin: number, count = 2) {
  const out: { date: string; weekday: string; times: string[]; times_hy: string[] }[] = [];
  for (let i = 1; i <= 14 && out.length < count; i++) {
    const d = addDays(date, i);
    const starts = await freeStarts(db, settings, d, durationMin);
    if (starts.length) {
      const times = spread(starts, 3);
      out.push({ date: d, weekday: weekdayName(d), times, times_hy: hy(times) });
    }
  }
  return out;
}

function findService(services: Service[], id: unknown): Service | undefined {
  const key = typeof id === "string" ? id.trim().toLowerCase() : "";
  return services.find((s) => s.id === key);
}

// Two services that have a cheaper combo on the price list are booked as that combo.
const COMBOS: Record<string, string> = {
  "beard_trim+haircut": "haircut_beard",
  "beard_trim+fade_cut": "fade_beard",
  "beard_trim+buzz_cut": "buzz_beard",
  "haircut+shave": "haircut_shave",
  "buzz_cut+shave": "buzz_shave",
  "beard_trim+head_shave": "head_shave_beard",
  "head_shave+shave": "head_shave_shave",
};

/**
 * One person can want several services («haircut, beard and then styling»): service_id may hold several
 * ids joined with "+" or ",". They become one appointment whose length and price are the sums.
 */
function resolveServices(services: Service[], raw: unknown): Service | undefined {
  const ids = (typeof raw === "string" ? raw : "").split(/[+,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  let picked = ids.map((id) => findService(services, id)).filter((x): x is Service => Boolean(x));
  if (!picked.length || picked.length !== ids.length) return undefined;
  for (const [pair, comboId] of Object.entries(COMBOS)) {
    const [a, b] = pair.split("+");
    const combo = findService(services, comboId);
    if (combo && picked.some((p) => p.id === a) && picked.some((p) => p.id === b)) {
      picked = [combo, ...picked.filter((p) => p.id !== a && p.id !== b)];
    }
  }
  if (picked.length === 1) return picked[0];
  return {
    ...picked[0],
    id: picked.map((p) => p.id).join("+"),
    // «Կտրվածք + մորուքի մշակում + հարդարում»: only the first name keeps its capital letter
    name_hy: picked.map((p, i) => (i ? p.name_hy.charAt(0).toLowerCase() + p.name_hy.slice(1) : p.name_hy)).join(" + "),
    name_en: picked.map((p, i) => (i ? p.name_en.charAt(0).toLowerCase() + p.name_en.slice(1) : p.name_en)).join(" + "),
    duration_min: picked.reduce((t, p) => t + p.duration_min, 0),
    price_min: picked.reduce((t, p) => t + p.price_min, 0),
    price_max: picked.some((p) => p.price_max) ? picked.reduce((t, p) => t + (p.price_max ?? p.price_min), 0) : null,
  };
}

// ---------------------------------------------------------------- assistant tools

const DISABLED = { success: false, error: "assistant_disabled", message: "The barbershop has switched the assistant off. Apologize and ask the client to call back later." };

async function checkAvailability(env: Env, body: Record<string, unknown>) {
  const settings = await getSettings(env.DB);
  if (!settings.enabled) return DISABLED;
  const services = await getServices(env.DB, true);
  const service = resolveServices(services, body.service_id) ?? findService(services, "haircut") ?? services[0];
  const date = body.date;
  if (!isDate(date)) return { success: false, error: "bad_date", message: "Use YYYY-MM-DD.", today: localNow().date };

  const base = {
    date,
    weekday: weekdayName(date),
    today: localNow().date,
    service: { id: service.id, name: service.name_hy, duration_min: service.duration_min, price: service.price_max ? `${service.price_min}-${service.price_max} AMD` : `${service.price_min} AMD` },
    barbers: settings.barbers, // how many people can be served at the same time
  };
  const people = Math.min(Math.max(1, Math.round(Number(body.people) || 1)), 10);
  if (people > settings.barbers) {
    return { ...base, open: true, error: "too_many_people", message: `Only ${settings.barbers} people can be served at the same time: check them one after the other (people = ${settings.barbers} or 1).` };
  }
  const closed = closedReason(settings, date);
  if (closed) return { ...base, open: false, reason: closed, next_free_days: closed === "too_far" ? [] : await nextOpenDays(env.DB, settings, date, service.duration_min) };

  const starts = await freeStarts(env.DB, settings, date, service.duration_min, people);
  const requested = parseHHMM(body.time);
  if (requested !== null) {
    // "At 11" asked late in the day: say it has passed and look at the same time tomorrow.
    if (date === localNow().date && requested <= localNow().minutes) {
      const tomorrow = addDays(date, 1);
      const tStarts = await freeStarts(env.DB, settings, tomorrow, service.duration_min);
      const tFree = tStarts.includes(requested);
      const tNear = tFree ? [] : nearest(tStarts, requested);
      return {
        ...base,
        open: true,
        requested_time: toHHMM(requested),
        requested_time_hy: timeHy(requested),
        requested_time_passed: true,
        same_time_tomorrow: { date: tomorrow, weekday: weekdayName(tomorrow), free: tFree, ...(tFree ? {} : { nearest_free_times: tNear, nearest_free_times_hy: hy(tNear) }) },
      };
    }
    const free = starts.includes(requested);
    const near = free ? [] : nearest(starts, requested);
    return {
      ...base,
      open: true,
      requested_time: toHHMM(requested),
      requested_time_hy: timeHy(requested),
      requested_time_free: free,
      ...(free ? {} : { nearest_free_times: near, nearest_free_times_hy: hy(near) }),
      ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, settings, date, service.duration_min) }),
    };
  }
  // "Is there anything tomorrow morning?" — filter by part of day, and say what's free otherwise.
  const part = typeof body.part_of_day === "string" ? PARTS_OF_DAY[body.part_of_day] : undefined;
  if (part) {
    const inPart = starts.filter((m) => m >= part[0] && m < part[1]);
    return {
      ...base,
      open: true,
      part_of_day: body.part_of_day,
      free_times: spread(inPart, 4),
      free_times_hy: hy(spread(inPart, 4)),
      ...(inPart.length ? {} : { other_free_times_that_day: spread(starts, 3), other_free_times_that_day_hy: hy(spread(starts, 3)) }),
      ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, settings, date, service.duration_min) }),
    };
  }
  return {
    ...base,
    open: true,
    free_times: spread(starts),
    free_times_hy: hy(spread(starts)),
    ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, settings, date, service.duration_min) }),
  };
}

async function insertBooking(env: Env, service: Service, date: string, start: number, fields: { name: string; phone: string | null; source: string; conversationId: string }) {
  const res = await env.DB.prepare(
    "INSERT INTO bookings (service_id, service_name, date, start_min, end_min, client_name, phone, source, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(service.id, service.name_hy, date, start, start + service.duration_min, fields.name || null, fields.phone, fields.source, fields.conversationId || null)
    .first<{ id: number }>();
  return `B-${1000 + res!.id}`;
}

async function createBooking(env: Env, body: Record<string, unknown>) {
  const settings = await getSettings(env.DB);
  if (!settings.enabled) return DISABLED;
  const service = resolveServices(await getServices(env.DB, true), body.service_id);
  if (!service) return { success: false, error: "unknown_service", message: "Use service ids from the price list (several joined with +)." };
  const date = body.date;
  const start = parseHHMM(body.time);
  if (!isDate(date) || start === null) return { success: false, error: "bad_date_or_time", message: "Use YYYY-MM-DD and HH:MM." };

  const starts = await freeStarts(env.DB, settings, date, service.duration_min);
  if (!starts.includes(start)) {
    const near = nearest(starts, start);
    return { success: false, error: "slot_taken", message: "This time is not free any more.", nearest_free_times: near, nearest_free_times_hy: hy(near) };
  }
  const phone = normalizePhone(body.phone);
  const bookingId = await insertBooking(env, service, date, start, {
    name: cleanText(body.client_name, 60),
    phone,
    source: "assistant",
    conversationId: cleanText(body.conversation_id, 80),
  });
  return { success: true, booking_id: bookingId, phone_saved: Boolean(phone), summary: `${service.name_hy}, ${weekdayName(date)} ${date} ${toHHMM(start)}` };
}

// ---------------------------------------------------------------- speech-to-text

// Picked on the user's live voice at /lab/ (14 phrases): Gemini 3.5 Flash-Lite was the most accurate on
// spoken Armenian and barbershop slang (1.3–1.5 s); Azure hy-AM was fastest (0.5–1 s) but garbled slang
// like «թրաշ դզել». Both start at once; Gemini's text wins if it arrives within GEMINI_WAIT_MS,
// otherwise Azure's. (Gemini Flash only allows 5 requests/min on this key; Scribe was weakest.)
const STT_MODEL = "gemini-3.5-flash-lite";
const GEMINI_WAIT_MS = 2000;
const STT_TIMEOUT_MS = 8000;
const MAX_AUDIO_BYTES = 1_000_000; // ~30 s of 16 kHz mono WAV

// Deliberately no hints about what the assistant just asked: in testing that made the model invent
// phone digits that were never said.
const STT_PROMPT = [
  "Transcribe this phone-call utterance verbatim. The caller is phoning a barbershop in Yerevan.",
  "They usually speak colloquial Eastern Armenian (slang like ախպեր ջան, էգուց, կարամ գամ, թրաշս դզեմ, ֆեյդ, մաշինկայով), sometimes Russian or English.",
  "Words you will often hear: վաղը, էգուց, էսօր, ժամը, տասնմեկին, կեսին, անց, ազատ, տեղ, կտրվածք, ֆեյդ, մորուք, թրաշ, սափրում, գրանցել, պահել, հեռախոսահամար, համարը, անունս, հա, չէ.",
  "Write Armenian in Armenian script, Russian in Cyrillic, English in Latin. Write numbers as words, exactly as spoken.",
  "Never add, guess or complete words that were not clearly said.",
  "Output only the transcript. If there is no clear speech (noise, silence, breathing), output exactly: -",
].join("\n");

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// New Gemini API keys can't use generateContent with these models any more (404), only the
// Interactions API.
async function geminiTranscript(env: Env, model: string, audioB64: string, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { type: "text", text: STT_PROMPT },
        { type: "audio", data: audioB64, mime_type: "audio/wav" },
      ],
      generation_config: { temperature: 0, thinking_level: "minimal" },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`${model} ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { steps?: { type: string; content?: { type: string; text?: string }[] }[] };
  return (data.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .map((c) => c.text ?? "")
    .join(" ")
    .trim();
}

async function scribeTranscript(env: Env, audio: Uint8Array, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", "hy");
  form.append("file", new Blob([audio], { type: "audio/wav" }), "phrase.wav");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: form, signal });
  if (!res.ok) throw new Error(`scribe ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (((await res.json()) as { text?: string }).text ?? "").trim();
}

async function azureTranscript(env: Env, audio: Uint8Array, signal: AbortSignal): Promise<string> {
  const res = await fetch(
    `https://${env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=hy-AM&format=simple`,
    { method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "content-type": "audio/wav; codecs=audio/pcm; samplerate=16000" }, body: audio, signal },
  );
  if (!res.ok) throw new Error(`azure ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (((await res.json()) as { DisplayText?: string }).DisplayText ?? "").trim();
}

async function openaiTranscript(env: Env, model: string, audio: Uint8Array, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  form.append("language", "hy");
  form.append("file", new Blob([audio], { type: "audio/wav" }), "phrase.wav");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form, signal });
  if (!res.ok) throw new Error(`openai ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (((await res.json()) as { text?: string }).text ?? "").trim();
}

/** /lab/: the same phrase through every recognizer, each with its own timing, to pick one on real voices. */
async function compareTranscripts(env: Env, req: Request): Promise<Response> {
  const audio = new Uint8Array(await req.arrayBuffer());
  if (audio.length < 1000 || audio.length > MAX_AUDIO_BYTES) return json({ error: "bad_audio" }, 400);
  const audioB64 = base64(audio);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 30_000);
  const run = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      return { name, text: await fn(), ms: Date.now() - t0 };
    } catch (err) {
      return { name, error: String(err).slice(0, 120), ms: Date.now() - t0 };
    }
  };
  const results = await Promise.all([
    run("Azure (hy-AM)", () => azureTranscript(env, audio, abort.signal)),
    run("Gemini 3.5 Flash-Lite", () => geminiTranscript(env, "gemini-3.5-flash-lite", audioB64, abort.signal)),
    run("OpenAI gpt-transcribe", () => openaiTranscript(env, "gpt-transcribe", audio, abort.signal)),
    run("OpenAI gpt-4o-transcribe", () => openaiTranscript(env, "gpt-4o-transcribe", audio, abort.signal)),
    run("ElevenLabs Scribe", () => scribeTranscript(env, audio, abort.signal)),
  ]);
  clearTimeout(timeout);
  return json({ results });
}

async function transcribe(env: Env, req: Request): Promise<Response> {
  const audio = new Uint8Array(await req.arrayBuffer());
  if (audio.length < 1000 || audio.length > MAX_AUDIO_BYTES) return json({ error: "bad_audio" }, 400);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), STT_TIMEOUT_MS);
  const tag = (name: string, p: Promise<string>) => p.then((text) => ({ name, text }));
  const gemini = tag(STT_MODEL, geminiTranscript(env, STT_MODEL, base64(audio), abort.signal));
  const azure = tag("azure", azureTranscript(env, audio, abort.signal));
  for (const p of [gemini, azure]) p.catch(() => {}); // the loser's abort isn't an error
  try {
    const early = await Promise.race([gemini, new Promise<null>((r) => setTimeout(() => r(null), GEMINI_WAIT_MS))]).catch(() => null);
    const { name, text } = early ?? (await Promise.any([gemini, azure]));
    // Noise sometimes comes back as "-" or "-00:00": no letters means no speech.
    return json({ text: /\p{L}/u.test(text) ? text : "", model: name });
  } catch (err) {
    console.error("stt failed", err instanceof AggregateError ? err.errors.map(String) : err);
    return json({ error: "stt_failed" }, 502);
  } finally {
    clearTimeout(timeout);
    abort.abort(); // cancel the slower request
  }
}

// ---------------------------------------------------------------- OpenAI Realtime test (/realtime/)

const REALTIME_TOOLS = [
  {
    type: "function",
    name: "check_availability",
    description: "Free times at the barbershop. Call before saying any time is free.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD, Yerevan time" },
        time: { type: "string", description: "Requested start HH:MM (24h), if the caller named a time" },
        part_of_day: { type: "string", enum: ["morning", "afternoon", "evening"], description: "If the caller asked for morning (before 12), afternoon (12-17) or evening (17+)" },
        service_id: { type: "string", description: "Service id from the price list; several for one person joined with + (e.g. haircut+beard_trim+styling). Default haircut." },
        people: { type: "integer", description: "How many people come at the same time (a group). Check with the longest person's services. Default 1." },
      },
      required: ["date"],
    },
  },
  {
    type: "function",
    name: "create_booking",
    description: "Book one person after they agreed to a free time and gave name and phone. For a group, call once per person.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "One person's service(s): one id, or several joined with + (e.g. haircut+beard_trim+styling)" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM" },
        client_name: { type: "string" },
        phone: { type: "string" },
      },
      required: ["service_id", "date", "time"],
    },
  },
];

/**
 * Instructions shared by the voice assistant (/realtime/) and the website chat, so both think the same way:
 * same phrasebook, calendar rules and price list; only how they talk differs (spoken words vs. chat text).
 */
async function assistantInstructions(env: Env, opts: { name: string; callerPhone: string | null; channel: "voice" | "chat" }): Promise<string> {
  const settings = await getSettings(env.DB);
  const { servicesText, hoursText } = promptFacts(settings, await getServices(env.DB, true));
  const { name, callerPhone } = opts;
  const voice = opts.channel === "voice";
  const shop = voice ? settings.shop_name_spoken || settings.shop_name : settings.shop_name;
  return [
    voice
      ? `Your name is ${name}. You answer the phone for the barbershop called exactly «${shop}» in Yerevan${settings.address ? ` (${settings.address})` : ""}. Never change, translate or invent the barbershop's name.`
      : `Your name is ${name}. You answer the website chat of the barbershop called exactly «${shop}» in Yerevan${settings.address ? ` (${settings.address})` : ""}. Never change, translate or invent the barbershop's name.`,
    voice ? "The page has already greeted the caller, so don't greet again; answer what they say." : "The chat already showed a greeting, so don't greet again; answer what they write.",
    "Speak correct, polite, natural Eastern Armenian, like a well-spoken administrator: warm but literate. Always address the caller with the polite «Դուք» (Ձեզ, Ձեր), never «դու», even if the caller speaks informally. Use standard forms («է», «կարող եմ», «վաղը»), not slang («ա», «կարամ», «էգուց», «ախպեր ջան», «ապեր»). Switch to Russian or English only if the caller speaks it.",
    "Use only real Armenian words. Never write English or Russian words in Armenian letters: no «պերֆեկտ», «օքեյ», «սուպեր», «գրեյթ», «նայս», «օկ». Instead say «Շատ լավ», «Հիանալի», «Եղավ», «Լավ», «Իհարկե», «Հա».",
    voice
      ? "Your replies are read aloud by an Armenian voice: write every name, brand or foreign word in Armenian letters (e.g. «ֆեյդ», not «fade»), never in Latin letters."
      : "This is a text chat: the barbershop's name may be written in Latin letters as above.",
    voice
      ? "Be very brief: one short sentence per reply, usually 3-10 words. Ask one thing at a time. Never read the whole price list."
      : "Be brief: one or two short sentences per message. Ask one thing at a time. No markdown, no lists, no emojis. List the whole price list only if they ask for all prices.",
    "Callers' everyday words and slang are mapped to services in the phrasebook below (What callers say → which service). Understand them, never use slang yourself.",
    voice
      ? "Times and prices in words: «ժամը տասնմեկին», «երեքն անց կեսին», «տասը հազար դրամ»."
      : "In the chat write times and prices in digits, they're easier to read: «վաղը ժամը 11:30-ին», «10 000 դրամ». Otherwise follow the phrasebook's wording.",
    PHRASEBOOK,
    "If the caller asks about free time without naming a service, don't ask about the service first: check right away with haircut, and ask the service later only if it matters.",
    voice
      ? "Say «Մեկ րոպե, հիմա կնայեմ։» only in the same turn as a calendar call, never at other moments."
      : "In the chat don't write «Մեկ րոպե, հիմա կնայեմ» — just check the calendar and answer.",
    voice
      ? "Calendar results give every time also in words (fields ending in _hy). Say times by copying those words exactly; never convert digits yourself. If requested_time_passed is true, say «Այդ ժամն այսօր արդեն անցել է» and offer same_time_tomorrow."
      : "Calendar results give times as HH:MM; write them like that. If requested_time_passed is true, say «Այդ ժամն այսօր արդեն անցել է» and offer same_time_tomorrow.",
    "Booking flow: before saying any time is free, call check_availability (date YYYY-MM-DD; time HH:MM if they named one; part_of_day morning/afternoon/evening if they said «առավոտը», «ցերեկը», «երեկոյան»; service_id from the price list, default haircut). Answer only from its result: offer at most three free times, use nearest_free_times / other_free_times_that_day / next_free_days when the asked time isn't free. Then «Գրանցե՞մ»; ask the name; get the phone (see below); then call create_booking and confirm in one sentence. If create_booking says slot_taken, offer nearest_free_times.",
    !voice
      ? "Phone: in the chat NEVER ask for a phone number — the chat already shows the customer's contact. Ignore the phone steps of the phrasebook: after the name, call create_booking right away without a phone."
      : callerPhone
        ? `Caller's phone number (caller ID): ${callerPhone}. Ask «Գրանցե՞մ այն համարով, որից զանգում եք։» — yes → book with ${callerPhone} and ask nothing more about the phone; no → «Ասեք Ձեր հեռախոսահամարը։» and repeat the last two digits.`
        : "The caller's number is unknown: ask «Ասեք Ձեր հեռախոսահամարը։» and repeat the last two digits. If they say «this number» / «the one I'm calling from», explain the number isn't visible and ask them to dictate it.",
    `Today: ${localNow().date} (${weekdayName(localNow().date)}), now ${toHHMM(localNow().minutes)} Yerevan time. Opening hours: ${hoursText}.`,
    `Price list (id | Armenian | English | duration | price) — use only these, never invent services or prices:\n${servicesText}`,
    settings.extra_instructions ? `Extra instructions from the owner: ${settings.extra_instructions}` : "",
  ].filter(Boolean).join("\n");
}

/** Mints a short-lived key so the browser can talk to OpenAI Realtime (speech in, speech out) directly. */
async function realtimeSession(env: Env, req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const voice = params.get("voice") === "male" ? "cedar" : "marin";
  // "text": OpenAI only hears and thinks; the page speaks the reply with ElevenLabs' Armenian voices
  // (OpenAI's own Armenian voice has a strong foreign accent).
  const textOnly = params.get("speech") === "elevenlabs";
  // Caller ID: on a real phone line it comes from the call; the test page lets you type one in.
  const callerPhone = normalizePhone(params.get("caller"));
  // Default effort: "medium" made real calls noticeably slower (2-6 s per reply) for little gain.
  const effort = ["minimal", "low", "medium", "high"].includes(params.get("effort") ?? "") ? params.get("effort")! : null;
  const sttModel = ["gpt-transcribe", "gpt-live-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"].includes(params.get("stt") ?? "") ? params.get("stt")! : "gpt-transcribe";
  const instructions = await assistantInstructions(env, { name: voice === "cedar" ? "Արամ" : "Անի", callerPhone, channel: "voice" });
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions,
        ...(textOnly ? { output_modalities: ["text"] } : {}),
        ...(effort ? { reasoning: { effort } } : {}),
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
        audio: {
          // create_response off: the page first adds the text transcript of the phrase (the model alone
          // mis-heard «մազերս ներկեմ» as washing while gpt-transcribe got it right), then asks for the reply.
          input: { transcription: { model: sttModel, language: "hy" }, turn_detection: { type: "semantic_vad", eagerness: "high", create_response: false } },
          output: { voice },
        },
      },
    }),
  });
  const data = (await res.json()) as { value?: string; error?: { message?: string } };
  if (!res.ok || !data.value) return json({ error: data.error?.message ?? `openai ${res.status}` }, 502);
  return json({ key: data.value, model: "gpt-realtime-2.1" });
}

/** Streams Armenian speech (raw 24 kHz 16-bit PCM) for one reply, for the /realtime/ hybrid mode. */
async function ttsStream(env: Env, req: Request): Promise<Response> {
  const { text, voice } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  const clean = cleanText(text, 500);
  if (!clean) return json({ error: "no_text" }, 400);
  const voiceId = voice === "male" ? "JBFqnCBsd6RMkjVDRZzb" : "Xb7hH8MSUJpSbSDYk0k2"; // George / Alice, as on the agent
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: clean, model_id: "eleven_v4_turbo", language_code: "hy" }),
  });
  if (!res.ok || !res.body) return json({ error: `tts ${res.status} ${(await res.text()).slice(0, 200)}` }, 502);
  return new Response(res.body, { headers: { "content-type": "audio/pcm", "cache-control": "no-store" } });
}

/** Stores one /realtime/ event: a transcript line, an assistant reply, or the audio of a caller's phrase. */
async function realtimeLog(env: Env, req: Request): Promise<Response> {
  const form = await req.formData();
  const callId = cleanText(form.get("call_id"), 64);
  const role = cleanText(form.get("role"), 16);
  const turn = Number(form.get("turn"));
  if (!callId || !["user", "agent", "user_audio", "event", "usage"].includes(role) || !Number.isInteger(turn)) return json({ error: "bad_request" }, 400);
  const file = form.get("audio");
  let audio: ArrayBuffer | null = null, audioType: string | null = null;
  if (file instanceof File) {
    if (file.size > 400_000) return json({ error: "audio_too_big" }, 400);
    audio = await file.arrayBuffer();
    audioType = file.type || "application/octet-stream";
  }
  const latency = form.get("latency_ms") === null ? NaN : Number(form.get("latency_ms"));
  await env.DB.prepare("INSERT INTO realtime_log (call_id, turn, role, text, latency_ms, audio, audio_type) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(callId, turn, role, cleanText(form.get("text"), 4000) || null, Number.isFinite(latency) ? latency : null, audio, audioType)
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- website chat

// Compared on the same Armenian booking chat: gpt-6.1-terra was correct and quick (2-3.5 s);
// gpt-6-luna mixed up times, gpt-5.4-mini booked without a phone and the wrong service, gpt-5.5 was slow (4-6 s).
const CHAT_MODELS = ["gpt-6.1-terra", "gpt-6-luna", "gpt-5.4-mini", "gpt-5.5"];
const CHAT_MODEL = "gpt-6.1-terra";

/** Website chat: same instructions, phrasebook and calendar tools as the voice assistant, in text. */
async function chatReply(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { id?: string; messages?: { role?: string; content?: string }[]; model?: string };
  const chatId = cleanText(body.id, 64) || crypto.randomUUID();
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role as "user" | "assistant", content: cleanText(m.content, 1000) }));
  if (!history.length || history[history.length - 1].role !== "user") return json({ error: "bad_request" }, 400);
  const model = CHAT_MODELS.includes(body.model ?? "") ? body.model! : CHAT_MODEL;

  const conv: Record<string, unknown>[] = [{ role: "system", content: await assistantInstructions(env, { name: "Անի", callerPhone: null, channel: "chat" }) }, ...history];
  const tools = REALTIME_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const logLine = (role: string, text: string, ms?: number) =>
    env.DB.prepare("INSERT INTO realtime_log (call_id, turn, role, text, latency_ms) VALUES (?, ?, ?, ?, ?)").bind(`chat-${chatId}`, history.length, role, text.slice(0, 4000), ms ?? null).run();

  const t0 = Date.now();
  let booked = false;
  for (let round = 0; round < 5; round++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      // GPT-6 only allows function tools in chat completions with reasoning off
      body: JSON.stringify({ model, messages: conv, tools, ...(model.startsWith("gpt-6") ? { reasoning_effort: "none" } : {}) }),
    });
    if (!res.ok) {
      console.error("chat", res.status, (await res.text()).slice(0, 300));
      return json({ error: "chat_failed" }, 502);
    }
    const msg = ((await res.json()) as { choices: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] }).choices[0].message;
    if (msg.tool_calls?.length) {
      conv.push(msg);
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {}
        const result =
          call.function.name === "check_availability"
            ? await checkAvailability(env, args)
            : call.function.name === "create_booking"
              ? await createBooking(env, { ...args, conversation_id: `chat-${chatId}` })
              : { error: "unknown_tool" };
        if (call.function.name === "create_booking" && (result as { success?: boolean }).success) booked = true;
        await logLine("event", `${call.function.name} ${JSON.stringify(args)} → ${JSON.stringify(result).slice(0, 600)}`);
        conv.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const reply = (msg.content ?? "").trim();
    await logLine("user", history[history.length - 1].content);
    await logLine("agent", reply, Date.now() - t0);
    return json({ id: chatId, reply, booked, model });
  }
  return json({ error: "too_many_steps" }, 502);
}

// ---------------------------------------------------------------- dashboard

function validSettings(input: Record<string, unknown>, current: Settings): Settings {
  const s = { ...current };
  if ("enabled" in input) s.enabled = input.enabled === true;
  if ("shop_name" in input) s.shop_name = cleanText(input.shop_name, 60) || current.shop_name;
  if ("shop_name_spoken" in input) s.shop_name_spoken = cleanText(input.shop_name_spoken, 60);
  if ("address" in input) s.address = cleanText(input.address, 120);
  if ("greeting" in input) s.greeting = cleanText(input.greeting, 200) || current.greeting;
  if ("extra_instructions" in input) s.extra_instructions = cleanText(input.extra_instructions, 1500);
  if ("barbers" in input) {
    const n = Number(input.barbers);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new HttpError(400, "barbers must be 1–20");
    s.barbers = n;
  }
  if ("hours" in input) {
    const h = input.hours;
    if (!Array.isArray(h) || h.length !== 7) throw new HttpError(400, "hours must have 7 days");
    s.hours = h.map((d) => {
      if (d === null) return null;
      if (!Array.isArray(d) || d.length !== 2 || !d.every(Number.isInteger) || d[0] < 0 || d[1] > 1440 || d[0] >= d[1]) throw new HttpError(400, "bad hours");
      return [d[0], d[1]] as [number, number];
    });
  }
  return s;
}

function validServices(input: unknown): Service[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 80) throw new HttpError(400, "1–80 services");
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const id = cleanText(r.id, 40).toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(id) || seen.has(id)) throw new HttpError(400, `bad or duplicate id: ${id}`);
    seen.add(id);
    const duration = Number(r.duration_min), min = Number(r.price_min);
    const max = r.price_max === null || r.price_max === "" || r.price_max === undefined ? null : Number(r.price_max);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw new HttpError(400, `bad duration: ${id}`);
    if (!Number.isInteger(min) || min < 0 || min > 10_000_000) throw new HttpError(400, `bad price: ${id}`);
    if (max !== null && (!Number.isInteger(max) || max < min)) throw new HttpError(400, `bad max price: ${id}`);
    const name_hy = cleanText(r.name_hy, 80), name_en = cleanText(r.name_en, 80);
    if (!name_hy && !name_en) throw new HttpError(400, `name required: ${id}`);
    return {
      id,
      category: CATEGORIES.includes(String(r.category)) ? String(r.category) : "main",
      name_hy: name_hy || name_en,
      name_en: name_en || name_hy,
      duration_min: duration,
      price_min: min,
      price_max: max,
      active: r.active === false || r.active === 0 ? 0 : 1,
      sort: i * 10,
    };
  });
}

async function adminState(env: Env) {
  const from = addDays(localNow().date, -7);
  const { results: bookings } = await env.DB.prepare("SELECT * FROM bookings WHERE date >= ? ORDER BY date, start_min LIMIT 500").bind(from).all();
  return { settings: await getSettings(env.DB), services: await getServices(env.DB, false), bookings, today: localNow().date };
}

async function admin(env: Env, req: Request, path: string): Promise<Response> {
  if (path === "/api/admin/login" && req.method === "POST") {
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    if (typeof password !== "string" || !safeEqual(password, env.ADMIN_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json({ error: "wrong_password" }, 401);
    }
    return json({ token: await makeToken(env.SESSION_SECRET, SESSION_TTL_MS) });
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await checkToken(env.SESSION_SECRET, token))) return json({ error: "unauthorized" }, 401);
  const body = req.method === "GET" ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);

  if (path === "/api/admin/state" && req.method === "GET") return json(await adminState(env));

  if (path === "/api/admin/settings" && req.method === "PUT") {
    const settings = validSettings(body, await getSettings(env.DB));
    await env.DB.prepare("UPDATE settings SET data = ?, updated_at = datetime('now') WHERE id = 1").bind(JSON.stringify(settings)).run();
    return json({ settings });
  }

  if (path === "/api/admin/services" && req.method === "PUT") {
    const services = validServices(body.services);
    const insert = env.DB.prepare("INSERT INTO services (id, category, name_hy, name_en, duration_min, price_min, price_max, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM services"),
      ...services.map((s) => insert.bind(s.id, s.category, s.name_hy, s.name_en, s.duration_min, s.price_min, s.price_max, s.active, s.sort)),
    ]);
    return json({ services });
  }

  if (path === "/api/admin/bookings" && req.method === "POST") {
    const settings = await getSettings(env.DB);
    const service = findService(await getServices(env.DB, false), body.service_id);
    const start = parseHHMM(body.time);
    if (!service || !isDate(body.date) || start === null) throw new HttpError(400, "service, date and time are required");
    const starts = await freeStarts(env.DB, settings, body.date, service.duration_min);
    if (!starts.includes(start)) return json({ error: "slot_taken" }, 409);
    const bookingId = await insertBooking(env, service, body.date, start, {
      name: cleanText(body.client_name, 60),
      phone: normalizePhone(body.phone),
      source: "manual",
      conversationId: "",
    });
    return json({ booking_id: bookingId });
  }

  const cancel = /^\/api\/admin\/bookings\/(\d+)\/cancel$/.exec(path);
  if (cancel && req.method === "POST") {
    await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(Number(cancel[1])).run();
    return json({ ok: true });
  }

  return json({ error: "not_found" }, 404);
}

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      // Public: what the landing page needs to start a conversation and show prices.
      if (path === "/api/public/config" && req.method === "GET") {
        const settings = await getSettings(env.DB);
        const services = await getServices(env.DB, true);
        const { servicesText, hoursText } = promptFacts(settings, services);
        return json({
          enabled: settings.enabled,
          shop_name: settings.shop_name,
          shop_name_spoken: settings.shop_name_spoken || settings.shop_name,
          address: settings.address,
          greeting: settings.greeting,
          extra_instructions: settings.extra_instructions,
          services: services.map(({ id, category, name_hy, name_en, duration_min, price_min, price_max }) => ({ id, category, name_hy, name_en, duration_min, price_min, price_max })),
          services_text: servicesText,
          hours_text: hoursText,
          today: localNow().date,
        });
      }

      if (path === "/api/stt" && req.method === "POST") {
        // Only our own page may spend Gemini credits.
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await transcribe(env, req);
      }
      if (path === "/api/realtime-session" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await realtimeSession(env, req);
      }
      // Calendar for the /realtime/ assistant (its tool calls come from the browser, so no TOOL_SECRET here).
      if (path === "/api/rt-tool" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        const { name, args } = (await req.json().catch(() => ({}))) as { name?: string; args?: Record<string, unknown> };
        if (name === "check_availability") return json(await checkAvailability(env, args ?? {}));
        if (name === "create_booking") return json(await createBooking(env, { ...(args ?? {}), conversation_id: "realtime" }));
        return json({ error: "unknown_tool" }, 400);
      }
      if (path === "/api/chat" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await chatReply(env, req);
      }
      if (path === "/api/rt-log" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await realtimeLog(env, req);
      }
      if (path === "/api/tts" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await ttsStream(env, req);
      }
      if (path === "/api/stt-compare" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await compareTranscripts(env, req);
      }

      if (path.startsWith("/tools/")) {
        const auth = req.headers.get("authorization") ?? "";
        if (req.method !== "POST" || !safeEqual(auth, `Bearer ${env.TOOL_SECRET}`)) return json({ error: "unauthorized" }, 401);
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        if (path === "/tools/check-availability") return json(await checkAvailability(env, body));
        if (path === "/tools/create-booking") return json(await createBooking(env, body));
        return json({ error: "not_found" }, 404);
      }

      if (path.startsWith("/api/admin/")) return await admin(env, req, path);
      return json({ error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
