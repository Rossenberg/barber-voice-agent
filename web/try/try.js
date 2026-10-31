// Test page for one business's assistant (/try/?biz=<slug>): the same chat as the landing demo and Instagram Direct.
const T = {
  ru: {
    back: "← В кабинет", hint: "Так ассистент отвечает вашим клиентам в чате и в Instagram Direct. Запись появится в вашем календаре.",
    notFound: "Бизнес не найден", on: "Ассистент включён", off: "Ассистент выключен", ready: "Готов", offState: "Выключен", disabled: "Ассистент выключен в кабинете.",
    placeholder: "Напишите сообщение…", greet: "Здравствуйте! Это {shop}, я Ани. Чем могу помочь?", chatError: "Не удалось ответить, попробуйте ещё раз.", booked: "Записано ✓",
  },
  hy: {
    back: "← Վերադառնալ էջ", hint: "Այսպես է օգնականը պատասխանում Ձեր հաճախորդներին չատում և Instagram Direct-ում։ Գրանցումը կհայտնվի Ձեր օրացույցում։",
    notFound: "Բիզնեսը չի գտնվել", on: "Օգնականը միացված է", off: "Օգնականն անջատված է", ready: "Պատրաստ է", offState: "Անջատված է", disabled: "Օգնականն անջատված է էջում։",
    placeholder: "Գրեք հաղորդագրություն…", chatError: "Չհաջողվեց պատասխանել, փորձեք կրկին։", booked: "Գրանցված է ✓",
  },
};
const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } } };
const lang = T[store.get("bvLang")] ? store.get("bvLang") : "ru";
const t = (k) => T[lang][k] ?? k;
const biz = new URLSearchParams(location.search).get("biz") ?? "";
let config = null;

document.documentElement.lang = lang;
document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
$("chatInput").placeholder = t("placeholder");

function add(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  $("chatLog").append(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
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
  $("status").dataset.state = config.enabled ? "idle" : "off";
  $("status").textContent = t(config.enabled ? "ready" : "offState");
  if (!config.enabled) return add(t("disabled"), "tool");
  const greeting = (lang === "ru" ? t("greet") : config.greeting).replaceAll("{shop}", config.shop_name).replaceAll("{name}", "Անի");
  history.push({ role: "assistant", content: greeting });
  add(greeting, "agent");
}

let chatId = null, history = [], busy = false;
$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text || busy) return;
  $("chatInput").value = "";
  busy = true;
  history.push({ role: "user", content: text });
  add(text, "user");
  const typing = add("•••", "agent typing");
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chatId, biz, messages: history }) });
    const data = await res.json();
    if (!res.ok || data.reply === undefined) throw new Error(data.error);
    chatId = data.id;
    typing.remove();
    if (data.booked) add(t("booked"), "tool ok");
    if (data.reply) { history.push({ role: "assistant", content: data.reply }); add(data.reply, "agent"); }
  } catch {
    typing.remove();
    history.pop();
    add(t("chatError"), "tool");
  } finally {
    busy = false;
    $("chatInput").focus();
  }
});

load();
