// UMNIK cabinet: sign up / log in, then the owner's own calendar, services, hours and a link to test their assistant.
const T = {
  ru: {
    logout: "Выйти",
    "auth.login": "Вход", "auth.signup": "Регистрация",
    "login.title": "С возвращением", "login.go": "Войти", "login.forgot": "Забыли пароль?",
    "signup.title": "Создайте кабинет", "signup.sub": "Добавите услуги и часы — и ассистент начнёт отвечать о вашем бизнесе.", "signup.go": "Зарегистрироваться",
    "f.name": "Ваше имя", "f.business": "Название бизнеса", "f.category": "Сфера", "f.password": "Пароль", "f.newPassword": "Пароль (минимум 8 символов)",
    "cat.barber": "Барбершоп или салон", "cat.dental": "Стоматология или клиника — скоро", "cat.office": "Офис или сервис — скоро", "cat.food": "Фастфуд или доставка — скоро",
    "sent.title": "Проверьте почту", "sent.text": "Мы отправили ссылку для подтверждения на", "sent.spam": "Если письма нет — загляните в «Спам».", "sent.resend": "Отправить ещё раз", "sent.again": "Отправили ещё раз.",
    "back.login": "← Ко входу",
    "forgot.title": "Восстановить пароль", "forgot.sub": "Пришлём ссылку для нового пароля.", "forgot.go": "Отправить ссылку", "forgot.done": "Если такой адрес зарегистрирован, письмо уже в пути.",
    "reset.title": "Новый пароль", "reset.go": "Сохранить и войти",
    "err.wrong_login": "Неверная почта или пароль.", "err.bad_email": "Проверьте адрес почты.", "err.weak_password": "Пароль должен быть не короче 8 символов.",
    "err.name_required": "Заполните имя и название бизнеса.", "err.email_taken": "Эта почта уже зарегистрирована. Войдите или восстановите пароль.",
    "err.email_not_verified": "Почта ещё не подтверждена. Мы можем отправить письмо ещё раз.", "err.link_expired": "Ссылка устарела. Запросите новую.",
    "err.slot_taken": "Это время уже занято.", "err.email_failed": "Не удалось отправить письмо. Попробуйте ещё раз через минуту.", "err.network": "Нет связи с сервером. Попробуйте ещё раз.", "err.generic": "Что-то пошло не так. Попробуйте ещё раз.",
    "verify.ok": "Почта подтверждена. Добро пожаловать!", "verify.failed": "Ссылка подтверждения устарела. Войдите, чтобы получить новую.",
    "tab.calendar": "Календарь", "tab.services": "Услуги", "tab.settings": "Настройки", "tab.test": "Проверить", "tab.stats": "Аналитика",
    "st.today": "Сегодня", "st.7": "7 дней", "st.30": "30 дней", "st.month": "Этот месяц", "st.90": "3 месяца",
    "k.revenue": "Заработано", "k.revenueHint": "за прошедшие визиты", "k.expected": "ещё ожидается", "k.bookings": "Записей", "k.cancelled": "отмен",
    "k.clients": "Клиентов", "k.new": "новых", "k.returning": "Пришли повторно", "k.returningHint": "2 и более визита", "k.avg": "Средний чек",
    "k.after": "Записи в нерабочее время", "k.afterHint": "их принял ассистент, когда вы были закрыты", "k.conv": "Разговоров ассистента", "k.convHint": "звонков · чатов · минут",
    "ch.day": "Записи по дням", "ch.dayHint": "наведите на столбик, чтобы увидеть число", "ch.hour": "Самые активные часы", "ch.weekday": "Самые активные дни",
    "ch.services": "Популярные услуги", "ch.channels": "Откуда записи", "ch.call": "Звонок", "ch.chat": "Чат", "ch.manual": "Вручную",
    "ch.clients": "Постоянные клиенты", "ch.client": "Клиент", "ch.visits": "Визитов", "ch.spent": "Сумма",
    "st.peak": "Пик:", "st.empty": "За этот период записей нет.", "st.note": "Суммы — по текущим ценам вашего прайса.", "bookingsWord": "зап.",
    "cal.add": "Запись", "cal.block": "Закрыть часы", "cal.closedDay": "Выходной", "cal.empty": "Записей пока нет", "cal.emptyHint": "Записи ассистента появятся здесь сами.",
    "cal.closed": "Закрыто", "cal.manual": "вручную", "cal.cancelled": "отменена", "cal.cancelAsk": "Отменить запись?", "cal.unblockAsk": "Открыть эти часы снова?",
    "cal.today": "Сегодня", "cal.tomorrow": "Завтра",
    "dlg.booking": "Новая запись", "dlg.block": "Закрыть часы", "dlg.service": "Услуга", "dlg.time": "Время", "dlg.client": "Имя клиента", "dlg.phone": "Телефон", "dlg.from": "С", "dlg.to": "До", "dlg.note": "Комментарий", "dlg.allDay": "Весь день",
    "srv.title": "Услуги и цены", "srv.sub": "Ассистент называет только эти услуги и цены. Армянское название он произносит клиенту.", "srv.add": "Услуга",
    "srv.hy": "Название по-армянски", "srv.ru": "Название по-русски", "srv.dur": "Минут", "srv.price": "Цена, ֏", "srv.max": "До, ֏", "srv.on": "Активна", "srv.del": "Удалить", "srv.saved": "Сохранено. Ассистент уже знает новые цены.",
    "set.enabled": "Ассистент отвечает клиентам", "set.enabledHint": "Выключите — и он вежливо попросит перезвонить позже.",
    "set.business": "Бизнес", "set.name": "Название", "set.spoken": "Как ассистент произносит название (армянскими буквами)", "set.address": "Адрес",
    "set.barbers": "Сколько клиентов можно принять одновременно (мастеров)", "set.hours": "Часы работы", "set.extra": "Что ещё должен знать ассистент", "set.extraHint": "Парковка, оплата картой, акции — коротко, любым языком.",
    "set.saved": "Сохранено.",
    save: "Сохранить",
    "test.title": "Проверьте своего ассистента", "test.sub": "Он уже знает ваши услуги, цены и часы. Позвоните или напишите — запись появится в вашем календаре.",
    "test.call": "Позвонить и написать", "test.copy": "Скопировать ссылку", "test.copied": "Ссылка скопирована", "test.note": "Подключение вашего телефонного номера — следующий шаг. Пока проверяйте по этой ссылке.",
    days: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"], daysLong: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
  hy: {
    logout: "Ելք",
    "auth.login": "Մուտք", "auth.signup": "Գրանցում",
    "login.title": "Բարի վերադարձ", "login.go": "Մուտք գործել", "login.forgot": "Մոռացե՞լ եք գաղտնաբառը",
    "signup.title": "Ստեղծեք Ձեր էջը", "signup.sub": "Ավելացրեք ծառայություններն ու ժամերը, և օգնականը կսկսի պատասխանել Ձեր բիզնեսի մասին։", "signup.go": "Գրանցվել",
    "f.name": "Ձեր անունը", "f.business": "Բիզնեսի անվանումը", "f.category": "Ոլորտ", "f.password": "Գաղտնաբառ", "f.newPassword": "Գաղտնաբառ (առնվազն 8 նիշ)",
    "cat.barber": "Բարբերշոփ կամ սրահ", "cat.dental": "Ատամնաբուժություն կամ կլինիկա — շուտով", "cat.office": "Գրասենյակ կամ ծառայություն — շուտով", "cat.food": "Արագ սնունդ կամ առաքում — շուտով",
    "sent.title": "Ստուգեք Ձեր էլ. փոստը", "sent.text": "Հաստատման հղումն ուղարկեցինք", "sent.spam": "Եթե նամակը չկա, նայեք «Սպամ» բաժինը։", "sent.resend": "Ուղարկել կրկին", "sent.again": "Կրկին ուղարկեցինք։",
    "back.login": "← Վերադառնալ մուտքին",
    "forgot.title": "Վերականգնել գաղտնաբառը", "forgot.sub": "Կուղարկենք նոր գաղտնաբառի հղում։", "forgot.go": "Ուղարկել հղումը", "forgot.done": "Եթե այդ հասցեն գրանցված է, նամակն արդեն ճանապարհին է։",
    "reset.title": "Նոր գաղտնաբառ", "reset.go": "Պահպանել և մուտք գործել",
    "err.wrong_login": "Սխալ էլ. փոստ կամ գաղտնաբառ։", "err.bad_email": "Ստուգեք էլ. փոստի հասցեն։", "err.weak_password": "Գաղտնաբառը պետք է լինի առնվազն 8 նիշ։",
    "err.name_required": "Լրացրեք անունը և բիզնեսի անվանումը։", "err.email_taken": "Այս էլ. փոստն արդեն գրանցված է։ Մուտք գործեք կամ վերականգնեք գաղտնաբառը։",
    "err.email_not_verified": "Էլ. փոստը դեռ հաստատված չէ։ Կարող ենք նամակը կրկին ուղարկել։", "err.link_expired": "Հղումը հնացել է։ Խնդրեք նորը։",
    "err.slot_taken": "Այս ժամն արդեն զբաղված է։", "err.email_failed": "Չհաջողվեց ուղարկել նամակը։ Փորձեք կրկին մեկ րոպեից։", "err.network": "Սերվերի հետ կապ չկա։ Փորձեք կրկին։", "err.generic": "Ինչ-որ բան սխալ գնաց։ Փորձեք կրկին։",
    "verify.ok": "Էլ. փոստը հաստատված է։ Բարի գալուստ։", "verify.failed": "Հաստատման հղումը հնացել է։ Մուտք գործեք՝ նորը ստանալու համար։",
    "tab.calendar": "Օրացույց", "tab.services": "Ծառայություններ", "tab.settings": "Կարգավորումներ", "tab.test": "Ստուգել", "tab.stats": "Վերլուծություն",
    "st.today": "Այսօր", "st.7": "7 օր", "st.30": "30 օր", "st.month": "Այս ամիս", "st.90": "3 ամիս",
    "k.revenue": "Վաստակ", "k.revenueHint": "անցած այցերից", "k.expected": "դեռ սպասվում է", "k.bookings": "Գրանցումներ", "k.cancelled": "չեղարկված",
    "k.clients": "Հաճախորդներ", "k.new": "նոր", "k.returning": "Կրկին եկել են", "k.returningHint": "2 և ավելի այց", "k.avg": "Միջին չեկ",
    "k.after": "Գրանցումներ ոչ աշխատանքային ժամին", "k.afterHint": "դրանք ընդունել է օգնականը, երբ փակ էիք", "k.conv": "Օգնականի զրույցներ", "k.convHint": "զանգ · չատ · րոպե",
    "ch.day": "Գրանցումներ ըստ օրերի", "ch.dayHint": "սյան վրա պահեք՝ թիվը տեսնելու համար", "ch.hour": "Ամենաակտիվ ժամերը", "ch.weekday": "Ամենաակտիվ օրերը",
    "ch.services": "Հայտնի ծառայություններ", "ch.channels": "Որտեղից են գրանցումները", "ch.call": "Զանգ", "ch.chat": "Չատ", "ch.manual": "Ձեռքով",
    "ch.clients": "Մշտական հաճախորդներ", "ch.client": "Հաճախորդ", "ch.visits": "Այց", "ch.spent": "Գումար",
    "st.peak": "Գագաթ՝", "st.empty": "Այս ժամանակահատվածում գրանցումներ չկան։", "st.note": "Գումարները՝ Ձեր գնացուցակի ընթացիկ գներով։", "bookingsWord": "գրանց.",
    "cal.add": "Գրանցում", "cal.block": "Փակել ժամերը", "cal.closedDay": "Հանգստյան օր", "cal.empty": "Գրանցումներ դեռ չկան", "cal.emptyHint": "Օգնականի գրանցումներն ինքնաբերաբար կհայտնվեն այստեղ։",
    "cal.closed": "Փակ է", "cal.manual": "ձեռքով", "cal.cancelled": "չեղարկված", "cal.cancelAsk": "Չեղարկե՞լ գրանցումը", "cal.unblockAsk": "Կրկին բացե՞լ այս ժամերը",
    "cal.today": "Այսօր", "cal.tomorrow": "Վաղը",
    "dlg.booking": "Նոր գրանցում", "dlg.block": "Փակել ժամերը", "dlg.service": "Ծառայություն", "dlg.time": "Ժամ", "dlg.client": "Հաճախորդի անունը", "dlg.phone": "Հեռախոս", "dlg.from": "Սկսած", "dlg.to": "Մինչև", "dlg.note": "Մեկնաբանություն", "dlg.allDay": "Ամբողջ օրը",
    "srv.title": "Ծառայություններ և գներ", "srv.sub": "Օգնականն ասում է միայն այս ծառայություններն ու գները։ Հայերեն անվանումն է նա արտասանում հաճախորդին։", "srv.add": "Ծառայություն",
    "srv.hy": "Անվանումը հայերեն", "srv.ru": "Անվանումը ռուսերեն", "srv.dur": "Րոպե", "srv.price": "Գին, ֏", "srv.max": "Մինչև, ֏", "srv.on": "Ակտիվ", "srv.del": "Ջնջել", "srv.saved": "Պահպանված է։ Օգնականն արդեն գիտի նոր գները։",
    "set.enabled": "Օգնականը պատասխանում է հաճախորդներին", "set.enabledHint": "Անջատեք, և նա քաղաքավարի կխնդրի զանգել ավելի ուշ։",
    "set.business": "Բիզնես", "set.name": "Անվանում", "set.spoken": "Ինչպես է օգնականն արտասանում անվանումը (հայերեն տառերով)", "set.address": "Հասցե",
    "set.barbers": "Քանի հաճախորդ կարելի է ընդունել միաժամանակ (վարպետներ)", "set.hours": "Աշխատանքային ժամեր", "set.extra": "Ինչ ևս պետք է իմանա օգնականը", "set.extraHint": "Կայանատեղի, քարտով վճարում, ակցիաներ՝ կարճ, ցանկացած լեզվով։",
    "set.saved": "Պահպանված է։",
    save: "Պահպանել",
    "test.title": "Ստուգեք Ձեր օգնականին", "test.sub": "Նա արդեն գիտի Ձեր ծառայությունները, գներն ու ժամերը։ Զանգեք կամ գրեք, և գրանցումը կհայտնվի Ձեր օրացույցում։",
    "test.call": "Զանգել և գրել", "test.copy": "Պատճենել հղումը", "test.copied": "Հղումը պատճենված է", "test.note": "Ձեր հեռախոսահամարի միացումը հաջորդ քայլն է։ Առայժմ ստուգեք այս հղումով։",
    days: ["Կիր", "Երկ", "Երք", "Չրք", "Հնգ", "Ուրբ", "Շբթ"], daysLong: ["Կիրակի", "Երկուշաբթի", "Երեքշաբթի", "Չորեքշաբթի", "Հինգշաբթի", "Ուրբաթ", "Շաբաթ"],
    months: ["հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի", "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի"],
  },
};

const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let lang = T[store.get("bvLang")] ? store.get("bvLang") : navigator.language?.startsWith("ru") ? "ru" : "hy";
const t = (k) => T[lang][k] ?? T.ru[k] ?? k;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weekday = (d) => new Date(d + "T00:00:00Z").getUTCDay();

let me = null, state = null, day = null, editServices = null;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  document.title = `${lang === "hy" ? "Անձնական էջ" : "Кабинет"} — UMNIK`;
  if (state) { render(); if (statsData) renderStats(); }
}

