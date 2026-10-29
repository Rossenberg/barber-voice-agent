// Armenia is UTC+4 all year (no daylight saving).
const TZ_OFFSET_MIN = 4 * 60;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Current local date (YYYY-MM-DD) and minutes since midnight. */
export function localNow(nowMs = Date.now()): { date: string; minutes: number } {
  const d = new Date(nowMs + TZ_OFFSET_MIN * 60_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function isDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const addDays = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const weekdayOf = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();

export const weekdayName = (date: string) => WEEKDAYS[weekdayOf(date)];

export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function parseHHMM(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
}

/** Normalizes to +<digits>. Accepts Armenian local format 0XXXXXXXX. */
export function normalizePhone(s: unknown): string | null {
  if (typeof s !== "string") return null;
  let digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (/^0\d{8}$/.test(digits)) digits = "+374" + digits.slice(1);
  if (/^374\d{8}$/.test(digits)) digits = "+" + digits;
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}

export const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

/** Dashboard session token: "<expiry ms>.<hmac>". */
export async function makeToken(secret: string, ttlMs: number): Promise<string> {
  const exp = String(Date.now() + ttlMs);
  return `${exp}.${await hmac(secret, `admin:${exp}`)}`;
}

export async function checkToken(secret: string, token: string): Promise<boolean> {
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, `admin:${exp}`));
}

/**
 * Call pass: "<payload>.<hmac>" naming the caller's number (caller ID) and this conversation. The assistant's
 * calendar tools trust only this — never a phone number the model passes — when finding, changing or
 * cancelling someone's bookings, so nobody can touch another person's booking by dictating their number.
 */
export async function makeCallToken(secret: string, data: { phone: string | null; conv: string }, ttlMs: number): Promise<string> {
  const payload = btoa(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
  return `${payload}.${await hmac(secret, `call:${payload}`)}`;
}

export async function readCallToken(secret: string, token: unknown): Promise<{ phone: string | null; conv: string } | null> {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(secret, `call:${payload}`))) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { phone?: string | null; conv?: string; exp?: number };
    if (!data.conv || !data.exp || data.exp < Date.now()) return null;
    return { phone: data.phone ?? null, conv: data.conv };
  } catch {
    return null;
  }
}
