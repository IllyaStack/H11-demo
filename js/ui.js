/* H11 – kleine UI-Helfer (alle Seiten) */
(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r = document) => r.querySelector(s);

  function toast(msg, ms = 4200) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // Dezenter Hinweis, solange DEMO_MODE aktiv ist
  function demoStrip() {
    if (!window.H11_ORDERING.DEMO_MODE || $(".demo-strip")) return;
    const d = document.createElement("div");
    d.className = "demo-strip"; d.textContent = "Demo-Modus – keine echte Zahlung";
    document.body.prepend(d);
  }

  window.H11UI = { esc, $, toast, demoStrip };
  document.addEventListener("DOMContentLoaded", demoStrip);
})();