function toast(text, err = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast${err ? " err" : ""}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}

async function api(path, body, method = body ? "POST" : "GET") {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  } catch {
    throw new Error("network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "generic"), { status: res.status });
  return data;
}
const errText = (e) => t(`err.${e.message}`) === `err.${e.message}` ? t("err.generic") : t(`err.${e.message}`);

// ---------------------------------------------------------------- auth

// Sign-up is not open to everyone yet (clients get access another way): only /app/?signup=1 shows it.
const signupOpen = new URLSearchParams(location.search).has("signup");
document.querySelector(".auth-tabs").hidden = !signupOpen;

function showAuth(pane) {
  $("loading").hidden = true;
  $("cab").hidden = true;
  $("auth").hidden = false;
  $("logout").hidden = true;
  $("bizName").textContent = "";
  document.querySelectorAll("#auth [data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== pane));
  document.querySelectorAll(".auth-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.auth === pane)));
  document.querySelectorAll("#auth [data-msg]").forEach((m) => { m.textContent = ""; m.className = "form-msg"; });
  document.querySelector(`#auth [data-pane="${pane}"] input`)?.focus();
}
document.querySelectorAll("[data-auth]").forEach((b) => b.addEventListener("click", () => showAuth(b.dataset.auth)));

function formMsg(form, text, ok = false) {
  const m = form.querySelector("[data-msg]");
  m.textContent = text;
  m.className = `form-msg${ok ? " ok" : ""}`;
}

async function submitting(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { formMsg(form, errText(e)); } finally { if (btn) btn.disabled = false; }
}

let pendingEmail = "";
$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  submitting(f, async () => {
    try {
      await api("/api/auth/login", d);
    } catch (err) {
      if (err.message === "email_not_verified") { pendingEmail = d.email; $("sentTo").textContent = d.email; showAuth("sent"); formMsg($("auth").querySelector('[data-pane="sent"]'), t("err.email_not_verified")); return; }
      throw err;
    }
    await boot();
  });
});
$("signupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  if (!d.name.trim() || !d.business.trim()) return formMsg(f, t("err.name_required"));
  if (String(d.password).length < 8) return formMsg(f, t("err.weak_password"));
  submitting(f, async () => {
    await api("/api/auth/signup", { ...d, lang });
    pendingEmail = d.email;
    $("sentTo").textContent = d.email;
    showAuth("sent");
  });
});
$("resend").addEventListener("click", async () => {
  const pane = $("auth").querySelector('[data-pane="sent"]');
  try { await api("/api/auth/resend", { email: pendingEmail }); formMsg(pane, t("sent.again"), true); } catch (e) { formMsg(pane, errText(e)); }
});
$("forgotForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  submitting(f, async () => { await api("/api/auth/forgot", Object.fromEntries(new FormData(f))); formMsg(f, t("forgot.done"), true); });
});
$("resetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, password = new FormData(f).get("password");
  if (String(password).length < 8) return formMsg(f, t("err.weak_password"));
  submitting(f, async () => {
    await api("/api/auth/reset", { token: new URLSearchParams(location.search).get("reset"), password });
    history.replaceState(null, "", "/app/");
    await boot();
  });
});
$("logout").addEventListener("click", async () => { await api("/api/auth/logout", {}).catch(() => {}); state = me = null; showAuth("login"); });

