import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm";

const MAX_CALL_SEC = 240; // matches the agent's max_duration_seconds
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const T = {
  hy: {
    "pill.on": "Ասիստենտը միացված է",
    "pill.off": "Ասիստենտն անջատված է",
    "hero.title": "Զանգերին պատասխանում է <em>AI-ը</em>։ Դուք կտրում եք։",
    "hero.sub": "Գրանցում է հաճախորդներին հայերեն, ռուսերեն և անգլերեն՝ 24/7։ Հասկանում է և <q>թրաշս դզեմ</q>, և <q>էգուց 11-ին կարամ գամ</q>։",
    "demo.small": "Դեմո զանգ բարբերշոփին",
    "status.ready": "Պատրաստ է",
    "status.connecting": "Միանում է…",
    "status.live": "Եթերում",
    "status.off": "Անջատված է",
    "voice.female": "Անի", "voice.male": "Արամ",
    "voice.femaleHint": "Կանացի ձայն", "voice.maleHint": "Տղամարդու ձայն",
    "call.start": "Զանգել", "call.end": "Ավարտել", "call.demo": "Զանգել դեմոյին",
    "label.idle": "Սեղմեք «Զանգել» և խոսեք ինչպես սովորական զանգի ժամանակ",
    "label.mic": "Թույլատրեք միկրոֆոնը",
    "label.connected": "Միացված է, խոսեք",
    "label.speaking": "Խոսում է…",
    "label.listening": "Լսում է…",
    "label.ended": "Զանգն ավարտվեց։ Կարող եք կրկին զանգել։",
    "label.micBlocked": "Միկրոֆոնն արգելափակված է։ Թույլատրեք այն զննարկչում և կրկին փորձեք։",
    "label.error": "Չհաջողվեց միանալ, փորձեք մի քիչ հետո։",
    "label.disabled": "Բարբերն անջատել է ասիստենտին վահանակից։",
    "tool.check": ["Նայում է ազատ ժամերը…", "Ժամերը ստուգված են"],
    "tool.book": ["Գրանցում է…", "Գրանցված է ✓"],
    "tool.error": "Համակարգի սխալ",
    "try.title": "Փորձեք ասել",
    "caller.summary": "Զանգողի համարը (դեմո)",
    "caller.hint": "Իրական զանգի ժամանակ համարը որոշվում է ավտոմատ, և ասիստենտը հարցնում է՝ պահե՞լ այն։",
    "stat.always": "առանց հանգստյան",
    "stat.langs": "լեզու՝ ՀԱՅ, РУС, ENG",
    "stat.missed": "բաց թողնված զանգ",
    "how.title": "Ինչպես է աշխատում",
    "how.sub": "Ամբողջ զանգը տևում է կես րոպե։",
    "how.1.t": "Հաճախորդը զանգում է", "how.1.d": "Ձեր սովորական համարին։ Եթե զբաղված եք, պատասխանում է ասիստենտը։",
    "how.2.t": "Ասիստենտը ստուգում է օրացույցը", "how.2.d": "Ասում է ազատ ժամը, գինը և գրանցում մի քանի վայրկյանում։",
    "how.3.t": "Դուք տեսնում եք գրանցումը", "how.3.d": "Վահանակում, Altegio-ում կամ Google Օրացույցում։",
    "feat.title": "Խոսում է ինչպես ձեր ադմինիստրատորը",
    "feat.sub": "Միայն ավելի արագ ու առանց բաց թողնված զանգերի։",
    "feat.slang.t": "Հասկանում է խոսակցական հայերենը", "feat.slang.d": "Ժարգոն, ռուսերեն բառեր, «ախպեր ջան»՝ ամեն ինչ հասկանում է։",
    "feat.short.t": "Խոսում է կարճ ու արագ", "feat.short.d": "Առանց երկար բացատրությունների՝ «Հա, ազատ է։ Գրանցե՞մ»։",
    "feat.phone.t": "Պահում է զանգողի համարը", "feat.phone.d": "Հարցնում է՝ պահե՞լ համարը, և գրանցումը պատրաստ է։",
    "feat.control.t": "Ամբողջական կառավարում", "feat.control.d": "Միացնել և անջատել, փոխել գները, ծառայություններն ու ժամերը՝ հեռախոսից։",
    "int.title": "Ինտեգրացիաներ", "int.sub": "Գրանցումները գնում են այնտեղ, որտեղ արդեն աշխատում եք։",
    "int.altegio": "Օնլայն գրանցում և CRM", "int.gcal": "Գրանցումները՝ ձեր օրացույցում", "int.crm": "CRM համակարգեր", "int.phone": "Հայկական համարներ",
    "prices.title": "Դեմո բարբերշոփի գները",
    "prices.sub": "Ասիստենտը գները վերցնում է վահանակից։ Փոխեք այնտեղ, և հաջորդ զանգին արդեն նոր գինը կասի։",
    "cat.main": "Ծառայություններ", "cat.combo": "Կոմբո", "cat.color": "Երանգավորում",
    "min": "րոպե", "amd": "դր",
    "cta.title": "Ուզու՞մ եք նույնը ձեր բարբերշոփի համար",
    "cta.sub": "Միացնում ենք ձեր համարին և օրացույցին մեկ օրում։",
    "cta.dashboard": "Բացել վահանակը",
    "nav.dashboard": "Բարբերի վահանակ",
  },
  ru: {
    "pill.on": "Ассистент включён",
    "pill.off": "Ассистент выключен",
    "hero.title": "На звонки отвечает <em>ИИ</em>. Вы стрижёте.",
    "hero.sub": "Записывает клиентов на армянском, русском и английском 24/7. Понимает и <q>թրաշս դզեմ</q>, и <q>էգուց 11-ին կարամ գամ</q>.",
    "demo.small": "Демо-звонок в барбершоп",
    "status.ready": "Готов",
    "status.connecting": "Соединяем…",
    "status.live": "В эфире",
    "status.off": "Выключен",
    "voice.female": "Ани", "voice.male": "Арам",
    "voice.femaleHint": "Женский голос", "voice.maleHint": "Мужской голос",
    "call.start": "Позвонить", "call.end": "Завершить", "call.demo": "Позвонить в демо",
    "label.idle": "Нажмите «Позвонить» и говорите, как в обычном звонке",
    "label.mic": "Разрешите доступ к микрофону",
    "label.connected": "Соединено, говорите",
    "label.speaking": "Говорит…",
    "label.listening": "Слушает…",
    "label.ended": "Звонок завершён. Можно позвонить ещё раз.",
    "label.micBlocked": "Микрофон заблокирован. Разрешите его в браузере и попробуйте снова.",
    "label.error": "Не удалось соединиться, попробуйте чуть позже.",
    "label.disabled": "Барбер выключил ассистента в панели управления.",
    "tool.check": ["Смотрит свободное время…", "Время проверено"],
    "tool.book": ["Записывает…", "Записано ✓"],
    "tool.error": "Ошибка системы",
    "try.title": "Попробуйте сказать",
    "caller.summary": "Номер звонящего (демо)",
    "caller.hint": "В настоящем звонке номер определяется автоматически, и ассистент спрашивает, сохранить ли его.",
    "stat.always": "без выходных",
    "stat.langs": "языка: ՀԱՅ, РУС, ENG",
    "stat.missed": "пропущенных звонков",
    "how.title": "Как это работает",
    "how.sub": "Весь звонок занимает полминуты.",
    "how.1.t": "Клиент звонит", "how.1.d": "На ваш обычный номер. Если вы заняты, отвечает ассистент.",
    "how.2.t": "Ассистент смотрит календарь", "how.2.d": "Называет свободное время, цену и записывает за пару секунд.",
    "how.3.t": "Вы видите запись", "how.3.d": "В панели управления, в Altegio или в Google Календаре.",
    "feat.title": "Говорит, как ваш администратор",
    "feat.sub": "Только быстрее и без пропущенных звонков.",
    "feat.slang.t": "Понимает разговорный армянский", "feat.slang.d": "Жаргон, русские слова, «ախպեր ջան» — понимает всё.",
    "feat.short.t": "Говорит коротко и быстро", "feat.short.d": "Без долгих объяснений: «Да, свободно. Записать?»",
    "feat.phone.t": "Сохраняет номер звонящего", "feat.phone.d": "Спрашивает, сохранить ли номер, — и запись готова.",
    "feat.control.t": "Полное управление", "feat.control.d": "Включить и выключить, менять цены, услуги и часы работы — с телефона.",
    "int.title": "Интеграции", "int.sub": "Записи попадают туда, где вы уже работаете.",
    "int.altegio": "Онлайн-запись и CRM", "int.gcal": "Записи в вашем календаре", "int.crm": "CRM-системы", "int.phone": "Армянские номера",
    "prices.title": "Цены демо-барбершопа",
    "prices.sub": "Ассистент берёт цены из панели управления. Поменяйте там — и в следующем звонке он назовёт новую цену.",
    "cat.main": "Услуги", "cat.combo": "Комбо", "cat.color": "Окрашивание",
    "min": "мин", "amd": "др",
    "cta.title": "Хотите такого же ассистента для своего барбершопа?",
    "cta.sub": "Подключим к вашему номеру и календарю за один день.",
    "cta.dashboard": "Открыть панель",
    "nav.dashboard": "Панель барбера",
  },
  en: {
    "pill.on": "Assistant is on",
    "pill.off": "Assistant is off",
    "hero.title": "<em>AI</em> answers the calls. You keep cutting.",
    "hero.sub": "Books clients in Armenian, Russian and English, 24/7. Understands street Armenian too, like <q>թրաշս դզեմ</q> and <q>էգուց 11-ին կարամ գամ</q>.",
    "demo.small": "Demo call to a barbershop",
    "status.ready": "Ready",
    "status.connecting": "Connecting…",
    "status.live": "Live",
    "status.off": "Off",
    "voice.female": "Ani", "voice.male": "Aram",
    "voice.femaleHint": "Female voice", "voice.maleHint": "Male voice",
    "call.start": "Call", "call.end": "Hang up", "call.demo": "Call the demo",
    "label.idle": "Tap “Call” and talk like on a normal phone call",
    "label.mic": "Allow microphone access",
    "label.connected": "Connected, go ahead",
    "label.speaking": "Speaking…",
    "label.listening": "Listening…",
    "label.ended": "Call ended. You can call again.",
    "label.micBlocked": "The microphone is blocked. Allow it in your browser and try again.",
    "label.error": "Couldn’t connect, please try again in a moment.",
    "label.disabled": "The barber has switched the assistant off in the dashboard.",
    "tool.check": ["Checking free times…", "Times checked"],
    "tool.book": ["Booking…", "Booked ✓"],
    "tool.error": "System error",
    "try.title": "Try saying",
    "caller.summary": "Caller’s number (demo)",
    "caller.hint": "On a real call the number is detected automatically, and the assistant asks whether to save it.",
    "stat.always": "no days off",
    "stat.langs": "languages: ՀԱՅ, РУС, ENG",
    "stat.missed": "missed calls",
    "how.title": "How it works",
    "how.sub": "The whole call takes half a minute.",
    "how.1.t": "A client calls", "how.1.d": "Your usual number. If you’re busy, the assistant picks up.",
    "how.2.t": "The assistant checks the calendar", "how.2.d": "Gives the free time and the price, and books in seconds.",
    "how.3.t": "You see the booking", "how.3.d": "In the dashboard, Altegio or Google Calendar.",
    "feat.title": "Talks like your front desk",
    "feat.sub": "Just faster, and it never misses a call.",
    "feat.slang.t": "Understands everyday Armenian", "feat.slang.d": "Slang, Russian words, «ախպեր ջան» — it gets all of it.",
    "feat.short.t": "Short and quick", "feat.short.d": "No long speeches: “Yes, it’s free. Shall I book you?”",
    "feat.phone.t": "Saves the caller’s number", "feat.phone.d": "Asks whether to save the number, and the booking is done.",
    "feat.control.t": "Full control", "feat.control.d": "Switch it on and off, change prices, services and hours from your phone.",
    "int.title": "Integrations", "int.sub": "Bookings land where you already work.",
    "int.altegio": "Online booking and CRM", "int.gcal": "Bookings in your calendar", "int.crm": "CRM systems", "int.phone": "Armenian numbers",
    "prices.title": "Demo barbershop prices",
    "prices.sub": "The assistant takes prices from the dashboard. Change them there, and it quotes the new price on the next call.",
    "cat.main": "Services", "cat.combo": "Combos", "cat.color": "Coloring",
    "min": "min", "amd": "AMD",
    "cta.title": "Want the same for your barbershop?",
    "cta.sub": "We connect it to your number and calendar in one day.",
    "cta.dashboard": "Open the dashboard",
    "nav.dashboard": "Barber dashboard",
  },
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), orb = $("orb"), label = $("label"), transcript = $("transcript");
const startBtn = $("startBtn"), endBtn = $("endBtn"), fab = $("fab");
const VOICES = window.BARBER_VOICE?.voices ?? {};

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let lang = T[store.get("bvLang")] ? store.get("bvLang") : "hy";
let voice = store.get("bvVoice") === "male" ? "male" : "female";
let config = null; // from /api/public/config
let conversation = null;
let connecting = false;
let timerId = null, rafId = null;
let labelKey = "label.idle";

