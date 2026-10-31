// Test page for one business's assistant (/try/?biz=<slug>): the same voice call and chat as the landing demo,
// with the conversation text shown so the owner can check what it understood.
import { startCall } from "/realtime-call.js";

const T = {
  ru: {
    back: "← В кабинет", call: "Позвонить", chat: "Написать", end: "Завершить", ani: "Ани", aram: "Арам", female: "Женский голос", male: "Мужской голос",
    callerSum: "Номер звонящего", callerHint: "По этому номеру ассистент находит записи, чтобы перенести или отменить их. На настоящей линии номер определится сам.",
    notFound: "Бизнес не найден", on: "Ассистент включён", off: "Ассистент выключен", ready: "Готов", connecting: "Соединяем…", live: "В эфире",
    idle: "Нажмите «Позвонить» и говорите, как в обычном звонке", mic: "Разрешите доступ к микрофону", listening: "Слушает…", speaking: "Говорит…", hearing: "Распознаёт…",
    ended: "Звонок завершён.", quota: "Технический сбой: ассистент временно недоступен. Попробуйте позже.", micBlocked: "Микрофон заблокирован. Разрешите его в браузере.", error: "Не удалось соединиться, попробуйте позже.", disabled: "Ассистент выключен в кабинете.",
    placeholder: "Напишите сообщение…", chatError: "Не удалось ответить, попробуйте ещё раз.", booked: "Записано ✓",
    check: "Смотрит календарь…", checked: "Календарь проверен", book: "Записывает…", bookedTool: "Записано ✓", failed: "Не удалось записать", toolError: "Ошибка системы",
  },
  hy: {
    back: "← Վերադառնալ էջ", call: "Զանգել", chat: "Գրել", end: "Ավարտել", ani: "Անի", aram: "Արամ", female: "Կանացի ձայն", male: "Տղամարդու ձայն",
    callerSum: "Զանգողի համարը", callerHint: "Այս համարով օգնականը գտնում է գրանցումները՝ փոխելու կամ չեղարկելու համար։ Իրական գծում համարը կորոշվի ինքնաբերաբար։",
    notFound: "Բիզնեսը չի գտնվել", on: "Օգնականը միացված է", off: "Օգնականն անջատված է", ready: "Պատրաստ է", connecting: "Միանում է…", live: "Եթերում",
    idle: "Սեղմեք «Զանգել» և խոսեք ինչպես սովորական զանգի ժամանակ", mic: "Թույլատրեք միկրոֆոնը", listening: "Լսում է…", speaking: "Խոսում է…", hearing: "Հասկանում է…",
    ended: "Զանգն ավարտվեց։", quota: "Տեխնիկական խափանում․ օգնականը ժամանակավորապես հասանելի չէ։ Փորձեք ավելի ուշ։", micBlocked: "Միկրոֆոնն արգելափակված է։ Թույլատրեք այն դիտարկիչում։", error: "Չհաջողվեց միանալ, փորձեք ավելի ուշ։", disabled: "Օգնականն անջատված է էջում։",
    placeholder: "Գրեք հաղորդագրություն…", chatError: "Չհաջողվեց պատասխանել, փորձեք կրկին։", booked: "Գրանցված է ✓",
    check: "Նայում է օրացույցը…", checked: "Օրացույցը ստուգված է", book: "Գրանցում է…", bookedTool: "Գրանցված է ✓", failed: "Չհաջողվեց գրանցել", toolError: "Համակարգի սխալ",
  },
};
const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const lang = T[store.get("bvLang")] ? store.get("bvLang") : "ru";
const t = (k) => T[lang][k] ?? k;
const biz = new URLSearchParams(location.search).get("biz") ?? "";
let config = null, voice = "female", call = null, raf = 0;

document.documentElement.lang = lang;
document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
$("chatInput").placeholder = t("placeholder");
$("callerPhone").value = store.get("bvCaller") ?? "";
$("callerPhone").addEventListener("change", (e) => store.set("bvCaller", e.target.value.trim()));

const setStatus = (state, text) => { $("status").dataset.state = state; $("status").textContent = text ?? t({ idle: "ready", busy: "connecting", live: "live", off: "off" }[state]); };
const label = (k) => ($("label").textContent = t(k));