// ---------------------------------------------------------------- cabinet

async function boot() {
  try {
    me = await api("/api/app/me");
    state = await api("/api/app/state");
  } catch (e) {
    if (e.status === 401) return showAuth(new URLSearchParams(location.search).has("reset") ? "reset" : "login");
    $("loading").hidden = true;
    return toast(errText(e), true);
  }
  $("loading").hidden = true;
  $("auth").hidden = true;
  $("cab").hidden = false;
  $("logout").hidden = false;
  day ??= state.today;
  editServices = null;
  render();
}

async function reload() {
  state = await api("/api/app/state");
  render();
}

function render() {
  $("bizName").textContent = state.settings.shop_name;
  $("cabTitle").textContent = state.settings.shop_name;
  renderDays();
  renderDay();
  renderServices();
  renderSettings();
  const link = `${location.origin}/try/?biz=${me.slug}`;
  $("tryCall").href = link;
}

document.querySelectorAll(".cab-tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".cab-tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  document.querySelectorAll("#cab .pane").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  if (b.dataset.tab === "calendar") reload().catch(() => {});
  if (b.dataset.tab === "stats") loadStats();
}));

const hoursOf = (d) => state.settings.hours[weekday(d)];
const dayLabel = (d) => d === state.today ? t("cal.today") : d === addDays(state.today, 1) ? t("cal.tomorrow") : t("daysLong")[weekday(d)];

