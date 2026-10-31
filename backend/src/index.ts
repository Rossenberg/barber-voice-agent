import PHRASEBOOK from "../../agent/phrasebook-hy.md";
import { authApi, currentUser } from "./account"; // shared with the ElevenLabs agent (scripts/setup-elevenlabs.mjs)
import {
  addDays,
  checkToken,
  cleanText,
  daysBetween,
  isDate,
  hmac,
  json,
  localNow,
  makeCallToken,
  makeToken,
  normalizePhone,
  parseHHMM,
  readCallToken,
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
  TELEGRAM_BOT_TOKEN?: string; // call reviews go to the owner's Telegram (optional)
  TELEGRAM_CHAT_ID?: string;
  RESEND_API_KEY?: string; // cabinet emails: confirm the address, reset the password
  INSTAGRAM_APP_SECRET?: string; // signs Instagram webhooks (Meta app → App settings → Basic)
  INSTAGRAM_VERIFY_TOKEN?: string; // the code we give Meta when it checks the webhook address
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

// Every business (barbershop) has its own settings, services, bookings and closed hours. Business 1 is the
// demo «Blade Barbershop» on the landing page.
const DEMO_BIZ = 1;

async function getSettings(db: D1Database, biz: number): Promise<Settings> {
  const row = await db.prepare("SELECT settings FROM businesses WHERE id = ?").bind(biz).first<{ settings: string }>();
  if (!row) throw new HttpError(404, "business_not_found");
  return JSON.parse(row.settings);
}

async function getServices(db: D1Database, biz: number, activeOnly: boolean): Promise<Service[]> {
  const sql = `SELECT * FROM services WHERE business_id = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY sort, name_en`;
  return (await db.prepare(sql).bind(biz).all<Service>()).results;
}

/** ?biz=<slug> in public links; none = the demo barbershop. */
async function bizBySlug(db: D1Database, slug: unknown): Promise<number> {
  const s = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!s) return DEMO_BIZ;
  const row = await db.prepare("SELECT id FROM businesses WHERE slug = ?").bind(s).first<{ id: number }>();
  if (!row) throw new HttpError(404, "business_not_found");
  return row.id;
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
/** ignoreBookingId: the caller's own booking they're changing, so its slot counts as free. */
async function freeStarts(db: D1Database, biz: number, settings: Settings, date: string, durationMin: number, people = 1, ignoreBookingId = 0): Promise<number[]> {
  if (closedReason(settings, date)) return [];
  const [open, close] = settings.hours[weekdayOf(date)]!;
  const [{ results }, { results: blocks }] = await db.batch<{ start_min: number; end_min: number }>([
    db.prepare("SELECT start_min, end_min FROM bookings WHERE business_id = ? AND date = ? AND status = 'confirmed' AND id != ?").bind(biz, date, ignoreBookingId),
    db.prepare("SELECT start_min, end_min FROM blocks WHERE business_id = ? AND date = ?").bind(biz, date),
  ]);

  const now = localNow();
  const earliest = date === now.date ? now.minutes + MIN_NOTICE_MIN : 0;
  const starts: number[] = [];
  for (let s = Math.ceil(open / GRID_MIN) * GRID_MIN; s + durationMin <= close; s += GRID_MIN) {
    if (s < earliest) continue;
    const e = s + durationMin;
    if (blocks.some((b) => b.start_min < e && b.end_min > s)) continue; // the owner closed these hours
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

/** Free starts as ranges of consecutive slots: «10:00–13:30, 15:00–19:00» (the last start of each range). */
function freeRanges(starts: number[]) {
  const out: [number, number][] = [];
  for (const m of starts) {
    const last = out[out.length - 1];
    if (last && m - last[1] === GRID_MIN) last[1] = m; else out.push([m, m]);
  }
  return out;
}
const rangesText = (starts: number[]) => freeRanges(starts).map(([a, b]) => (a === b ? toHHMM(a) : `${toHHMM(a)}–${toHHMM(b)}`));
// «from ten until half past eleven»: ablative and accusative forms of the same words as timeHy
const HOUR_FROM = ["", "մեկից", "երկուսից", "երեքից", "չորսից", "հինգից", "վեցից", "յոթից", "ութից", "իննից", "տասից", "տասնմեկից", "տասներկուսից"];
const HOUR_TO = ["", "մեկը", "երկուսը", "երեքը", "չորսը", "հինգը", "վեցը", "յոթը", "ութը", "ինը", "տասը", "տասնմեկը", "տասներկուսը"];
function timeFromHy(min: number) { const h = Math.floor(min / 60) % 12 || 12, m = min % 60; return m === 0 ? HOUR_FROM[h] : `${HOUR_PAST[h]} անց ${m === 30 ? "կեսից" : `${m} րոպեից`}`; }
function timeToHy(min: number) { const h = Math.floor(min / 60) % 12 || 12, m = min % 60; return m === 0 ? HOUR_TO[h] : `${HOUR_PAST[h]} անց ${m === 30 ? "կեսը" : `${m} րոպեն`}`; }
const rangesHy = (starts: number[]) => freeRanges(starts).map(([a, b]) => (a === b ? timeHy(a) : `${timeFromHy(a)} մինչև ${timeToHy(b)}`));

/** Up to `max` times spread across the day. */
function spread(starts: number[], max = 6): string[] {
  if (starts.length <= max) return starts.map(toHHMM);
  const step = starts.length / max;
  return Array.from({ length: max }, (_, i) => toHHMM(starts[Math.floor(i * step)]));
}

async function nextOpenDays(db: D1Database, biz: number, settings: Settings, date: string, durationMin: number, count = 2) {
  const out: { date: string; weekday: string; times: string[]; times_hy: string[] }[] = [];
  for (let i = 1; i <= 14 && out.length < count; i++) {
    const d = addDays(date, i);
    const starts = await freeStarts(db, biz, settings, d, durationMin);
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

// What the model should do with a calendar answer. Rules in the prompt alone were skipped now and then
// (it offered «Գրանցե՞մ» before the caller had said which service), a field in the tool result is not.
function nextStep(body: Record<string, unknown>, result: Record<string, unknown>) {
  if (result.error || result.open === false) return result;
  const step = body.service_named === false
    ? "The caller hasn't said which service yet: tell the free time(s) and in the same reply ask which service («Ի՞նչ ծառայություն եք ցանկանում՝ կտրվածք, մորուքի մշակում, թե՞ երկուսը միասին։»). Do NOT ask «Գրանցե՞մ» yet and don't book."
    : body.replace_booking_id
      ? "This is a change of their booking: if the time fits, ask «Փոխե՞մ Ձեր գրանցումը» (not «Գրանցե՞մ»), then create_booking with the same replace_booking_id."
      : "Answer from this result; if a time fits, offer it and ask «Գրանցե՞մ» — unless they already agreed to book in this conversation: then don't ask again, go on with the name, the phone, create_booking.";
  return { ...result, next_step: step };
}

async function checkAvailability(env: Env, body: Record<string, unknown>, biz: number) {
  return nextStep(body, await calendarAnswer(env, body, biz));
}

async function calendarAnswer(env: Env, body: Record<string, unknown>, biz: number): Promise<Record<string, unknown>> {
  const settings = await getSettings(env.DB, biz);
  if (!settings.enabled) return DISABLED;
  const services = await getServices(env.DB, biz, true);
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
  if (closed) {
    // a past date: look for free days from today on (looking from that date offered days that had passed too)
    const from = closed === "past" ? addDays(localNow().date, -1) : date;
    return { ...base, open: false, reason: closed, next_free_days: closed === "too_far" ? [] : await nextOpenDays(env.DB, biz, settings, from, service.duration_min) };
  }

  const changing = Number(String(body.replace_booking_id ?? "").replace(/\D/g, "")) - 1000;
  const starts = await freeStarts(env.DB, biz, settings, date, service.duration_min, people, changing > 0 ? changing : 0);
  // «առավոտյան ութին» is 8 in the morning: don't read it as the evening
  const requested = body.part_of_day === "morning" ? parseHHMM(body.time) : afternoon(settings, date, parseHHMM(body.time));
  if (requested !== null) {
    // "At 11" asked late in the day: say it has passed and look at the same time tomorrow.
    if (date === localNow().date && requested <= localNow().minutes) {
      const tomorrow = addDays(date, 1);
      const tStarts = await freeStarts(env.DB, biz, settings, tomorrow, service.duration_min);
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
    // «at 9» when we open at 10 is not "taken" — say it's outside opening hours
    const [openMin, closeMin] = settings.hours[weekdayOf(date)]!;
    const outside = requested < openMin || requested + service.duration_min > closeMin;
    return {
      ...base,
      open: true,
      requested_time: toHHMM(requested),
      requested_time_hy: timeHy(requested),
      requested_time_free: free,
      ...(outside ? { outside_opening_hours: true, opening_hours_that_day: `${toHHMM(openMin)}–${toHHMM(closeMin)}`, opens_hy: timeHy(openMin), closes_hy: timeHy(closeMin) } : {}),
      ...(free ? {} : { nearest_free_times: near, nearest_free_times_hy: hy(near), later_free_times: starts.filter((m) => m > requested).slice(0, 3).map(toHHMM), later_free_times_hy: hy(starts.filter((m) => m > requested).slice(0, 3).map(toHHMM)) }),
      ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, biz, settings, date, service.duration_min) }),
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
      ...earliestFree(date, starts),
      ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, biz, settings, date, service.duration_min) }),
    };
  }
  return {
    ...base,
    open: true,
    has_free_time: starts.length > 0,
    free_times: spread(starts),
    free_times_hy: hy(spread(starts)),
    free_ranges: rangesText(starts),
    free_ranges_hy: rangesHy(starts),
    times_note: "No time asked yet: say the day has free time and ask which time suits them — don't pick times for them. Read free_ranges only if they ask for all free times.",
    ...earliestFree(date, starts),
    ...(starts.length ? {} : { next_free_days: await nextOpenDays(env.DB, biz, settings, date, service.duration_min) }),
  };
}