const t = (key) => T[lang][key] ?? T.hy[key] ?? key;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  document.querySelectorAll(".voice .av").forEach((el) => (el.textContent = t(`voice.${el.closest(".voice").dataset.voice}`)[0]));
  setLabel(labelKey);
  renderPill();
  renderPrices();
  if (!conversation && !connecting) setStatus(config && !config.enabled ? "off" : "idle");
}

function setLabel(key) {
  labelKey = key;
  label.textContent = t(key);
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text ?? t({ idle: "status.ready", busy: "status.connecting", live: "status.live", off: "status.off" }[state]);
}

function renderPill() {
  const on = !config || config.enabled;
  $("pillDot").classList.toggle("off", !on);
  $("pillText").textContent = t(on ? "pill.on" : "pill.off");
}

const fmtPrice = (s) => {
  const n = (v) => v.toLocaleString("ru-RU").replace(/ /g, " ");
  return `${s.price_max ? `${n(s.price_min)}–${n(s.price_max)}` : n(s.price_min)} ${t("amd")}`;
};

function renderPrices() {
  if (!config) return;
  const groups = ["main", "combo", "color"].map((cat) => [cat, config.services.filter((s) => s.category === cat)]).filter(([, list]) => list.length);
  $("priceList").replaceChildren(
    ...groups.map(([cat, list]) => {
      const g = document.createElement("div");
      g.className = "price-group";
      g.innerHTML = `<h3></h3>`;
      g.firstChild.textContent = t(`cat.${cat}`);
      for (const s of list) {
        const row = document.createElement("div");
        row.className = "price-row";
        row.innerHTML = `<div class="nm"><b></b><span></span></div><div class="pr"></div>`;
        row.querySelector("b").textContent = lang === "hy" ? s.name_hy : s.name_en;
        row.querySelector(".nm span").textContent = `${lang === "hy" ? s.name_en : s.name_hy} · ${s.duration_min} ${t("min")}`;
        row.querySelector(".pr").textContent = fmtPrice(s);
        g.append(row);
      }
      return g;
    }),
  );
}