function renderDays() {
  const wrap = $("days");
  wrap.replaceChildren();
  for (let i = 0; i < 21; i++) {
    const d = addDays(state.today, i);
    const n = state.bookings.filter((b) => b.date === d && b.status === "confirmed").length;
    const btn = document.createElement("button");
    btn.className = `day${hoursOf(d) ? "" : " closed"}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(d === day));
    btn.innerHTML = `<small>${t("days")[weekday(d)]}</small><b>${Number(d.slice(8))}</b>${n ? `<span class="cnt">${n}</span>` : ""}`;
    btn.addEventListener("click", () => { day = d; renderDays(); renderDay(); });
    wrap.append(btn);
  }
  wrap.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function renderDay() {
  const h = hoursOf(day);
  $("dayTitle").textContent = `${dayLabel(day)}, ${Number(day.slice(8))} ${t("months")[Number(day.slice(5, 7)) - 1]}`;
  $("dayHours").textContent = h ? `${hhmm(h[0])}–${hhmm(h[1])}` : t("cal.closedDay");
  const items = [
    ...state.bookings.filter((b) => b.date === day).map((b) => ({ kind: "booking", start: b.start_min, b })),
    ...state.blocks.filter((b) => b.date === day).map((b) => ({ kind: "block", start: b.start_min, b })),
  ].sort((a, b) => a.start - b.start || (a.b.status === "cancelled") - (b.b.status === "cancelled"));
  const list = $("dayList");
  if (!items.length) {
    list.innerHTML = `<div class="empty"><b>${esc(t("cal.empty"))}</b>${esc(t("cal.emptyHint"))}</div>`;
    return;
  }
  list.replaceChildren(...items.map(({ kind, b }) => {
    const el = document.createElement("div");
    if (kind === "block") {
      el.className = "item block";
      el.innerHTML = `<div class="t">${hhmm(b.start_min)}<small>${hhmm(b.end_min)}</small></div><div class="who"><b>${esc(t("cal.closed"))}</b><span>${esc(b.note ?? "")}</span></div><button class="icon-btn" aria-label="${esc(t("cal.unblockAsk"))}">×</button>`;
      el.querySelector("button").addEventListener("click", async () => {
        if (!confirm(t("cal.unblockAsk"))) return;
        try { await api(`/api/app/blocks/${b.id}/delete`, {}); await reload(); } catch (e) { toast(errText(e), true); }
      });
    } else {
      const cancelled = b.status !== "confirmed";
      el.className = `item${cancelled ? " cancelled" : ""}`;
      const source = b.source === "manual" ? `<span class="tag">${esc(t("cal.manual"))}</span>` : `<span class="tag ai">UMNIK</span>`;
      el.innerHTML = `<div class="t">${hhmm(b.start_min)}<small>${hhmm(b.end_min)}</small></div>
        <div class="who"><b>${esc(b.client_name || "—")}</b><span>${esc(b.service_name)}${b.phone ? ` · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ""}</span>
        <div class="tags">${source}${cancelled ? `<span class="tag">${esc(t("cal.cancelled"))}</span>` : ""}</div></div>
        ${cancelled ? "<span></span>" : `<button class="icon-btn" aria-label="${esc(t("cal.cancelAsk"))}">×</button>`}`;
      el.querySelector("button")?.addEventListener("click", async () => {
        if (!confirm(t("cal.cancelAsk"))) return;
        try { await api(`/api/app/bookings/${b.id}/cancel`, {}); await reload(); } catch (e) { toast(errText(e), true); }
      });
    }
    return el;
  }));
}