// "Can I come right now?" — the first free start, and for today how many minutes away it is.
function earliestFree(date: string, starts: number[]) {
  if (!starts.length) return {};
  const now = localNow();
  return {
    earliest_free_time: toHHMM(starts[0]!),
    earliest_free_time_hy: timeHy(starts[0]!),
    ...(date === now.date ? { earliest_in_minutes: starts[0]! - now.minutes } : {}),
  };
}

async function insertBooking(env: Env, biz: number, service: Service, date: string, start: number, fields: { name: string; phone: string | null; source: string; conversationId: string }) {
  const res = await env.DB.prepare(
    "INSERT INTO bookings (business_id, service_id, service_name, date, start_min, end_min, client_name, phone, source, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(biz, service.id, service.name_hy, date, start, start + service.duration_min, fields.name || null, fields.phone, fields.source, fields.conversationId || null)
    .first<{ id: number }>();
  return `B-${1000 + res!.id}`;
}

/** «Երեքին» means 15:00 at a barbershop, not 03:00: an hour before opening that fits after noon is read as afternoon. */
function afternoon(settings: Settings, date: string, min: number | null): number | null {
  const hours = settings.hours[weekdayOf(date)];
  if (min === null || !hours) return min;
  return min < hours[0] && min < 12 * 60 && min + 12 * 60 < hours[1] ? min + 12 * 60 : min;
}

/** Who is calling: the conversation, and the caller's number only when it comes from caller ID (never from the model). */
type Caller = { phone: string | null; conv: string; biz: number };

// The caller's own booking: made in this conversation, or under the number they're calling from.
const ownsBooking = (caller: Caller, b: { phone: string | null; conversation_id: string | null }) =>
  b.conversation_id === caller.conv || (!!caller.phone && b.phone === caller.phone);

const bookingNumber = (v: unknown) => Number(String(v ?? "").replace(/\D/g, "")) - 1000;

async function createBooking(env: Env, body: Record<string, unknown>, caller: Caller) {
  const settings = await getSettings(env.DB, caller.biz);
  if (!settings.enabled) return DISABLED;
  if (body.service_named === false) return { success: false, error: "ask_service_first", message: "The caller hasn't said which service: ask «Ի՞նչ ծառայություն եք ցանկանում։» before booking." };
  if (!cleanText(body.client_name, 60)) return { success: false, error: "ask_name_first", message: "Ask the caller's name first («Ի՞նչ է Ձեր անունը։»), then book." };
  // «Անի ջան, …» is the caller talking to the assistant, not their name (it once booked a caller as «Անի»)
  if (/^(անի|արամ)$/i.test(cleanText(body.client_name, 60)) && body.same_name_as_assistant !== true) {
    return { success: false, error: "ask_name_first", message: "That is YOUR name — callers address you with it («Անի ջան»). Ask «Ի՞նչ է Ձեր անունը։». Only if the caller said their own name is the same, book with same_name_as_assistant true." };
  }
  // a number that isn't a phone number (one digit too many) used to be dropped silently and the booking made
  // without a phone — the model then blamed «a technical problem»
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (rawPhone && !normalizePhone(rawPhone)) {
    const digits = rawPhone.replace(/\D/g, "").length;
    return { success: false, error: "invalid_phone", message: `«${rawPhone}» isn't a valid number (${digits} digits; an Armenian mobile is 0 + 8 digits, e.g. 099 12 34 56). Nothing was booked yet: ask them to check it — «Համարը կարծես սխալ է՝ ${digits} թիվ է։ Կգրե՞ք (կասե՞ք) կրկին։» — then book.` };
  }
  // the number is saved only after the caller agreed to it (it once booked straight away without asking)
  const phone_ = normalizePhone(body.phone);
  // (in the chat the caller typed the number themselves: nothing to read back)
  if (phone_ && body.phone_confirmed !== true && !body.replace_booking_id && !caller.conv.startsWith("chat-")) {
    return phone_ === caller.phone
      ? { success: false, error: "confirm_phone_first", message: "Ask «Գրանցե՞մ այն համարով, որից զանգում եք։» and book with phone_confirmed true after they say yes." }
      : { success: false, error: "confirm_phone_first", message: "A dictated number: first read back its last two digits as one number («Համարը վերջանում է ‹ութսունութով›, ճի՞շտ է։»), and book with phone_confirmed true only after they say yes." };
  }
  const service = resolveServices(await getServices(env.DB, caller.biz, true), body.service_id);
  if (!service) return { success: false, error: "unknown_service", message: "Use service ids from the price list (several joined with +)." };
  const date = body.date;
  const start = isDate(date) ? afternoon(settings, date, parseHHMM(body.time)) : null;
  if (!isDate(date) || start === null) return { success: false, error: "bad_date_or_time", message: "Use YYYY-MM-DD and HH:MM." };

  const phone = normalizePhone(body.phone);
  const conversationId = caller.conv;

  // Changing a booking (e.g. beard trim → haircut + beard, or another time): the old one is freed first, so
  // its own slot counts as free, and put back if the new time doesn't fit. Only the caller's own booking.
  let replaced: number | null = null;
  if (body.replace_booking_id) {
    const old = await env.DB.prepare("SELECT id, phone, conversation_id FROM bookings WHERE id = ? AND business_id = ? AND status = 'confirmed'").bind(bookingNumber(body.replace_booking_id), caller.biz).first<{ id: number; phone: string | null; conversation_id: string | null }>();
    if (!old) return { success: false, error: "booking_not_found", message: "No such booking: call find_bookings, or make a new one." };
    if (!ownsBooking(caller, old)) return { success: false, error: "not_your_booking", message: "Only bookings made in this conversation or under the caller's own number can be changed; offer that the administrator calls back." };
    await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(old.id).run();
    replaced = old.id;
  }

  const starts = await freeStarts(env.DB, caller.biz, settings, date, service.duration_min);
  if (!starts.includes(start)) {
    if (replaced) await env.DB.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").bind(replaced).run();
    const near = nearest(starts, start);
    return { success: false, error: "slot_taken", message: replaced ? "This time is not free; the old booking is kept." : "This time is not free any more.", nearest_free_times: near, nearest_free_times_hy: hy(near) };
  }
  const bookingId = await insertBooking(env, caller.biz, service, date, start, {
    name: cleanText(body.client_name, 60),
    phone,
    source: "assistant",
    conversationId,
  });
  return { success: true, booking_id: bookingId, ...(replaced ? { replaced_booking_id: `B-${1000 + replaced}` } : {}), phone_saved: Boolean(phone), summary: `${service.name_hy}, ${weekdayName(date)} ${date} ${toHHMM(start)}` };
}

/** The caller's upcoming bookings: made in this conversation, or under the number they're calling from. */
async function findBookings(env: Env, caller: Caller) {
  const today = localNow().date;
  const { results } = await env.DB.prepare(
    "SELECT id, service_name, date, start_min, client_name, phone, conversation_id FROM bookings WHERE business_id = ? AND status = 'confirmed' AND date >= ? AND (conversation_id = ? OR (? IS NOT NULL AND phone = ?)) ORDER BY date, start_min",
  ).bind(caller.biz, today, caller.conv, caller.phone, caller.phone).all<{ id: number; service_name: string; date: string; start_min: number; client_name: string | null; phone: string | null; conversation_id: string | null }>();
  const bookings = results
    .filter((b) => b.date > today || b.start_min > localNow().minutes)
    .map((b) => ({ booking_id: `B-${1000 + b.id}`, name: b.client_name, service: b.service_name, date: b.date, weekday: weekdayName(b.date), time: toHHMM(b.start_min), time_hy: timeHy(b.start_min), made_in_this_conversation: b.conversation_id === caller.conv }));
  if (bookings.length) return { bookings, next_step: "Now answer the caller in one or two sentences: name the booking they mean and do what they asked (another time → check it with replace_booking_id and ask «Փոխե՞մ»; cancel → «Չեղարկե՞մ …» unless they already clearly asked to cancel exactly that one)." };
  return caller.phone
    ? { bookings: [], message: "No upcoming bookings under the number they're calling from. If they booked with another number, the administrator will call back." }
    : { bookings: [], message: "The caller's number is unknown, so bookings from earlier calls can't be looked up: offer that the administrator calls back." };
}

async function cancelBooking(env: Env, body: Record<string, unknown>, caller: Caller) {
  const b = await env.DB.prepare("SELECT id, service_name, date, start_min, client_name, phone, conversation_id FROM bookings WHERE id = ? AND business_id = ? AND status = 'confirmed'").bind(bookingNumber(body.booking_id), caller.biz).first<{ id: number; service_name: string; date: string; start_min: number; client_name: string | null; phone: string | null; conversation_id: string | null }>();
  if (!b) return { success: false, error: "booking_not_found", message: "No such booking: call find_bookings first." };
  if (!ownsBooking(caller, b)) return { success: false, error: "not_your_booking", message: "Only bookings made in this conversation or under the caller's own number can be cancelled; offer that the administrator calls back." };
  await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(b.id).run();
  return { success: true, cancelled_booking_id: `B-${1000 + b.id}`, next_step: "Tell the caller now in one sentence: «Չեղարկեցի ‹…›ի գրանցումը։» (and which booking stays, if any).", summary: `${b.client_name ?? ""}: ${b.service_name}, ${weekdayName(b.date)} ${b.date} ${toHHMM(b.start_min)} (${timeHy(b.start_min)})` };
}

/** Runs one of the assistant's tools for the voice call and the chat alike. */
async function runTool(env: Env, name: string, args: Record<string, unknown>, caller: Caller) {
  if (name === "check_availability") {
    const result = await checkAvailability(env, args, caller.biz);
    if (!args.replace_booking_id && isDate(args.date)) {
      const { results: same } = await env.DB.prepare(
        "SELECT id, client_name, service_name, start_min FROM bookings WHERE business_id = ? AND date = ? AND status = 'confirmed' AND (conversation_id = ? OR (? IS NOT NULL AND phone = ?))",
      ).bind(caller.biz, args.date, caller.conv, caller.phone, caller.phone).all<{ id: number; client_name: string | null; service_name: string; start_min: number }>();
      if (same.length) {
        return {
          ...result,
          caller_bookings_that_day: same.map((b) => ({ booking_id: `B-${1000 + b.id}`, name: b.client_name, service: b.service_name, time: toHHMM(b.start_min) })),
          caller_bookings_note: "The caller already has these bookings that day. If they're changing one, check again with its replace_booking_id; a booking for another person (a friend, a son) is a new one — that's fine.",
        };
      }
    }
    return result;
  }
  if (name === "create_booking") return createBooking(env, args, caller);
  if (name === "find_bookings") return findBookings(env, caller);
  if (name === "cancel_booking") return cancelBooking(env, args, caller);
  return { error: "unknown_tool" };
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
        replace_booking_id: { type: "string", description: "When checking a change to one of the caller's bookings (made in this conversation, or found with find_bookings): its booking_id, so its own slot counts as free." },
        service_named: { type: "boolean", description: "true only if the caller has already said which service(s) they want; false if you're assuming haircut." },
      },
      required: ["date", "service_named"],
    },
  },
  {
    type: "function",
    name: "create_booking",
    description: "Book one person after they named the service, agreed to a free time and gave their name (and phone on calls). For a group, call once per person. To change one of the caller's bookings (add a service, other time, another person), call with replace_booking_id instead of making a second booking.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "One person's service(s): one id, or several joined with + (e.g. haircut+beard_trim+styling)" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM" },
        client_name: { type: "string" },
        phone: { type: "string" },
        replace_booking_id: { type: "string", description: "When the caller changes one of their bookings (other service, time or person): its booking_id (e.g. B-1031). The old one is cancelled, never booked twice." },
        service_named: { type: "boolean", description: "true only if the caller said which service(s) they want." },
        phone_confirmed: { type: "boolean", description: "true only after the caller agreed to this number: their own number → they said yes to «Գրանցե՞մ այն համարով, որից զանգում եք։»; a dictated one → they confirmed its last two digits." },
        same_name_as_assistant: { type: "boolean", description: "Only if the caller said their own name is Անի / Արամ (the same as yours)." },
      },
      required: ["service_id", "date", "time", "client_name", "service_named"],
    },
  },
  {
    type: "function",
    name: "find_bookings",
    description: "The caller's upcoming bookings: made in this conversation, or under the number they're calling from (caller ID). Call when they ask about, want to change or cancel a booking, or say someone isn't coming.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "cancel_booking",
    description: "Cancel one of the caller's bookings (from find_bookings or made in this conversation) after they confirmed which one. For a group, only the person who isn't coming.",
    parameters: { type: "object", properties: { booking_id: { type: "string", description: "e.g. B-1031" } }, required: ["booking_id"] },
  },
];

