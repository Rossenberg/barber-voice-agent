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

const GRID_MIN = 15; // appointments start on :00, :15, :30, :45
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

/** Free start times (minutes since midnight) on a date for a service of the given length. */
async function freeStarts(db: D1Database, settings: Settings, date: string, durationMin: number): Promise<number[]> {
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
    if (results.filter((b) => b.start_min < e && b.end_min > s).length < settings.barbers) starts.push(s);
  }
  return starts;
}

const nearest = (starts: number[], target: number, count = 3) =>
  [...starts].sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, count).sort((a, b) => a - b).map(toHHMM);

/** Up to `max` times spread across the day. */
function spread(starts: number[], max = 6): string[] {
  if (starts.length <= max) return starts.map(toHHMM);
  const step = starts.length / max;
  return Array.from({ length: max }, (_, i) => toHHMM(starts[Math.floor(i * step)]));
}

async function nextOpenDays(db: D1Database, settings: Settings, date: string, durationMin: number, count = 2) {
  const out: { date: string; weekday: string; times: string[] }[] = [];
  for (let i = 1; i <= 14 && out.length < count; i++) {
    const d = addDays(date, i);
    const starts = await freeStarts(db, settings, d, durationMin);
    if (starts.length) out.push({ date: d, weekday: weekdayName(d), times: spread(starts, 3) });
  }
  return out;
}

function findService(services: Service[], id: unknown): Service | undefined {
  const key = typeof id === "string" ? id.trim().toLowerCase() : "";
  return services.find((s) => s.id === key);
}

// ---------------------------------------------------------------- assistant tools

const DISABLED = { success: false, error: "assistant_disabled", message: "The barbershop has switched the assistant off. Apologize and ask the client to call back later." };

