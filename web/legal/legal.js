// Language switch for the legal pages: one page holds RU / HY / EN, the visitor's choice is remembered.
const langs = ["ru", "hy", "en"];
const saved = (() => { try { return localStorage.getItem("bvLang"); } catch { return null; } })();
let lang = langs.includes(saved) ? saved : navigator.language?.startsWith("ru") ? "ru" : navigator.language?.startsWith("hy") ? "hy" : "en";
function apply() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-lang-block]").forEach((el) => (el.hidden = el.dataset.langBlock !== lang));
  document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}
document.querySelectorAll("#langs button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; try { localStorage.setItem("bvLang", lang); } catch {} apply(); }));
apply();