/**
 * Instructions shared by the voice assistant (/realtime/) and the website chat, so both think the same way:
 * same phrasebook, calendar rules and price list; only how they talk differs (spoken words vs. chat text).
 */
async function assistantInstructions(env: Env, opts: { biz: number; name: string; callerPhone: string | null; channel: "voice" | "chat"; conv?: string }): Promise<string> {
  const settings = await getSettings(env.DB, opts.biz);
  const { servicesText, hoursText } = promptFacts(settings, await getServices(env.DB, opts.biz, true));
  // The caller's bookings are looked up before the call starts: in tests the model often forgot to search
  // when someone said «my friend isn't coming» or «drop the beard», and asked for the day again instead.
  let bookingsLine = "";
  if (opts.callerPhone && opts.conv) {
    const { bookings } = await findBookings(env, { phone: opts.callerPhone, conv: opts.conv, biz: opts.biz });
    bookingsLine = bookings.length
      ? `The caller's upcoming bookings (found by their number; use these booking_id values directly with replace_booking_id or cancel_booking, no need to call find_bookings): ${bookings.map((b) => `${b.booking_id} ${b.name ?? ""}: ${b.service}, ${b.weekday} ${b.date} ${b.time} («${b.time_hy}»)`).join("; ")}. When they mention their booking, a friend's booking, being late, changing or cancelling, it's one of these.`
      : "The caller has no upcoming bookings under the number they're calling from: if they say they're booked, it was under another number — the administrator will call back.";
  }
  const address = settings.address.trim();
  const { name, callerPhone } = opts;
  const voice = opts.channel === "voice";
  const shop = voice ? settings.shop_name_spoken || settings.shop_name : settings.shop_name;
  return [
    voice
      ? `Your name is ${name}. You answer the phone for the barbershop called exactly «${shop}». Never change, translate or invent the barbershop's name.`
      : `Your name is ${name}. You answer the website chat of the barbershop called exactly «${shop}». Never change, translate or invent the barbershop's name.`,
    address
      ? `Address — when asked: «Մեր հասցեն է՝ ${address}։» exactly, nothing more (no building, landmark, floor or directions you weren't given). Anything else about getting there (parking, metro, traffic): answer from the owner's notes below if they say something; otherwise «Այդ մասին ճշգրիտ տեղեկություն չունեմ։ Ցանկանո՞ւմ եք, որ ադմինիստրատորը Ձեզ հետ կապվի։»`
      : "The address isn't filled in: if asked, «Հասցեի մասին ճշգրիտ տեղեկություն չունեմ։ Ցանկանո՞ւմ եք, որ ադմինիստրատորը Ձեզ հետ կապվի։» Never invent one.",
    voice ? "The page has already greeted the caller, so don't greet again; answer what they say." : "The chat already showed your greeting. If the client greets you («barev», «բարև», «привет»), greet them back warmly in a few words before going on («Բարև ձեզ 😊 Ուրախ եմ, որ գրեցիք։ …») — never jump straight to «Ինչո՞վ կարող եմ օգնել» as if they hadn't said hello.",
    "Say «բարբեր» (բարբերը, բարբերներ, մեր բարբերները) for the people who cut hair — never «վարսավիր». The shop is «բարբերշոփ» or «սրահ», never «վարսավիրանոց».",
    "Speak correct, polite, natural Eastern Armenian, like a well-spoken administrator: warm but literate. Always address the caller with the polite «Դուք» (Ձեզ, Ձեր), never «դու», even if the caller speaks informally. Use standard forms («է», «կարող եմ», «վաղը»), not slang («ա», «կարամ», «էգուց», «ախպեր ջան», «ապեր»). Switch to Russian or English only if the caller speaks it.",
    "Use only real Armenian words. Never write English or Russian words in Armenian letters: no «պերֆեկտ», «օքեյ», «սուպեր», «գրեյթ», «նայս», «օկ». Instead say «Շատ լավ», «Հիանալի», «Եղավ», «Լավ», «Իհարկե», «Հա».",
    voice
      ? "Your replies are read aloud by an Armenian voice: write every name, brand or foreign word in Armenian letters (e.g. «ֆեյդ», not «fade»), never in Latin letters."
      : "This is a text chat: the barbershop's name may be written in Latin letters as above.",
    voice
      ? "Be very brief: one short sentence per reply, usually 3-10 words. Ask one thing at a time. If they ask what services you have or for all prices, don't refuse: name them briefly from the price list in one or two sentences (main services with prices; combos and coloring as one phrase each), then ask what they'd like."
      : "Chat tone: warm, friendly and human, like a pleasant administrator who likes their job — not a dry form. Greet back warmly and invite them in («Բարև ձեզ, ուրախ եմ Ձեզ տեսնել այստեղ։ …»), connect sentences naturally («Իսկ եթե…», «Ի դեպ…»), and now and then a light, kind touch of humour about haircuts or the weekend (never about the client's looks, never in a complaint or a mistake). Still short: 1–3 sentences, one question at a time, polite «Դուք». Sound like a person: vary your wording, never repeat the same closing question you used in your last replies, and don't push a question after every answer. No markdown or lists; at most one emoji, rarely. The phrasebook sentences are a guide for correct Armenian here — you may phrase them more warmly. List the whole price list only if they ask for all prices.",
    "Callers' everyday words and slang are mapped to services in the phrasebook below (What callers say → which service). Understand them, never use slang yourself.",
    voice
      ? "Times and prices in words: «ժամը տասնմեկին», «երեքն անց կեսին», «տասը հազար դրամ»."
      : "In the chat write times and prices in digits, they're easier to read: «վաղը ժամը 11:30-ին», «10 000 դրամ». Otherwise follow the phrasebook's wording.",
    PHRASEBOOK,
    voice
      ? "Say «Մեկ րոպե, հիմա կնայեմ։» only in the same turn as a calendar call, never at other moments."
      : "In the chat don't write «Մեկ րոպե, հիմա կնայեմ» — just check the calendar and answer.",
    voice
      ? "Calendar results give every time also in words (fields ending in _hy). Say times by copying those words exactly; never convert digits yourself. The _hy words are only for Armenian: in a Russian or English conversation say times in that language (e.g. «в десять», «at ten»). If requested_time_passed is true, say «Այդ ժամն այսօր արդեն անցել է» and offer same_time_tomorrow."
      : "Calendar results give times as HH:MM; write them like that. If requested_time_passed is true, say «Այդ ժամն այսօր արդեն անցել է» and offer same_time_tomorrow.",
    "Booking flow: check_availability before saying any time is free, answer only from its result (nearest_free_times / other_free_times_that_day / next_free_days when the asked time isn't free; outside_opening_hours → say the hours, never «զբաղված»), then «Գրանցե՞մ», the name, the phone, create_booking, one-sentence confirmation. Follow next_step in tool results.",
    !voice
      ? "Phone in the chat: after the name ask once «Գրեք, խնդրեմ, Ձեր հեռախոսահամարը, որ բարբերը կարողանա կապ հաստատել։» and book with the number they wrote (phone_confirmed true — they typed it, no read-back needed). If they don't want to give it, book without a phone. Bookings from earlier chats or calls can't be found here: changes to those go to the administrator."
      : callerPhone
        ? `Caller's phone number (caller ID): ${callerPhone}. Ask «Գրանցե՞մ այն համարով, որից զանգում եք։» — yes → book with ${callerPhone} and ask nothing more about the phone; no → «Ասեք Ձեր հեռախոսահամարը։» and repeat the last two digits.`
        : "The caller's number is unknown: ask «Ասեք Ձեր հեռախոսահամարը։» and repeat the last two digits. If they say «this number» / «the one I'm calling from», explain the number isn't visible and ask them to dictate it.",
    `Today: ${localNow().date} (${weekdayName(localNow().date)}), now ${toHHMM(localNow().minutes)} Yerevan time. Opening hours: ${hoursText}.`,
    // a ready list, so «November 2nd», «next Tuesday» or «the 5th» are looked up instead of counted
    `Next days (date, weekday, open or closed): ${Array.from({ length: 22 }, (_, i) => { const d = addDays(localNow().date, i); return `${d} ${weekdayName(d)}${settings.hours[weekdayOf(d)] ? "" : " closed"}`; }).join("; ")}.`,
    `Price list (id | Armenian | English | duration | price) — use only these, never invent services or prices:\n${servicesText}`,
    bookingsLine,
    // The owner's notes go last but win over every «no exact information» rule above: they are this business's facts.
    settings.extra_instructions
      ? `Information from the owner (facts about this business — they override any «no exact information» rule above; answer from them, in polite Armenian, when a caller asks about these things; if a note says to always mention something, mention it once early in the conversation, woven in naturally («Ի դեպ, այս շաբաթ…»), not in every reply; a discount that doesn't name services applies to ALL services, one that names a service applies only to it — say which; never invent discounts, payment methods or conditions that aren't written here):\n${settings.extra_instructions}`
      : "",
  ].filter(Boolean).join("\n");
}