function add(text, cls, logId = "transcript") {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  $(logId).append(div);
  $(logId).scrollTop = $(logId).scrollHeight;
  return div;
}

async function load() {
  const res = await fetch(`/api/public/config?biz=${encodeURIComponent(biz)}`, { cache: "no-store" });
  if (!res.ok) { $("notFound").hidden = false; return; }
  config = await res.json();
  $("assistant").hidden = false;
  $("shopName").textContent = config.shop_name;
  $("av").textContent = config.shop_name.trim()[0]?.toUpperCase() ?? "U";
  $("pillDot").classList.toggle("off", !config.enabled);
  $("pillText").textContent = t(config.enabled ? "on" : "off");
  setStatus(config.enabled ? "idle" : "off");
  label("idle");
}

const callText = (k) => ({ "tool.check": t("check"), "tool.checked": t("checked"), "tool.book": t("book"), "tool.booked": t("bookedTool"), "tool.failed": t("failed"), "tool.error": t("toolError"), "voice.error": t("error") })[k] ?? k;

function stop(key = "ended") {
  call?.stop();
  call = null;
  cancelAnimationFrame(raf);
  $("orb").dataset.mode = "idle";
  $("orb").style.setProperty("--level", 0);
  $("startBtn").hidden = false;
  $("endBtn").hidden = true;
  setStatus("idle");
  label(key);
}

$("startBtn").addEventListener("click", async () => {
  if (call) return;
  await load();
  if (!config?.enabled) return label("disabled");
  $("startBtn").hidden = true;
  $("endBtn").hidden = false;
  $("transcript").replaceChildren();
  setStatus("busy");
  label("mic");
  try {
    call = await startCall({ voice, caller: $("callerPhone").value.trim(), biz }, {
      add: (text, cls) => add(text, cls),
      t: callText,
      state: (s) => { label({ hearing: "listening", answering: "hearing", failed: "error", quota: "quota" }[s] ?? "listening"); if (s === "failed") stop("error"); if (s === "quota") stop("quota"); },
      speaking: (on) => { $("orb").dataset.mode = on ? "speaking" : "listening"; if (on) label("speaking"); },
    });
    setStatus("live");
    $("orb").dataset.mode = "listening";
    const tick = () => { if (!call) return; $("orb").style.setProperty("--level", call.level().toFixed(3)); raf = requestAnimationFrame(tick); };
    tick();
  } catch (err) {
    console.error(err);
    call = null;
    stop(/Permission|NotAllowed|getUserMedia/i.test(String(err?.message ?? err)) ? "micBlocked" : "error");
  }
});
$("endBtn").addEventListener("click", () => stop());
document.querySelectorAll(".voice").forEach((b) => b.addEventListener("click", () => {
  voice = b.dataset.voice;
  document.querySelectorAll(".voice").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
}));

// chat
let chatId = null, history = [], busy = false;
async function openChat() {
  if (history.length || !config) return;
  const greeting = config.greeting.replaceAll("{shop}", config.shop_name).replaceAll("{name}", "Անի");
  history.push({ role: "assistant", content: greeting });
  add(greeting, "agent", "chatLog");
}
$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text || busy) return;
  $("chatInput").value = "";
  busy = true;
  history.push({ role: "user", content: text });
  add(text, "user", "chatLog");
  const typing = add("•••", "agent typing", "chatLog");
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chatId, biz, messages: history }) });
    const data = await res.json();
    if (!res.ok || data.reply === undefined) throw new Error(data.error);
    chatId = data.id;
    typing.remove();
    if (data.booked) add(t("booked"), "tool ok", "chatLog");
    if (data.reply) { history.push({ role: "assistant", content: data.reply }); add(data.reply, "agent", "chatLog"); }
  } catch {
    typing.remove();
    history.pop();
    add(t("chatError"), "tool", "chatLog");
  } finally {
    busy = false;
  }
});
document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => {
  if (call) return;
  const chat = b.dataset.mode === "chat";
  document.querySelectorAll(".modes button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  $("chatPane").hidden = !chat;
  $("callPane").hidden = chat;
  if (chat) openChat();
}));

load();