// dialogs: add a booking, close hours
const dlg = $("dlg");
dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
let dlgSubmit = null;
$("dlgForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  submitting(f, async () => { await dlgSubmit(Object.fromEntries(new FormData(f))); dlg.close(); await reload(); });
});
function openDialog(title, html, onSubmit) {
  $("dlgTitle").textContent = title;
  $("dlgFields").innerHTML = html;
  formMsg($("dlgForm"), "");
  dlgSubmit = onSubmit;
  dlg.showModal();
}
const timeOptions = (from, to, step = 30) => { let o = ""; for (let m = from; m <= to; m += step) o += `<option>${hhmm(m)}</option>`; return o; };

$("addBooking").addEventListener("click", () => {
  const h = hoursOf(day) ?? [600, 1200];
  const services = state.services.filter((s) => s.active);
  openDialog(t("dlg.booking"), `
    <label class="field"><span>${esc(t("dlg.service"))}</span><select class="input" name="service_id">${services.map((s) => `<option value="${esc(s.id)}">${esc(lang === "hy" ? s.name_hy : s.name_en)} · ${s.duration_min}′</option>`).join("")}</select></label>
    <label class="field"><span>${esc(t("dlg.time"))}</span><select class="input" name="time">${timeOptions(h[0], h[1] - 30)}</select></label>
    <label class="field"><span>${esc(t("dlg.client"))}</span><input class="input" name="client_name" maxlength="60"></label>
    <label class="field"><span>${esc(t("dlg.phone"))}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="+374 …"></label>`,
  (d) => api("/api/app/bookings", { ...d, date: day }));
});
$("addBlock").addEventListener("click", () => {
  const h = hoursOf(day) ?? [600, 1200];
  openDialog(t("dlg.block"), `
    <label class="switch-row"><span><b>${esc(t("dlg.allDay"))}</b></span><input type="checkbox" class="switch" name="all_day"></label>
    <div class="row2"><label class="field"><span>${esc(t("dlg.from"))}</span><select class="input" name="from">${timeOptions(h[0], h[1] - 30)}</select></label>
    <label class="field"><span>${esc(t("dlg.to"))}</span><select class="input" name="to">${timeOptions(h[0] + 30, h[1])}</select></label></div>
    <label class="field"><span>${esc(t("dlg.note"))}</span><input class="input" name="note" maxlength="80"></label>`,
  (d) => api("/api/app/blocks", d.all_day ? { date: day, from: hhmm(h[0]), to: hhmm(h[1]), note: d.note } : { date: day, from: d.from, to: d.to, note: d.note }));
});