/** Mints a short-lived key so the browser can talk to OpenAI Realtime (speech in, speech out) directly. */
const TRANSCRIBE_HINT = "Զանգ վարսավիրանոց, երևանյան խոսակցական՝ գրանցում, կտրվածք, ֆեյդ, թրաշ, մորուք, դզել, ֆենով, ներկել, ներկում, կողքերը, մաշինկայով, էսօր, էգուց, վաղը, մյուս օրը, երկուշաբթի, երեքշաբթի, չորեքշաբթի, հինգշաբթի, ուրբաթ, շաբաթ, կիրակի, ժամը, կեսին, ուշ, շուտ, առավոտյան, իրիկունը, գիշերը, հասցեն, ախպեր ջան, կարա՞մ գամ։ Անուններ՝ Արամ, Արման, Արթուր, Աշոտ, Գևորգ, Գոռ, Դավիթ, Էդգար, Կարեն, Հայկ, Հովհաննես, Մհեր, Նարեկ, Սամվել, Սարգիս, Վահագն, Վահե, Տիգրան, Անի, Աննա, Մարիամ, Լուսինե։ Հեռախոսահամարը թվերով՝ զրո իննսունինը, քսանյոթ, քսանութ, հիսունհինգ, վաթսուներկու, ութսունութ։";

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
  // "manual": the page's own Silero VAD ends each phrase and commits the audio (better in street noise,
  // and it catches a quick «հա»); otherwise OpenAI's semantic VAD does.
  const manualTurns = params.get("turn") === "manual";
  const nr = params.get("nr"); // test switch: near | far (default off)
  const sttModel = ["gpt-transcribe", "gpt-live-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"].includes(params.get("stt") ?? "") ? params.get("stt")! : "gpt-transcribe";
  const biz = await bizBySlug(env.DB, params.get("biz"));
  const conv = `call-${crypto.randomUUID()}`;
  const instructions = await assistantInstructions(env, { biz, name: voice === "cedar" ? "Արամ" : "Անի", callerPhone, channel: "voice", conv });
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
          input: {
            // Vocabulary hint: on real recordings with noise as loud as the voice it took phone numbers from
            // ~3/9 right to 8/9, and it adds nothing on noise alone or on ordinary phrases.
            transcription: { model: sttModel, language: "hy", prompt: TRANSCRIBE_HINT },
            // OpenAI's noise reduction stays off: it cut the hissing «քս» of «քսանյոթ» (a real number in street
            // noise + a passing car: 4/4 right without it, 1/4 with near_field or far_field). ?nr= to compare.
            ...(nr === "near" || nr === "far" ? { noise_reduction: { type: `${nr}_field` } } : {}),
            turn_detection: manualTurns ? null : { type: "semantic_vad", eagerness: "high", create_response: false },
          },
          output: { voice },
        },
      },
    }),
  });
  const data = (await res.json()) as { value?: string; error?: { message?: string } };
  if (!res.ok || !data.value) return json({ error: data.error?.message ?? `openai ${res.status}` }, 502);
  const callToken = await makeCallToken(env.SESSION_SECRET, { phone: callerPhone, conv, biz }, 3 * 60 * 60 * 1000);
  return json({ key: data.value, model: "gpt-realtime-2.1", call_token: callToken });
}

/** Streams Armenian speech (raw 24 kHz 16-bit PCM) for one reply, for the /realtime/ hybrid mode. */
async function ttsStream(env: Env, req: Request): Promise<Response> {
  const { text, voice, prev, seed } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string; prev?: string; seed?: number };
  const clean = cleanText(text, 500);
  if (!clean) return json({ error: "no_text" }, 400);
  const voiceId = voice === "male" ? "JBFqnCBsd6RMkjVDRZzb" : "Xb7hH8MSUJpSbSDYk0k2"; // George / Alice, as on the agent
  // Every reply is generated on its own: with default settings the voice drifted mid-call until it sounded like
  // someone else. Higher stability, one seed per call and the previous reply as context keep it the same person.
  const base = { text: clean, model_id: "eleven_v4_turbo", language_code: "hy", voice_settings: { stability: 0.7, similarity_boost: 0.9, style: 0, use_speaker_boost: true } };
  const extra = { ...(Number.isInteger(seed) ? { seed: Math.abs(Number(seed)) % 4294967295 } : {}), ...(prev ? { previous_text: cleanText(prev, 500) } : {}) };
  const call = (body: object) => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let res = await call({ ...base, ...extra });
  if (res.status === 400 || res.status === 422) res = await call(base); // a model that doesn't take seed / previous_text
  if (!res.ok || !res.body) return json({ error: `tts ${res.status} ${(await res.text()).slice(0, 200)}` }, 502);
  return new Response(res.body, { headers: { "content-type": "audio/pcm", "cache-control": "no-store" } });
}

let lastQuotaAlert = 0;

