// Owner accounts for the cabinet (/app): sign up with a business, confirm the email, log in, reset the password.
// Passwords are PBKDF2 hashes; the session is an HMAC-signed HttpOnly cookie; confirmation and reset links
// are random tokens of which only the SHA-256 is stored.
import { cleanText, hmac, json, safeEqual } from "./util";

export interface AccountEnv {
  DB: D1Database;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
}

const COOKIE = "umnik_s";
const SESSION_DAYS = 30;
const VERIFY_TTL_MS = 48 * 3600_000;
const RESET_TTL_MS = 2 * 3600_000;
const PBKDF2_ITERATIONS = 100_000; // the most Workers allow
const FROM = "UMNIK <no-reply@umnik.getweboost.com>";
export const CATEGORIES = ["barber", "dental", "callcenter", "office", "food", "other"];

// ---------------------------------------------------------------- passwords and tokens

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

async function checkPassword(password: string, stored: string) {
  const [, iter, salt, hash] = stored.split("$");
  return safeEqual(b64(await pbkdf2(password, unb64(salt), Number(iter))), hash);
}

const sha256 = async (s: string) => b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);

async function sessionCookie(env: AccountEnv, userId: number) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const token = `${userId}.${exp}.${await hmac(env.SESSION_SECRET, `user:${userId}:${exp}`)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

/** The logged-in owner, or null. */
export async function currentUser(env: AccountEnv, req: Request): Promise<{ id: number; business_id: number } | null> {
  const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const [uid, exp, sig] = (raw ?? "").split(".");
  if (!uid || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(env.SESSION_SECRET, `user:${uid}:${exp}`))) return null;
  return env.DB.prepare("SELECT id, business_id FROM users WHERE id = ? AND email_verified_at IS NOT NULL").bind(Number(uid)).first();
}

// ---------------------------------------------------------------- email

const MAIL = {
  ru: {
    verifySubject: "Подтвердите почту — UMNIK",
    verifyText: "Чтобы закончить регистрацию, подтвердите адрес почты. Ссылка действует 48 часов.",
    verifyButton: "Подтвердить почту",
    resetSubject: "Новый пароль — UMNIK",
    resetText: "Вы запросили смену пароля. Ссылка действует 2 часа. Если это были не вы, просто проигнорируйте письмо.",
    resetButton: "Задать новый пароль",
    footer: "UMNIK — ИИ-администратор для бизнеса",
  },
  hy: {
    verifySubject: "Հաստատեք էլ. փոստը — UMNIK",
    verifyText: "Գրանցումն ավարտելու համար հաստատեք Ձեր էլ. փոստի հասցեն։ Հղումը գործում է 48 ժամ։",
    verifyButton: "Հաստատել էլ. փոստը",
    resetSubject: "Նոր գաղտնաբառ — UMNIK",
    resetText: "Դուք խնդրել եք փոխել գաղտնաբառը։ Հղումը գործում է 2 ժամ։ Եթե դա Դուք չեք եղել, պարզապես անտեսեք նամակը։",
    resetButton: "Սահմանել նոր գաղտնաբառ",
    footer: "UMNIK — ԻԻ ադմինիստրատոր բիզնեսի համար",
  },
};

function mailHtml(text: string, button: string, link: string, footer: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:28px 20px;color:#0b1a13">
<div style="font-size:22px;font-weight:800;color:#059669;letter-spacing:1px">UMNIK</div>
<p style="font-size:16px;line-height:1.5;margin:20px 0">${text}</p>
<a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">${button}</a>
<p style="font-size:12px;color:#64776d;margin-top:24px;word-break:break-all">${link}</p>
<p style="font-size:12px;color:#64776d">${footer}</p></div>`;
}

