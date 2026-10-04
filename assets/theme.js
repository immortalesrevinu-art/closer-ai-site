// Closer AI light/dark theme toggle. Dark is the default. The choice is stored in localStorage ("closerai-theme"),
// shared by every page on this site; an inline <head> script applies it before first paint (no white flash).
(function () {
  var K = "closerai-theme", d = document.documentElement;
  function cur() { return d.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function sync() {
    var t = cur(), label = t === "dark" ? "Switch to light theme" : "Switch to dark theme";
    var bs = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < bs.length; i++) { bs[i].setAttribute("aria-label", label); bs[i].title = label; bs[i].setAttribute("aria-pressed", t === "light" ? "true" : "false"); }
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "light" ? "#ffffff" : (m.getAttribute("data-dark") || "#05070a");
  }
  function apply(t, save) {
    d.setAttribute("data-theme", t); d.style.colorScheme = t;
    if (save) { try { localStorage.setItem(K, t); } catch (e) { /* private mode */ } }
    sync();
    try { window.dispatchEvent(new CustomEvent("closer-theme", { detail: t })); } catch (e) { /* old browser */ }
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".theme-toggle") : null;
    if (b) { e.preventDefault(); apply(cur() === "dark" ? "light" : "dark", true); }
  });
  window.addEventListener("storage", function (e) { if (e.key === K) apply(e.newValue === "light" ? "light" : "dark", false); }); // other tabs
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync); else sync();
  window.CloserTheme = { get: cur, set: function (t) { apply(t === "light" ? "light" : "dark", true); } };
})();