/** Stores one /realtime/ event: a transcript line, an assistant reply, or the audio of a caller's phrase. */
async function realtimeLog(env: Env, req: Request, ctx: ExecutionContext): Promise<Response> {
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
  const biz = (await readCallToken(env.SESSION_SECRET, form.get("call_token")))?.biz ?? DEMO_BIZ;
  await env.DB.prepare("INSERT INTO realtime_log (business_id, call_id, turn, role, text, latency_ms, audio, audio_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(biz, callId, turn, role, cleanText(form.get("text"), 4000) || null, Number.isFinite(latency) ? latency : null, audio, audioType)
    .run();
  // OpenAI ran out of credit mid-call: the owner must know right away (at most once an hour per Worker instance)
  if (role === "event" && String(form.get("text")).includes("insufficient_quota") && Date.now() - lastQuotaAlert > 3600_000 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    lastQuotaAlert = Date.now();
    ctx.waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: "🔴 Закончились деньги на OpenAI: ассистент не может отвечать на звонки и чат. Пополните баланс: https://platform.openai.com/settings/organization/billing" }),
    }).catch(() => {}));
  }
  // the call just ended: review it now
  if (role === "usage" && String(form.get("text")).includes('"kind":"call"')) {
    ctx.waitUntil(
      env.DB.prepare("SELECT COUNT(*) AS n FROM realtime_log WHERE call_id = ? AND role = 'user'").bind(callId).first<{ n: number }>()
        .then((r) => ((r?.n ?? 0) >= 2 ? reviewConversation(env, callId) : undefined))
        .catch((err) => console.error("review", err)),
    );
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------- website chat

// Compared on the same Armenian booking chat: gpt-6.1-terra was correct and quick (2-3.5 s);
// gpt-6-luna mixed up times, gpt-5.4-mini booked without a phone and the wrong service, gpt-5.5 was slow (4-6 s).
const CHAT_MODELS = ["gpt-6.1-terra", "gpt-6-luna", "gpt-5.4-mini", "gpt-5.5"];
const CHAT_MODEL = "gpt-6.1-terra";

/** Website chat: same instructions, phrasebook and calendar tools as the voice assistant, in text. */
async function chatReply(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { id?: string; biz?: string; messages?: { role?: string; content?: string }[]; model?: string };
  const biz = await bizBySlug(env.DB, body.biz);
  const chatId = cleanText(body.id, 64) || crypto.randomUUID();
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role as "user" | "assistant", content: cleanText(m.content, 1000) }));
  if (!history.length || history[history.length - 1].role !== "user") return json({ error: "bad_request" }, 400);
  const model = CHAT_MODELS.includes(body.model ?? "") ? body.model! : CHAT_MODEL;
  const out = await chatTurn(env, biz, chatId, history, model);
  return "error" in out ? json({ error: out.error }, 502) : json({ id: chatId, reply: out.reply, booked: out.booked, model });
}

/**
 * One chat reply with the calendar tools — the website chat and Instagram Direct share it.
 * chatId is the conversation (bookings made in it are the writer's own).
 */
async function chatTurn(env: Env, biz: number, chatId: string, history: { role: "user" | "assistant"; content: string }[], model = CHAT_MODEL): Promise<{ reply: string; booked: boolean } | { error: string }> {
  const conv: Record<string, unknown>[] = [{ role: "system", content: await assistantInstructions(env, { biz, name: "Անի", callerPhone: null, channel: "chat" }) }, ...history];
  // The page sends only the text of the chat, so tool results (booking ids) are gone by the next message:
  // remind the model what it booked here, so a later change replaces that booking instead of failing.
  const { results: made } = await env.DB.prepare("SELECT id, service_id, date, start_min, client_name FROM bookings WHERE business_id = ? AND conversation_id = ? AND status = 'confirmed'")
    .bind(biz, `chat-${chatId}`)
    .all<{ id: number; service_id: string; date: string; start_min: number; client_name: string | null }>();
  if (made.length) conv.splice(1, 0, { role: "system", content: `Bookings you made earlier in this chat: ${made.map((b) => `B-${1000 + b.id} ${b.service_id} ${b.date} ${toHHMM(b.start_min)} ${b.client_name ?? ""}`).join("; ")}.` });
  const tools = REALTIME_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const logLine = (role: string, text: string, ms?: number) =>
    env.DB.prepare("INSERT INTO realtime_log (business_id, call_id, turn, role, text, latency_ms) VALUES (?, ?, ?, ?, ?, ?)").bind(biz, `chat-${chatId}`, history.length, role, text.slice(0, 4000), ms ?? null).run();

  const t0 = Date.now();
  let booked = false;
  for (let round = 0; round < 5; round++) {
    // GPT-6 only allows function tools in chat completions with reasoning off
    const payload = JSON.stringify({ model, messages: conv, tools, ...(model.startsWith("gpt-6") ? { reasoning_effort: "none" } : {}) });
    // OpenAI sometimes stalls on one request (a 28-token reply once took 36 s): give up after 10 s and ask again
    const ask = (ms: number) => fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(ms),
    });
    let res: Response;
    try {
      res = await ask(10_000);
    } catch (err) {
      console.error("chat slow, retrying", err);
      res = await ask(20_000);
    }
    if (!res.ok) {
      console.error("chat", res.status, (await res.text()).slice(0, 300));
      return { error: "chat_failed" };
    }
    const data = (await res.json()) as { choices: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]; usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } } };
    // what each chat step costs, for the price per conversation
    if (data.usage) await env.DB.prepare("INSERT INTO realtime_log (business_id, call_id, turn, role, text) VALUES (?, ?, ?, 'usage', ?)")
      .bind(biz, `chat-${chatId}`, history.length, JSON.stringify({ kind: "chat", model, usage: data.usage })).run();
    const msg = data.choices[0].message;
    if (msg.tool_calls?.length) {
      conv.push(msg);
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {}
        // the chat has no caller ID: only bookings made in this chat are theirs to change
        const result = await runTool(env, call.function.name, args, { phone: null, conv: `chat-${chatId}`, biz });
        if (call.function.name === "create_booking" && (result as { success?: boolean }).success) booked = true;
        await logLine("event", `${call.function.name} ${JSON.stringify(args)} → ${JSON.stringify(result).slice(0, 600)}`);
        conv.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    let reply = (msg.content ?? "").replace(/[‹›]/g, "").trim(); // phrasebook slot marks
    if (/^[-–—.]*$/.test(reply)) reply = ""; // «-»: nothing to say (an emoji after a goodbye)
    await logLine("user", history[history.length - 1].content);
    await logLine("agent", reply, Date.now() - t0);
    return { reply, booked };
  }
  return { error: "too_many_steps" };
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

/** Everything a business owner manages: shared by the demo dashboard (/dashboard, password) and the cabinet (/app, accounts). */
async function shopState(env: Env, biz: number) {
  const from = addDays(localNow().date, -7);
  const [{ results: bookings }, { results: blocks }] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM bookings WHERE business_id = ? AND date >= ? ORDER BY date, start_min LIMIT 1000").bind(biz, from),
    env.DB.prepare("SELECT * FROM blocks WHERE business_id = ? AND date >= ? ORDER BY date, start_min").bind(biz, from),
  ]);
  const b = await env.DB.prepare("SELECT slug, category FROM businesses WHERE id = ?").bind(biz).first<{ slug: string; category: string }>();
  return { settings: await getSettings(env.DB, biz), services: await getServices(env.DB, biz, false), bookings, blocks, today: localNow().date, slug: b?.slug, category: b?.category };
}

/**
 * The owner's numbers for a period: bookings, clients, money, busy hours and days, services, loyal clients,
 * what the assistant brought in. Money is counted at today's price-list prices (a range → its middle).
 */