async function checkAvailability(env: Env, body: Record<string, unknown>) {
  const settings = await getSettings(env.DB);
  if (!settings.enabled) return DISABLED;
  const services = await getServices(env.DB, true);
  const service = findService(services, body.service_id) ?? findService(services, "haircut") ?? services[0];
  const date = body.date;
  if (!isDate(date)) return { success: false, error: "bad_date", message: "Use YYYY-MM-DD.", today: localNow().date };

  const base = { date, weekday: weekdayName(date), today: localNow().date, service: { id: service.id, name: service.name_hy, duration_min: service.duration_min } };
  const closed = closedReason(settings, date);
  if (closed) return { ...base, open: false, reason: closed, next_free_days: closed === "too_far" ? [] : await nextOpenDays(env.DB, settings, date, service.duration_min) };

  const starts = await freeStarts(env.DB, settings, date, service.duration_min);
  const requested = parseHHMM(body.time);
  if (requested !== null) {
    const free = starts.includes(requested);
    return {
      ...base,
      open: true,
      requested_time: toHHMM(requested),
      requested_time_free: free,
      ...(free ? {} : { nearest_free_times: nearest(starts, requested) }),
      ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, settings, date, service.duration_min) }),
    };
  }
  return {
    ...base,
    open: true,
    free_times: spread(starts),
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
  const service = findService(await getServices(env.DB, true), body.service_id);
  if (!service) return { success: false, error: "unknown_service", message: "Use a service id from the price list." };
  const date = body.date;
  const start = parseHHMM(body.time);
  if (!isDate(date) || start === null) return { success: false, error: "bad_date_or_time", message: "Use YYYY-MM-DD and HH:MM." };

  const starts = await freeStarts(env.DB, settings, date, service.duration_min);
  if (!starts.includes(start)) {
    return { success: false, error: "slot_taken", message: "This time is not free any more.", nearest_free_times: nearest(starts, start) };
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

/** Mints a short-lived key so the browser can talk to OpenAI Realtime (speech in, speech out) directly. */
async function realtimeSession(env: Env, req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const voice = params.get("voice") === "male" ? "cedar" : "marin";
  // "text": OpenAI only hears and thinks; the page speaks the reply with ElevenLabs' Armenian voices
  // (OpenAI's own Armenian voice has a strong foreign accent).
  const textOnly = params.get("speech") === "elevenlabs";
  const settings = await getSettings(env.DB);
  const { servicesText, hoursText } = promptFacts(settings, await getServices(env.DB, true));
  const name = voice === "cedar" ? "Արամ" : "Անի";
  const instructions = [
    `Your name is ${name}. You answer the phone for the barbershop called exactly «${settings.shop_name}» in Yerevan${settings.address ? ` (${settings.address})` : ""}. Never change, translate or invent the barbershop's name.`,
    "The page has already greeted the caller, so don't greet again; answer what they say.",
    "Speak correct, polite, natural Eastern Armenian, like a well-spoken administrator: warm but literate. Always address the caller with the polite «Դուք» (Ձեզ, Ձեր), never «դու», even if the caller speaks informally. Use standard forms («է», «կարող եմ», «վաղը»), not slang («ա», «կարամ», «էգուց», «ախպեր ջան», «ապեր»). Switch to Russian or English only if the caller speaks it.",
    "Use only real Armenian words. Never write English or Russian words in Armenian letters: no «պերֆեկտ», «օքեյ», «սուպեր», «գրեյթ», «նայս», «օկ». Instead say «Շատ լավ», «Հիանալի», «Եղավ», «Լավ», «Իհարկե», «Հա».",
    "Be very brief: one short sentence per reply, usually 3-10 words. Ask one thing at a time. Never read the whole price list.",
    "Understand (but never use yourself) the callers' slang: «թրաշս դզեմ», «թրաշ դզել», «մորուքս սարքեմ» = beard trim; «թրաշ անել», «սափրվել» = shave; «էգուց» = tomorrow; «էսօր» = today; «կարամ գամ» = can I come; «ֆեյդ» = fade; «մաշինկայով», «զրոյով» = buzz cut; «ախպեր ջան», «ապեր» = friendly address, not a name; «հա» = yes, «չէ» = no.",
    "Times and prices in words: «ժամը տասնմեկին», «երեքն անց կեսին», «տաս հազար դրամ».",
    "Booking flow (this is a voice test without the calendar, so any requested time within opening hours is free): confirm the time in one sentence and ask «Գրանցե՞մ»; then ask the name; then ask which phone number to write and repeat its last two digits; then confirm the booking in one sentence.",
    `Today: ${localNow().date}. Opening hours: ${hoursText}.`,
    `Price list (id | Armenian | English | duration | price) — use only these, never invent services or prices:\n${servicesText}`,
    settings.extra_instructions ? `Extra instructions from the owner: ${settings.extra_instructions}` : "",
  ].filter(Boolean).join("\n");
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions,
        ...(textOnly ? { output_modalities: ["text"] } : {}),
        audio: {
          input: { transcription: { model: "gpt-transcribe", language: "hy" }, turn_detection: { type: "semantic_vad", eagerness: "high" } },
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
  const voiceId = voice === "male" ? "JBFqnCBsd6RMkjVDRZzb" : "cgSgspJ2msm6clMCkdW9"; // George / Jessica, as on the agent
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: clean, model_id: "eleven_v4_turbo", language_code: "hy" }),
  });
  if (!res.ok || !res.body) return json({ error: `tts ${res.status} ${(await res.text()).slice(0, 200)}` }, 502);
  return new Response(res.body, { headers: { "content-type": "audio/pcm", "cache-control": "no-store" } });
}

// ---------------------------------------------------------------- dashboard

function validSettings(input: Record<string, unknown>, current: Settings): Settings {
  const s = { ...current };
  if ("enabled" in input) s.enabled = input.enabled === true;
  if ("shop_name" in input) s.shop_name = cleanText(input.shop_name, 60) || current.shop_name;
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