// services
const durations = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];
function renderServices() {
  editServices ??= state.services.map((s) => ({ ...s }));
  $("srvList").replaceChildren(...editServices.map((s, i) => {
    const el = document.createElement("div");
    el.className = `srv${s.active ? "" : " off"}`;
    el.innerHTML = `
      <div class="srv-row">
        <label class="field"><span>${esc(t("srv.hy"))}</span><input class="input" data-k="name_hy" value="${esc(s.name_hy)}" maxlength="80"></label>
        <label class="field"><span>${esc(t("srv.ru"))}</span><input class="input" data-k="name_en" value="${esc(s.name_en)}" maxlength="80"></label>
      </div>
      <div class="srv-row3">
        <label class="field"><span>${esc(t("srv.dur"))}</span><select class="input" data-k="duration_min">${durations.map((d) => `<option ${d === s.duration_min ? "selected" : ""}>${d}</option>`).join("")}</select></label>
        <label class="field"><span>${esc(t("srv.price"))}</span><input class="input" data-k="price_min" type="number" min="0" step="500" value="${s.price_min}"></label>
        <label class="field"><span>${esc(t("srv.max"))}</span><input class="input" data-k="price_max" type="number" min="0" step="500" value="${s.price_max ?? ""}"></label>
      </div>
      <div class="srv-foot"><label><input type="checkbox" class="switch" data-k="active" ${s.active ? "checked" : ""}>${esc(t("srv.on"))}</label><button class="icon-btn" type="button" aria-label="${esc(t("srv.del"))}">×</button></div>`;
    el.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.dataset.k;
      s[k] = k === "active" ? (inp.checked ? 1 : 0) : ["duration_min", "price_min"].includes(k) ? Number(inp.value) : k === "price_max" ? (inp.value === "" ? null : Number(inp.value)) : inp.value;
      if (k === "active") el.classList.toggle("off", !s.active);
    }));
    el.querySelector(".icon-btn").addEventListener("click", () => { editServices.splice(i, 1); renderServices(); });
    return el;
  }));
}
$("addService").addEventListener("click", () => {
  editServices.push({ id: `s${Date.now().toString(36)}`, category: "main", name_hy: "", name_en: "", duration_min: 30, price_min: 0, price_max: null, active: 1 });
  renderServices();
  $("srvList").lastElementChild.querySelector("input").focus();
});
$("saveServices").addEventListener("click", async () => {
  const msg = $("srvMsg");
  const list = editServices.filter((s) => s.name_hy.trim() || s.name_en.trim());
  try {
    await api("/api/app/services", { services: list }, "PUT");
    editServices = null;
    await reload();
    msg.textContent = t("srv.saved");
    msg.className = "form-msg ok";
  } catch (e) {
    msg.textContent = errText(e);
    msg.className = "form-msg";
  }
});