async function analytics(env: Env, biz: number, fromRaw: unknown, toRaw: unknown) {
  const today = localNow().date;
  const to = isDate(toRaw) ? toRaw : today;
  const from = isDate(fromRaw) && fromRaw <= to ? fromRaw : addDays(to, -29);
  const settings = await getSettings(env.DB, biz);
  const services = await getServices(env.DB, biz, false);
  type B = { id: number; service_id: string; service_name: string; date: string; start_min: number; client_name: string | null; phone: string | null; status: string; source: string; conversation_id: string | null; created_at: string };
  const [{ results: rows }, { results: earlier }, { results: convs }] = await env.DB.batch([
    env.DB.prepare("SELECT id, service_id, service_name, date, start_min, client_name, phone, status, source, conversation_id, created_at FROM bookings WHERE business_id = ? AND date BETWEEN ? AND ?").bind(biz, from, to),
    // clients seen before the period: everyone else in it is new
    env.DB.prepare("SELECT DISTINCT COALESCE(phone, client_name) AS k FROM bookings WHERE business_id = ? AND date < ? AND status = 'confirmed'").bind(biz, from),
    env.DB.prepare("SELECT call_id, MIN(created_at) AS at, SUM(role = 'user') AS turns, MAX(CASE WHEN role = 'usage' AND text LIKE '%\"kind\":\"call\"%' THEN CAST(json_extract(text, '$.seconds') AS INTEGER) END) AS seconds FROM realtime_log WHERE business_id = ? AND created_at >= ? AND created_at < ? GROUP BY call_id HAVING turns > 0").bind(biz, `${addDays(from, 0)} 00:00:00`, `${addDays(to, 1)} 04:00:00`),
  ]) as unknown as [{ results: B[] }, { results: { k: string }[] }, { results: { call_id: string; at: string; turns: number; seconds: number | null }[] }];

  const priceOf = (id: string) => { const s = resolveServices(services, id); return s ? (s.price_max ? Math.round((s.price_min + s.price_max) / 2) : s.price_min) : 0; };
  const nameOf = (b: B) => { const s = resolveServices(services, b.service_id); return s?.name_hy ?? b.service_name; };
  const ok = rows.filter((b) => b.status === "confirmed");
  const done = ok.filter((b) => b.date < today || (b.date === today && b.start_min < localNow().minutes));
  const key = (b: B) => b.phone || b.client_name || `#${b.id}`;
  const seenBefore = new Set(earlier.map((e) => e.k));

  const clients = new Map<string, { name: string | null; phone: string | null; visits: number; spent: number; last: string }>();
  for (const b of ok) {
    const c = clients.get(key(b)) ?? { name: b.client_name, phone: b.phone, visits: 0, spent: 0, last: b.date };
    c.visits++;
    c.spent += priceOf(b.service_id);
    if (b.date > c.last) c.last = b.date;
    clients.set(key(b), c);
  }
  const byHour = Array(24).fill(0), byWeekday = Array(7).fill(0);
  for (const b of ok) { byHour[Math.floor(b.start_min / 60)]++; byWeekday[weekdayOf(b.date)]++; }
  const byDay: { date: string; bookings: number; revenue: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = ok.filter((b) => b.date === d);
    byDay.push({ date: d, bookings: day.length, revenue: day.reduce((t, b) => t + priceOf(b.service_id), 0) });
    if (byDay.length > 400) break;
  }
  const svc = new Map<string, { name: string; count: number; revenue: number }>();
  for (const b of ok) {
    const s = svc.get(b.service_id) ?? { name: nameOf(b), count: 0, revenue: 0 };
    s.count++; s.revenue += priceOf(b.service_id);
    svc.set(b.service_id, s);
  }
  // booked by the assistant while the shop was closed (evening, night, a day off) — calls nobody would have taken
  const yerevan = (utc: string) => new Date(Date.parse(utc.replace(" ", "T") + "Z") + 4 * 3600_000);
  const afterHours = ok.filter((b) => {
    if (b.source === "manual") return false;
    const t = yerevan(b.created_at), h = settings.hours[t.getUTCDay()], m = t.getUTCHours() * 60 + t.getUTCMinutes();
    return !h || m < h[0] || m >= h[1];
  }).length;
  const channel = (b: B) => b.source === "manual" ? "manual" : b.conversation_id?.startsWith("chat-") ? "chat" : "call";
  const calls = convs.filter((c) => !c.call_id.startsWith("chat-"));

  return {
    from, to, today,
    bookings: ok.length,
    completed: done.length,
    upcoming: ok.length - done.length,
    cancelled: rows.length - ok.length,
    revenue: done.reduce((t, b) => t + priceOf(b.service_id), 0),
    expected: ok.filter((b) => !done.includes(b)).reduce((t, b) => t + priceOf(b.service_id), 0),
    avg_check: ok.length ? Math.round(ok.reduce((t, b) => t + priceOf(b.service_id), 0) / ok.length) : 0,
    clients: clients.size,
    new_clients: [...clients.keys()].filter((k) => !seenBefore.has(k)).length,
    returning_clients: [...clients.values()].filter((c) => c.visits >= 2).length,
    by_hour: byHour,
    by_weekday: byWeekday,
    by_day: byDay,
    services: [...svc.values()].sort((a, b) => b.count - a.count),
    top_clients: [...clients.values()].sort((a, b) => b.visits - a.visits || b.spent - a.spent).slice(0, 10),
    channels: { call: ok.filter((b) => channel(b) === "call").length, chat: ok.filter((b) => channel(b) === "chat").length, manual: ok.filter((b) => channel(b) === "manual").length },
    after_hours: afterHours,
    conversations: { calls: calls.length, chats: convs.length - calls.length, call_minutes: Math.round(calls.reduce((t, c) => t + (c.seconds ?? 0), 0) / 60) },
  };
}

async function shopApi(env: Env, biz: number, method: string, sub: string, body: Record<string, unknown>): Promise<Response> {
  if (sub === "state" && method === "GET") return json(await shopState(env, biz));
  if (sub === "analytics" && method === "GET") return json(await analytics(env, biz, body.from, body.to));

  if (sub === "settings" && method === "PUT") {
    const settings = validSettings(body, await getSettings(env.DB, biz));
    await env.DB.prepare("UPDATE businesses SET settings = ? WHERE id = ?").bind(JSON.stringify(settings), biz).run();
    return json({ settings });
  }

  if (sub === "services" && method === "PUT") {
    const services = validServices(body.services);
    const insert = env.DB.prepare("INSERT INTO services (business_id, id, category, name_hy, name_en, duration_min, price_min, price_max, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM services WHERE business_id = ?").bind(biz),
      ...services.map((s) => insert.bind(biz, s.id, s.category, s.name_hy, s.name_en, s.duration_min, s.price_min, s.price_max, s.active, s.sort)),
    ]);
    return json({ services });
  }

  if (sub === "bookings" && method === "POST") {
    const settings = await getSettings(env.DB, biz);
    const service = findService(await getServices(env.DB, biz, false), body.service_id);
    const start = parseHHMM(body.time);
    if (!service || !isDate(body.date) || start === null) throw new HttpError(400, "service, date and time are required");
    const starts = await freeStarts(env.DB, biz, settings, body.date, service.duration_min);
    if (!starts.includes(start)) return json({ error: "slot_taken" }, 409);
    const bookingId = await insertBooking(env, biz, service, body.date, start, {
      name: cleanText(body.client_name, 60),
      phone: normalizePhone(body.phone),
      source: "manual",
      conversationId: "",
    });
    return json({ booking_id: bookingId });
  }

  const cancel = /^bookings\/(\d+)\/cancel$/.exec(sub);
  if (cancel && method === "POST") {
    const res = await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND business_id = ?").bind(Number(cancel[1]), biz).run();
    return res.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404);
  }

  // Closed hours: a break, a day off. A whole day = from opening to closing.
  if (sub === "blocks" && method === "POST") {
    const start = parseHHMM(body.from), end = parseHHMM(body.to);
    if (!isDate(body.date) || start === null || end === null || start >= end) throw new HttpError(400, "date, from and to are required");
    const res = await env.DB.prepare("INSERT INTO blocks (business_id, date, start_min, end_min, note) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(biz, body.date, start, end, cleanText(body.note, 80) || null).first<{ id: number }>();
    return json({ id: res!.id });
  }
  const unblock = /^blocks\/(\d+)\/delete$/.exec(sub);
  if (unblock && method === "POST") {
    const res = await env.DB.prepare("DELETE FROM blocks WHERE id = ? AND business_id = ?").bind(Number(unblock[1]), biz).run();
    return res.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404);
  }

  return json({ error: "not_found" }, 404);
}

// A new owner's business starts with a typical barbershop price list they then edit (other fields get theirs later).
const BARBER_TEMPLATE: [string, string, string, string, number, number, number | null][] = [
  ["haircut", "main", "Կտրվածք", "Стрижка", 30, 10000, null],
  ["fade_cut", "main", "Ֆեյդ կտրվածք", "Фейд", 30, 10000, null],
  ["buzz_cut", "main", "Կտրվածք մեքենայով", "Стрижка машинкой", 30, 6000, null],
  ["beard_trim", "main", "Մորուքի մշակում", "Борода", 30, 6000, null],
  ["shave", "main", "Սափրում", "Бритьё", 30, 7000, null],
  ["junior_cut", "main", "Երեխայի կտրվածք", "Детская стрижка", 30, 7000, null],
  ["styling", "main", "Հարդարում", "Укладка", 30, 4000, null],
  ["haircut_beard", "combo", "Կտրվածք + մորուքի մշակում", "Стрижка + борода", 60, 16000, null],
  ["fade_beard", "combo", "Ֆեյդ կտրվածք + մորուքի մշակում", "Фейд + борода", 60, 16000, null],
  ["beard_tint", "color", "Մորուքի երանգավորում", "Окрашивание бороды", 30, 5000, 7000],
  ["hair_tint", "color", "Մազերի երանգավորում", "Окрашивание волос", 30, 7000, 9000],
];