async function sendMail(env: AccountEnv, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function sendLink(env: AccountEnv, origin: string, user: { id: number; email: string; lang: string }, kind: "verify" | "reset") {
  const token = randomToken();
  const ttl = kind === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await env.DB.prepare("INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), user.id, kind, Date.now() + ttl).run();
  const m = MAIL[user.lang === "hy" ? "hy" : "ru"];
  const link = kind === "verify" ? `${origin}/api/auth/verify?token=${token}` : `${origin}/app/?reset=${token}`;
  await sendMail(env, user.email, kind === "verify" ? m.verifySubject : m.resetSubject, mailHtml(kind === "verify" ? m.verifyText : m.resetText, kind === "verify" ? m.verifyButton : m.resetButton, link, m.footer));
}

/** A link token: valid, unused and of this kind → its user id (and it's used up). */
async function useToken(env: AccountEnv, token: unknown, kind: "verify" | "reset"): Promise<number | null> {
  if (typeof token !== "string" || token.length < 20) return null;
  const row = await env.DB.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id")
    .bind(await sha256(token), kind, Date.now()).first<{ user_id: number }>();
  return row?.user_id ?? null;
}

// Recently sent links per user: no more than one email a minute, so the form can't be used to spam someone.
async function sentRecently(env: AccountEnv, userId: number, kind: string, ttl: number) {
  const row = await env.DB.prepare("SELECT MAX(expires_at) AS last FROM auth_tokens WHERE user_id = ? AND kind = ?").bind(userId, kind).first<{ last: number | null }>();
  return !!row?.last && row.last - ttl > Date.now() - 60_000;
}

// ---------------------------------------------------------------- routes

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const slowDown = () => new Promise((r) => setTimeout(r, 600));

/**
 * /api/auth/*. `newBusiness` creates the business row with its starting settings and services and returns its id.
 */
export async function authApi(env: AccountEnv, req: Request, path: string, newBusiness: (name: string, category: string) => Promise<number>): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;

  // the link in the confirmation email
  if (path === "/api/auth/verify" && req.method === "GET") {
    const userId = await useToken(env, url.searchParams.get("token"), "verify");
    if (!userId) return new Response(null, { status: 302, headers: { location: "/app/?verify=failed" } });
    await env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(userId).run();
    return new Response(null, { status: 302, headers: { location: "/app/?verify=ok", "set-cookie": await sessionCookie(env, userId) } });
  }

  if (req.method !== "POST") return json({ error: "not_found" }, 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = cleanText(body.email, 120).toLowerCase();
  const lang = body.lang === "hy" ? "hy" : "ru";

  if (path === "/api/auth/signup") {
    const name = cleanText(body.name, 80), business = cleanText(body.business, 80), password = typeof body.password === "string" ? body.password : "";
    const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "barber";
    if (!name || !business) return json({ error: "name_required" }, 400);
    if (!validEmail(email)) return json({ error: "bad_email" }, 400);
    if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);
    const existing = await env.DB.prepare("SELECT id, email_verified_at FROM users WHERE email = ?").bind(email).first<{ id: number; email_verified_at: string | null }>();
    if (existing) return json({ error: existing.email_verified_at ? "email_taken" : "email_not_verified" }, 409);
    const biz = await newBusiness(business, category);
    const user = await env.DB.prepare("INSERT INTO users (email, name, password_hash, business_id, lang) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(email, name, await hashPassword(password), biz, lang).first<{ id: number }>();
    try {
      await sendLink(env, origin, { id: user!.id, email, lang }, "verify");
    } catch (err) {
      // no email went out: undo the signup so they can simply try again
      console.error("signup mail", err);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM auth_tokens WHERE user_id = ?").bind(user!.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user!.id),
        env.DB.prepare("DELETE FROM services WHERE business_id = ?").bind(biz),
        env.DB.prepare("DELETE FROM businesses WHERE id = ?").bind(biz),
      ]);
      return json({ error: "email_failed" }, 502);
    }
    return json({ ok: true });
  }

  if (path === "/api/auth/resend") {
    const user = await env.DB.prepare("SELECT id, email, lang FROM users WHERE email = ? AND email_verified_at IS NULL").bind(email).first<{ id: number; email: string; lang: string }>();
    if (user && !(await sentRecently(env, user.id, "verify", VERIFY_TTL_MS))) await sendLink(env, origin, user, "verify");
    return json({ ok: true }); // same answer either way: don't reveal which emails exist
  }

  if (path === "/api/auth/login") {
    const user = await env.DB.prepare("SELECT id, password_hash, email_verified_at FROM users WHERE email = ?").bind(email).first<{ id: number; password_hash: string; email_verified_at: string | null }>();
    if (!user || typeof body.password !== "string" || !(await checkPassword(body.password, user.password_hash))) {
      await slowDown();
      return json({ error: "wrong_login" }, 401);
    }
    if (!user.email_verified_at) return json({ error: "email_not_verified" }, 403);
    return json({ ok: true }, 200, { "set-cookie": await sessionCookie(env, user.id) });
  }

  if (path === "/api/auth/logout") return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });

  if (path === "/api/auth/forgot") {
    const user = await env.DB.prepare("SELECT id, email, lang FROM users WHERE email = ?").bind(email).first<{ id: number; email: string; lang: string }>();
    if (user && !(await sentRecently(env, user.id, "reset", RESET_TTL_MS))) await sendLink(env, origin, user, "reset");
    return json({ ok: true });
  }

  if (path === "/api/auth/reset") {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);
    const userId = await useToken(env, body.token, "reset");
    if (!userId) return json({ error: "link_expired" }, 400);
    // a reset link proves the email too
    await env.DB.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(await hashPassword(password), userId).run();
    return json({ ok: true }, 200, { "set-cookie": await sessionCookie(env, userId) });
  }

  return json({ error: "not_found" }, 404);
}