// settings and hours
function renderSettings() {
  const f = $("setForm"), s = state.settings;
  f.enabled.checked = s.enabled;
  for (const k of ["shop_name", "shop_name_spoken", "address", "barbers", "extra_instructions"]) f[k].value = s[k] ?? "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  $("hours").replaceChildren(...order.map((wd) => {
    const h = s.hours[wd];
    const row = document.createElement("div");
    row.className = `hour${h ? "" : " closed"}`;
    row.dataset.wd = wd;
    row.innerHTML = `<label class="hour-name"><input type="checkbox" class="switch" ${h ? "checked" : ""}>${esc(t("daysLong")[wd])}</label>
      <div class="hour-times"><input class="input" type="time" step="1800" value="${hhmm(h?.[0] ?? 600)}"><span>–</span><input class="input" type="time" step="1800" value="${hhmm(h?.[1] ?? 1200)}"></div>`;
    row.querySelector(".switch").addEventListener("change", (e) => row.classList.toggle("closed", !e.target.checked));
    return row;
  }));
}
$("setForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, msg = $("setMsg");
  const hours = [];
  $("hours").querySelectorAll(".hour").forEach((row) => {
    const [a, b] = row.querySelectorAll('input[type="time"]');
    hours[Number(row.dataset.wd)] = row.querySelector(".switch").checked ? [toMin(a.value), toMin(b.value)] : null;
  });
  try {
    await api("/api/app/settings", {
      enabled: f.enabled.checked, shop_name: f.shop_name.value, shop_name_spoken: f.shop_name_spoken.value, address: f.address.value,
      barbers: Number(f.barbers.value), extra_instructions: f.extra_instructions.value, hours,
    }, "PUT");
    await reload();
    msg.textContent = t("set.saved");
    msg.className = "form-msg ok";
  } catch (err) {
    msg.textContent = errText(err);
    msg.className = "form-msg";
  }
});

$("copyLink").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("tryCall").href); toast(t("test.copied")); } catch { prompt("", $("tryCall").href); }
});