async function newBusiness(env: Env, name: string, category: string): Promise<number> {
  const slug = `b${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  const settings: Settings = {
    enabled: true,
    shop_name: name,
    shop_name_spoken: "",
    address: "",
    greeting: "Բարև ձեզ, {shop}, ես {name}ն եմ։ Ինչո՞վ օգնեմ։",
    barbers: 1,
    hours: [null, [600, 1200], [600, 1200], [600, 1200], [600, 1200], [600, 1200], [600, 1200]],
    extra_instructions: "",
  };
  const row = await env.DB.prepare("INSERT INTO businesses (slug, category, settings) VALUES (?, ?, ?) RETURNING id").bind(slug, category, JSON.stringify(settings)).first<{ id: number }>();
  const biz = row!.id;
  if (category === "barber") {
    const insert = env.DB.prepare("INSERT INTO services (business_id, id, category, name_hy, name_en, duration_min, price_min, price_max, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    await env.DB.batch(BARBER_TEMPLATE.map(([id, cat, hy, ru, dur, min, max], i) => insert.bind(biz, id, cat, hy, ru, dur, min, max, i * 10)));
  }
  return biz;
}

// ---------------------------------------------------------------- Instagram Direct

const IG_API = "https://graph.instagram.com/v23.0";

/** Meta checks the webhook address once, then posts every new Direct message here. */
async function instagramWebhook(env: Env, req: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && !!env.INSTAGRAM_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === env.INSTAGRAM_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
  }
  const raw = await req.text();
  // only Meta can sign with the app secret
  if (!env.INSTAGRAM_APP_SECRET) return new Response("not configured", { status: 503 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.INSTAGRAM_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!safeEqual(req.headers.get("x-hub-signature-256") ?? "", `sha256=${sig}`)) return new Response("bad signature", { status: 401 });
  const body = JSON.parse(raw) as { entry?: { id: string; messaging?: { sender?: { id: string }; message?: { mid?: string; text?: string; is_echo?: boolean } }[] }[] };
  for (const entry of body.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      if (!m.message?.text || m.message.is_echo || !m.sender?.id || !m.message.mid) continue;
      ctx.waitUntil(instagramReply(env, entry.id, m.sender.id, m.message.mid, m.message.text).catch((err) => console.error("instagram", err)));
    }
  }
  return new Response("ok"); // answer Meta fast; the reply goes out in the background
}

async function instagramReply(env: Env, igUserId: string, senderId: string, mid: string, text: string) {
  if (senderId === igUserId) return;
  const account = await env.DB.prepare("SELECT business_id, token FROM instagram_accounts WHERE ig_user_id = ?").bind(igUserId).first<{ business_id: number; token: string }>();
  if (!account) {
    await env.DB.prepare("INSERT INTO realtime_log (business_id, call_id, turn, role, text) VALUES (1, 'instagram-unbound', 0, 'event', ?)").bind(`message for unknown Instagram account ${igUserId} from ${senderId}`).run();
    return;
  }
  const fresh = await env.DB.prepare("INSERT OR IGNORE INTO instagram_seen (mid) VALUES (?)").bind(mid).run();
  if (!fresh.meta.changes) return; // a retry of a message already answered
  // the conversation so far (Instagram allows replies within 24 h of the client's last message)
  const chatId = `ig-${senderId}`;
  const { results } = await env.DB.prepare(
    "SELECT role, text FROM realtime_log WHERE call_id = ? AND role IN ('user', 'agent') AND created_at > datetime('now', '-24 hours') ORDER BY id DESC LIMIT 20",
  ).bind(`chat-${chatId}`).all<{ role: string; text: string }>();
  const history = results.reverse().map((r) => ({ role: r.role === "user" ? ("user" as const) : ("assistant" as const), content: r.text }));
  history.push({ role: "user", content: cleanText(text, 1000) });
  const out = await chatTurn(env, account.business_id, chatId, history);
  const reply = "error" in out ? "Ներողություն, հիմա չեմ կարողանում պատասխանել։ Փորձեք մի փոքր ուշ։" : out.reply;
  if (!reply) return; // nothing to say (e.g. a like after the goodbye)
  // The stored token is the business's system user: it sends through the Facebook Page linked to the
  // Instagram account, with that Page's own token (the only way Meta accepted the reply).
  const payload = JSON.stringify({ recipient: { id: senderId }, message: { text: reply.slice(0, 1000) } });
  let note = "";
  const pages = (await (await fetch("https://graph.facebook.com/v23.0/me/accounts?fields=id,access_token,instagram_business_account", { headers: { authorization: `Bearer ${account.token}` } })).json()) as { data?: { id: string; access_token: string; instagram_business_account?: { id: string } }[] };
  const page = pages.data?.find((p) => p.instagram_business_account?.id === igUserId);
  if (!page) note = `no Facebook Page linked to ${igUserId} for this token`;
  else {
    const res = await fetch(`https://graph.facebook.com/v23.0/${page.id}/messages`, { method: "POST", headers: { authorization: `Bearer ${page.access_token}`, "content-type": "application/json" }, body: payload });
    note = res.ok ? "sent" : `${res.status} ${(await res.text()).slice(0, 300)}`;
  }
  await env.DB.prepare("INSERT INTO realtime_log (business_id, call_id, turn, role, text) VALUES (?, ?, ?, 'event', ?)")
    .bind(account.business_id, `chat-${chatId}`, history.length, `instagram send: ${note}`).run();
}

// «Connect Instagram» in the cabinet: Meta's Facebook Login for Business with the app's Instagram configuration.
// The owner picks their Facebook Page + Instagram account, Meta sends a code to /api/instagram/callback, and we keep
// the business token; replies go out through the Page linked to that Instagram account.
const META_APP_ID = "926376360409216";
const META_LOGIN_CONFIG = "1087680024268448";
const META_GRAPH = "https://graph.facebook.com/v23.0";
const igRedirect = (req: Request) => `${new URL(req.url).origin}/api/instagram/callback`;

async function instagramConnectUrl(env: Env, req: Request, businessId: number) {
  const exp = Date.now() + 15 * 60_000;
  const state = `${businessId}.${exp}.${await hmac(env.SESSION_SECRET, `ig:${businessId}:${exp}`)}`;
  const q = new URLSearchParams({ client_id: META_APP_ID, config_id: META_LOGIN_CONFIG, redirect_uri: igRedirect(req), response_type: "code", override_default_response_type: "true", state });
  return `https://www.facebook.com/v23.0/dialog/oauth?${q}`;
}

async function instagramCallback(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (result: string) => new Response(null, { status: 302, headers: { location: `/app/?ig=${result}` } });
  const user = await currentUser(env, req);
  const [biz, exp, sig] = (url.searchParams.get("state") ?? "").split(".");
  // the login must have started in this owner's cabinet, recently
  if (!user || !biz || Number(biz) !== user.business_id || Number(exp) < Date.now() || !safeEqual(sig ?? "", await hmac(env.SESSION_SECRET, `ig:${biz}:${exp}`))) return back("failed");
  const code = url.searchParams.get("code");
  if (!code || !env.INSTAGRAM_APP_SECRET) return back(url.searchParams.get("error") ? "cancelled" : "failed");
  const tokenRes = await fetch(`${META_GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: META_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, redirect_uri: igRedirect(req), code })}`);
  const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!tokenData.access_token) { console.error("instagram token", tokenData.error?.message); return back("failed"); }
  const token = tokenData.access_token;
  const pages = (await (await fetch(`${META_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { data?: { id: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] };
  const linked = (pages.data ?? []).filter((p) => p.instagram_business_account);
  if (!linked.length) return back("nopage");
  for (const p of linked) {
    const ig = p.instagram_business_account!;
    await env.DB.prepare("INSERT OR REPLACE INTO instagram_accounts (ig_user_id, business_id, username, token, token_expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(ig.id, user.business_id, ig.username ?? null, token, tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null).run();
    // ask Meta to send this Page's Instagram messages to our webhook
    await fetch(`${META_GRAPH}/${p.id}/subscribed_apps?subscribed_fields=messages`, { method: "POST", headers: { authorization: `Bearer ${p.access_token}` } }).catch(() => {});
  }
  return back("ok");
}

/** The owner's cabinet (/app): their own business only. */
async function cabinet(env: Env, req: Request, path: string): Promise<Response> {
  const user = await currentUser(env, req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (path === "/api/app/me" && req.method === "GET") {
    const me = await env.DB.prepare("SELECT u.name, u.email, u.lang, b.slug, b.category FROM users u JOIN businesses b ON b.id = u.business_id WHERE u.id = ?").bind(user.id).first();
    return json(me);
  }
  if (path === "/api/app/instagram" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT ig_user_id, username FROM instagram_accounts WHERE business_id = ?").bind(user.business_id).all<{ ig_user_id: string; username: string | null }>();
    return json({ accounts: results, connect_url: await instagramConnectUrl(env, req, user.business_id) });
  }
  if (path === "/api/app/instagram/disconnect" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM instagram_accounts WHERE business_id = ?").bind(user.business_id).run();
    return json({ ok: true });
  }
  const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  return shopApi(env, user.business_id, req.method, path.slice("/api/app/".length), body);
}

/** The demo barbershop's dashboard (/dashboard): one shared password. */
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
  const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  return shopApi(env, DEMO_BIZ, req.method, path.slice("/api/admin/".length), body);
}

// ---------------------------------------------------------------- router

// ---------------------------------------------------------------- call reviews

// A stronger model reads each finished call/chat and lists what the assistant got wrong. On test transcripts
// gpt-6-astra caught the Armenian mistakes gpt-6.1-sol missed («Ցանկա՞նք փոխել»), at ~$0.025 per call.
const REVIEW_MODEL = "gpt-6-astra";
const REVIEW_PRICE = { in: 10, cached: 1, out: 50 }; // $ per 1M tokens
const REVIEWS_SINCE = "2026-10-29 07:50:00"; // older conversations are not reviewed
const REVIEWS_PER_RUN = 2; // each takes 5-10 s and runs after a response (waitUntil allows ~30 s)
let lastSweep = 0;

const REVIEW_RUBRIC = `You review conversations of an AI receptionist of a barbershop in Yerevan. Only the ASSISTANT is judged; callers may speak slang.
Language: correct, polite, literate Eastern Armenian with «Դուք/Ձեզ/Ձեր» (never «դու»); no slang (ախպեր, էգուց, կարամ, «ա» for «է»); no English/Russian words in Armenian letters (օքեյ, պերֆեկտ); correct grammar and verb forms (e.g. «Փոխե՞մ» / «Ցանկանո՞ւմ եք», never «Ցանկա՞նք»); «բայց» only for a real contrast; Russian/English replies (times too) when the caller speaks them; very short; no sentence starting with «Խնդրում եմ».
Logic: never book a service the caller didn't name; book exactly what was asked (a group = one booking per person with their own service); bare hours 1–9 mean afternoon (չորսին = 16:00); outside opening hours is not "taken"; a dictated phone is confirmed by its last digits and saved in full; a change to a booking made in the same conversation is done by the assistant itself, not sent to an administrator; don't re-ask what the caller already said; times must match TOOL results and prices the price list; never say a booking is done before create_booking succeeded.
Return JSON only: {"verdict":"ok|minor|serious","issues":[{"severity":"minor|serious","type":"language|logic","quote":"exact assistant words","problem":"short, in Russian","fix":"what it should have said, in correct Armenian (or the right action, in Russian)"}]}. Don't flag correct things. Recognition mistakes in CALLER lines are not the assistant's fault unless it acted on an obviously wrong reading without checking.
House rules that are correct (don't flag): slang «թրաշ» / «թրաշ դզել» = beard trim (beard_trim); «մազ», «կտրվել» = haircut; a group is checked with one check_availability using people = N and the longest service; a call TOOL line shows the full calendar answer — read requested_time_free / free times there.`;

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Reviews conversations that have been quiet for 3 minutes. No cron (the account's free cron slots are
 * used up): it runs after API requests, at most once a minute per Worker instance, and right after a call ends.
 */
async function reviewFinishedConversations(env: Env, force = false) {
  if (!force && Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  // the privacy policy promises: call audio is kept 7 days at most
  await env.DB.prepare("UPDATE realtime_log SET audio = NULL, audio_type = NULL WHERE audio IS NOT NULL AND created_at < datetime('now', '-7 days')").run();
  const { results } = await env.DB.prepare(
    `SELECT call_id FROM realtime_log WHERE created_at > ? GROUP BY call_id
     HAVING MAX(created_at) < datetime('now', '-3 minutes') AND SUM(role = 'user') >= 2
       AND call_id NOT IN (SELECT call_id FROM call_reviews)
     ORDER BY MAX(id) LIMIT ?`,
  ).bind(REVIEWS_SINCE, REVIEWS_PER_RUN).all<{ call_id: string }>();
  for (const { call_id } of results) await reviewConversation(env, call_id);
}

async function reviewConversation(env: Env, callId: string) {
  // claim it first, so two Worker instances never pay for the same review
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO call_reviews (call_id, model, verdict) VALUES (?, ?, 'pending')").bind(callId, REVIEW_MODEL).run();
  if (!claim.meta.changes) return;
  const { results: rows } = await env.DB.prepare("SELECT role, text, created_at, business_id FROM realtime_log WHERE call_id = ? AND role IN ('user', 'agent', 'event') ORDER BY id")
    .bind(callId).all<{ role: string; text: string | null; created_at: string; business_id: number }>();
  const biz = rows[0]?.business_id ?? DEMO_BIZ;
  const lines = rows
    .filter((r) => r.text && !/^(turns:|data channel|connection |ignored a phrase|error Cancellation)/.test(r.text))
    .map((r) => `${r.role === "user" ? "CALLER" : r.role === "agent" ? "ASSISTANT" : "TOOL"}: ${r.role === "event" ? r.text!.slice(0, 1200) : r.text}`);
  const settings = await getSettings(env.DB, biz);
  const { servicesText, hoursText } = promptFacts(settings, await getServices(env.DB, biz, true));
  const today = localNow().date;
  const chat = callId.startsWith("chat-");
  const context = `Channel: ${chat ? "website chat (times may be written as digits; it never asks for a phone)" : "phone call"}. Today: ${today} (${weekdayName(today)}), Yerevan. Hours: ${hoursText}.\nPrice list (id | Armenian | English | duration | price):\n${servicesText}`;

  let verdict = "error", issues: { severity?: string; type?: string; quote?: string; problem?: string; fix?: string }[] = [], cost: number | null = null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        reasoning_effort: "low",
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: `${REVIEW_RUBRIC}\n\n${context}` }, { role: "user", content: lines.join("\n") }],
      }),
    });
    const data = (await res.json()) as { choices?: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } }; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `openai ${res.status}`);
    const u = data.usage!, cached = u.prompt_tokens_details?.cached_tokens ?? 0;
    cost = ((u.prompt_tokens - cached) * REVIEW_PRICE.in + cached * REVIEW_PRICE.cached + u.completion_tokens * REVIEW_PRICE.out) / 1e6;
    const out = JSON.parse(data.choices![0].message.content) as { verdict?: string; issues?: typeof issues };
    issues = Array.isArray(out.issues) ? out.issues : [];
    verdict = issues.some((i) => i.severity === "serious") ? "serious" : issues.length ? "minor" : "ok";
  } catch (err) {
    issues = [{ problem: String(err).slice(0, 300) }];
  }
  const saved = await env.DB.prepare("UPDATE call_reviews SET verdict = ?, issues = ?, cost_usd = ? WHERE call_id = ? RETURNING id")
    .bind(verdict, JSON.stringify(issues), cost, callId).first<{ id: number }>();
  if (!saved || (verdict !== "minor" && verdict !== "serious")) return;
  if (await notifyTelegram(env, settings.shop_name, saved.id, callId, rows[0]?.created_at, verdict, issues)) {
    await env.DB.prepare("UPDATE call_reviews SET notified = 1 WHERE id = ?").bind(saved.id).run();
  }
}