async function loadConfig() {
  try {
    const res = await fetch("/api/public/config", { cache: "no-store" });
    config = await res.json();
    $("shopName").textContent = config.shop_name;
  } catch {
    config = null;
  }
  applyLang();
}

function setVoice(v) {
  voice = v;
  store.set("bvVoice", v);
  document.querySelectorAll(".voice").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.voice === v)));
}

function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  transcript.append(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
}

function setInCall(inCall) {
  startBtn.hidden = inCall;
  endBtn.hidden = !inCall;
  $("tries").hidden = inCall;
  $("voices").style.pointerEvents = inCall ? "none" : "";
  $("voices").style.opacity = inCall ? "0.5" : "";
  fab.classList.remove("show");
}

function startTimer() {
  const endsAt = Date.now() + MAX_CALL_SEC * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    setStatus("live", `${t("status.live")} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  };
  tick();
  timerId = setInterval(tick, 1000);
}

function animateOrb() {
  if (!conversation) return;
  const level = Math.min(1, Math.max(conversation.getOutputVolume?.() ?? 0, (conversation.getInputVolume?.() ?? 0) * 0.6) * 2.2);
  orb.style.setProperty("--level", level.toFixed(3));
  rafId = requestAnimationFrame(animateOrb);
}

function resetUi(key) {
  clearInterval(timerId);
  cancelAnimationFrame(rafId);
  orb.style.setProperty("--level", 0);
  orb.dataset.mode = "idle";
  setStatus(config && !config.enabled ? "off" : "idle");
  setLabel(key);
  setInCall(false);
}

/** Everything the assistant needs to know, fresh from the dashboard. */
function dynamicVariables() {
  const name = T[lang][`voice.${voice}`];
  const shop = config.shop_name;
  const today = `${config.today} (${WEEKDAYS[new Date(config.today + "T00:00:00Z").getUTCDay()]})`;
  return {
    assistant_name: name,
    shop_name: shop,
    address: config.address || "-",
    greeting: config.greeting.replaceAll("{shop}", shop).replaceAll("{name}", T.hy[`voice.${voice}`]),
    today,
    hours: config.hours_text,
    services: config.services_text,
    extra_instructions: config.extra_instructions || "-",
    caller_phone: $("callerPhone").value.trim() || "unknown",
  };
}

async function start() {
  if (conversation || connecting) return;
  await loadConfig(); // pick up the barber's latest prices / on-off switch
  if (!config) return setLabel("label.error");
  if (!config.enabled) return setLabel("label.disabled");
  const agentId = window.BARBER_VOICE?.agentId;
  if (!agentId) return setLabel("label.error");

  connecting = true;
  setStatus("busy");
  setLabel("label.mic");
  setInCall(true);

  try {
    // Ask for the mic first so we can show a clear message if it's blocked.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
  } catch {
    connecting = false;
    resetUi("label.micBlocked");
    return;
  }

  transcript.replaceChildren();
  const pendingTools = {};
  const toolLabel = (name) => ({ check_availability: t("tool.check"), create_booking: t("tool.book") })[name];

  try {
    conversation = await Conversation.startSession({
      agentId,
      connectionType: "webrtc",
      overrides: { tts: { voiceId: VOICES[voice]?.id }, ...(lang !== "hy" ? { agent: { language: lang } } : {}) },
      dynamicVariables: dynamicVariables(),
      onConnect: () => {
        startTimer();
        setLabel("label.connected");
        animateOrb();
      },
      onDisconnect: () => {
        conversation = null;
        resetUi("label.ended");
      },
      onError: (message) => {
        console.error(message);
        setLabel("label.error");
      },
      onModeChange: ({ mode }) => {
        orb.dataset.mode = mode === "speaking" ? "speaking" : "listening";
        setLabel(mode === "speaking" ? "label.speaking" : "label.listening");
      },
      onMessage: ({ message, role, source }) => {
        const who = role ?? (source === "ai" ? "agent" : "user");
        // Strip expressive voice tags like "[happy]" that the TTS model uses.
        const text = message?.replace(/\[[a-z ]{2,20}\]\s*/gi, "").trim();
        if (text) addMessage(text, who === "user" ? "user" : "agent");
      },
      onAgentToolRequest: (req) => {
        const labels = toolLabel(req?.tool_name);
        if (labels) pendingTools[req.tool_call_id ?? req.tool_name] = addMessage(labels[0], "tool");
      },
      onAgentToolResponse: (res) => {
        const labels = toolLabel(res?.tool_name);
        if (!labels) return;
        const key = res.tool_call_id ?? res.tool_name;
        const el = pendingTools[key] ?? addMessage("", "tool");
        el.textContent = res.is_error ? t("tool.error") : labels[1];
        if (!res.is_error) el.classList.add("ok");
        delete pendingTools[key];
      },
    });
  } catch (err) {
    console.error(err);
    conversation = null;
    resetUi("label.error");
  } finally {
    connecting = false;
  }
}

startBtn.addEventListener("click", start);
endBtn.addEventListener("click", () => conversation?.endSession());
document.querySelectorAll("[data-start]").forEach((el) =>
  el.addEventListener("click", () => {
    $("assistant").scrollIntoView({ behavior: "smooth", block: "center" });
    start();
  }),
);
document.querySelectorAll(".voice").forEach((b) => b.addEventListener("click", () => setVoice(b.dataset.voice)));
document.querySelectorAll("#langs button").forEach((b) =>
  b.addEventListener("click", () => {
    lang = b.dataset.lang;
    store.set("bvLang", lang);
    applyLang();
  }),
);
$("callerPhone").value = store.get("bvCaller") ?? "";
$("callerPhone").addEventListener("change", (e) => store.set("bvCaller", e.target.value.trim()));

// Floating call button appears on phones once the demo card scrolls away.
new IntersectionObserver(([entry]) => fab.classList.toggle("show", !entry.isIntersecting && !conversation && !connecting), { threshold: 0.15 }).observe($("assistant"));

setVoice(voice);
applyLang();
loadConfig();