document.querySelectorAll("#langs button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; store.set("bvLang", lang); applyLang(); }));

// ---------------------------------------------------------------- start
applyLang();
const q = new URLSearchParams(location.search);
if (q.get("verify")) {
  toast(t(q.get("verify") === "ok" ? "verify.ok" : "verify.failed"), q.get("verify") !== "ok");
  history.replaceState(null, "", "/app/");
}
boot();

// ---------------------------------------------------------------- analytics

const money = (n) => `${Math.round(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ֏`;
let statsRange = { from: null, to: null }, statsData = null;

function rangeFor(kind) {
  const today = state.today;
  if (kind === "today") return { from: today, to: today };
  if (kind === "month") return { from: today.slice(0, 8) + "01", to: today };
  return { from: addDays(today, -(Number(kind) - 1)), to: today };
}

async function loadStats() {
  if (!statsRange.from) statsRange = rangeFor("30");
  $("stFrom").value = statsRange.from;
  $("stTo").value = statsRange.to;
  try {
    statsData = await api(`/api/app/analytics?from=${statsRange.from}&to=${statsRange.to}`);
    renderStats();
  } catch (e) { toast(errText(e), true); }
}

// one bar chart: a single series in the brand green, hover shows the exact value
function bars(values, labels, tipOf) {
  const max = Math.max(...values, 1), peak = values.indexOf(Math.max(...values));
  return `<div class="bars">${values.map((v, i) => `<div class="bar${v ? "" : " zero"}${v && i === peak ? " peak" : ""}" tabindex="0"><span class="tip">${esc(tipOf(i, v))}</span><i style="height:${Math.max(2, (v / max) * 100)}%"></i></div>`).join("")}</div>
    <div class="bar-labels">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`;
}

function renderStats() {
  const d = statsData;
  if (!d) return;
  const box = $("stats");
  if (!d.bookings && !d.cancelled) {
    box.innerHTML = `<div class="empty"><b>${esc(t("st.empty"))}</b></div>`;
    return;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const wd = order.map((i) => d.by_weekday[i]);
  const hours = state.settings.hours.filter(Boolean);
  const hFrom = Math.floor(Math.min(...hours.map((h) => h[0]), 600) / 60), hTo = Math.ceil(Math.max(...hours.map((h) => h[1]), 1200) / 60);
  const hourVals = d.by_hour.slice(hFrom, hTo);
  const peakDay = order[wd.indexOf(Math.max(...wd))], peakHour = hFrom + hourVals.indexOf(Math.max(...hourVals));
  const days = d.by_day.length > 62 ? null : d.by_day;
  const sMax = Math.max(...d.services.map((x) => x.count), 1);
  const chTotal = d.channels.call + d.channels.chat + d.channels.manual || 1;
  const short = (date) => `${Number(date.slice(8))}.${date.slice(5, 7)}`;
  box.innerHTML = `
    <div class="kpis">
      <div class="kpi hero"><small>${esc(t("k.revenue"))} · ${esc(t("k.revenueHint"))}</small><b>${money(d.revenue)}</b><span>+ ${money(d.expected)} ${esc(t("k.expected"))}</span></div>
      <div class="kpi"><small>${esc(t("k.bookings"))}</small><b>${d.bookings}</b><span>${d.cancelled} ${esc(t("k.cancelled"))}</span></div>
      <div class="kpi"><small>${esc(t("k.clients"))}</small><b>${d.clients}</b><span>${d.new_clients} ${esc(t("k.new"))}</span></div>
      <div class="kpi"><small>${esc(t("k.returning"))}</small><b>${d.returning_clients}</b><span>${esc(t("k.returningHint"))}</span></div>
      <div class="kpi"><small>${esc(t("k.avg"))}</small><b>${money(d.avg_check)}</b></div>
      <div class="kpi"><small>${esc(t("k.after"))}</small><b>${d.after_hours}</b><span>${esc(t("k.afterHint"))}</span></div>
      <div class="kpi"><small>${esc(t("k.conv"))}</small><b>${d.conversations.calls + d.conversations.chats}</b><span>${d.conversations.calls} · ${d.conversations.chats} · ${d.conversations.call_minutes} ${esc(t("k.convHint").split(" · ").pop())}</span></div>
    </div>
    ${d.bookings ? `<div class="insight">📈 ${esc(t("st.peak"))} ${esc(t("daysLong")[peakDay])}, ${String(peakHour).padStart(2, "0")}:00–${String(peakHour + 1).padStart(2, "0")}:00</div>` : ""}
    ${days ? `<div class="chart-card"><h3>${esc(t("ch.day"))}</h3><p>${esc(t("ch.dayHint"))}</p>${bars(days.map((x) => x.bookings), days.map((x, i) => (days.length <= 10 || i % Math.ceil(days.length / 8) === 0 ? short(x.date) : "")), (i, v) => `${short(days[i].date)}: ${v} ${t("bookingsWord")} · ${money(days[i].revenue)}`)}</div>` : ""}
    <div class="stats-grid">
      <div class="chart-card"><h3>${esc(t("ch.hour"))}</h3><p>&nbsp;</p>${bars(hourVals, hourVals.map((_, i) => String(hFrom + i)), (i, v) => `${hFrom + i}:00–${hFrom + i + 1}:00 · ${v} ${t("bookingsWord")}`)}</div>
      <div class="chart-card"><h3>${esc(t("ch.weekday"))}</h3><p>&nbsp;</p>${bars(wd, order.map((i) => t("days")[i]), (i, v) => `${t("daysLong")[order[i]]} · ${v} ${t("bookingsWord")}`)}</div>
    </div>
    <div class="stats-grid">
      <div class="chart-card"><h3>${esc(t("ch.services"))}</h3><p>&nbsp;</p>${d.services.slice(0, 8).map((x) => `<div class="hbar"><span class="nm">${esc(x.name)}</span><span class="val">${x.count} · ${money(x.revenue)}</span><span class="track"><i style="width:${(x.count / sMax) * 100}%"></i></span></div>`).join("")}</div>
      <div class="chart-card"><h3>${esc(t("ch.channels"))}</h3><p>&nbsp;</p>${[["call", d.channels.call], ["chat", d.channels.chat], ["manual", d.channels.manual]].map(([k, v]) => `<div class="hbar"><span class="nm">${esc(t("ch." + k))}</span><span class="val">${v} · ${Math.round((v / chTotal) * 100)}%</span><span class="track"><i style="width:${(v / chTotal) * 100}%"></i></span></div>`).join("")}</div>
    </div>
    <div class="chart-card"><h3>${esc(t("ch.clients"))}</h3><p>&nbsp;</p>
      <table class="clients-table"><thead><tr><th>${esc(t("ch.client"))}</th><th>${esc(t("ch.visits"))}</th><th>${esc(t("ch.spent"))}</th></tr></thead>
      <tbody>${d.top_clients.map((c) => `<tr><td>${esc(c.name || "—")}<br><small class="muted">${esc(c.phone || "")}</small></td><td>${c.visits}</td><td>${money(c.spent)}</td></tr>`).join("")}</tbody></table>
    </div>
    <p class="muted small">${esc(t("st.note"))}</p>`;
}

document.querySelectorAll("#ranges button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("#ranges button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  statsRange = rangeFor(b.dataset.range);
  loadStats();
}));
for (const id of ["stFrom", "stTo"]) $(id).addEventListener("change", () => {
  if (!$("stFrom").value || !$("stTo").value) return;
  document.querySelectorAll("#ranges button").forEach((x) => x.setAttribute("aria-pressed", "false"));
  statsRange = { from: $("stFrom").value, to: $("stTo").value };
  loadStats();
});