/** One message per reviewed conversation, written so the owner can just say «BV-12» to Claude. */
/** "Connect your business" form on the landing: saved, and sent to the owner's Telegram. */
async function saveLead(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = cleanText(body.name, 80), contact = cleanText(body.contact, 80);
  if (!name || !contact) return json({ error: "name_and_contact_required" }, 400);
  const industry = cleanText(body.industry, 30), company = cleanText(body.company, 120), lang = cleanText(body.lang, 5);
  const { meta } = await env.DB.prepare("INSERT INTO leads (name, contact, industry, company, lang) VALUES (?, ?, ?, ?, ?)").bind(name, contact, industry || null, company || null, lang || null).run();
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const text = `🟢 <b>Новая заявка UMNIK</b> #${meta.last_row_id}\n\n👤 ${escapeHtml(name)}\n📞 ${escapeHtml(contact)}\n🏷 ${escapeHtml(industry || "—")}${company ? `\n🏢 ${escapeHtml(company)}` : ""}\n🌐 ${lang === "hy" ? "армянский" : "русский"}`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
    }).catch((err) => console.error("lead telegram", err));
  }
  return json({ ok: true });
}

async function notifyTelegram(env: Env, shopName: string, id: number, callId: string, startedAt: string | undefined, verdict: string, issues: { severity?: string; type?: string; quote?: string; problem?: string; fix?: string }[]) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const when = startedAt ? new Date(startedAt.replace(" ", "T") + "Z").toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const head = `${verdict === "serious" ? "🔴" : "🟡"} <b>${escapeHtml(shopName)}</b> · ${callId.startsWith("chat-") ? "чат" : "звонок"} ${when}`;
  const body = issues.slice(0, 6).map((i, n) =>
    `${n + 1}. ${i.type === "language" ? "Язык" : "Логика"}${i.severity === "serious" ? " (серьёзно)" : ""}\n«${escapeHtml(i.quote ?? "")}»\n❌ ${escapeHtml(i.problem ?? "")}\n✅ ${escapeHtml(i.fix ?? "")}`,
  ).join("\n\n");
  const text = `${head}\n\n${body}\n\nКод для Claude: <code>BV-${id}</code>`;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
  });
  return res.ok;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/")) ctx.waitUntil(reviewFinishedConversations(env).catch((err) => console.error("reviews", err)));
    try {
      // Public: what the landing page needs to start a conversation and show prices.
      if (path === "/api/public/config" && req.method === "GET") {
        const biz = await bizBySlug(env.DB, new URL(req.url).searchParams.get("biz"));
        const settings = await getSettings(env.DB, biz);
        const services = await getServices(env.DB, biz, true);
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
        const { name, args, call_token } = (await req.json().catch(() => ({}))) as { name?: string; args?: Record<string, unknown>; call_token?: string };
        // the call pass from /api/realtime-session says who is calling; without it nothing can be changed
        const caller = (await readCallToken(env.SESSION_SECRET, call_token)) ?? { phone: null, conv: `anon-${crypto.randomUUID()}`, biz: DEMO_BIZ };
        return json(await runTool(env, name ?? "", args ?? {}, caller));
      }
      if (path === "/api/chat" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await chatReply(env, req);
      }
      if (path === "/api/lead" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await saveLead(env, req);
      }
      if (path === "/api/rt-log" && req.method === "POST") {
        const origin = req.headers.get("origin");
        if (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:"))) return json({ error: "forbidden" }, 403);
        return await realtimeLog(env, req, ctx);
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
        if (path === "/tools/check-availability") return json(await checkAvailability(env, body, DEMO_BIZ));
        if (path === "/tools/create-booking") return json(await createBooking(env, body, { phone: null, conv: cleanText(body.conversation_id, 80) || "elevenlabs", biz: DEMO_BIZ }));
        return json({ error: "not_found" }, 404);
      }

      if (path === "/webhooks/instagram") return await instagramWebhook(env, req, ctx);
      if (path === "/api/instagram/callback" && req.method === "GET") return await instagramCallback(env, req);
      if (path.startsWith("/api/admin/")) return await admin(env, req, path);
      if (path.startsWith("/api/auth/") || path.startsWith("/api/app/")) {
        // cookies ride along on every request to this site: writes must come from our own pages
        const origin = req.headers.get("origin");
        if (req.method !== "GET" && (!origin || (origin !== new URL(req.url).origin && !origin.startsWith("http://localhost:")))) return json({ error: "forbidden" }, 403);
        if (path.startsWith("/api/auth/")) return await authApi(env, req, path, (name, category) => newBusiness(env, name, category));
        return await cabinet(env, req, path);
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
