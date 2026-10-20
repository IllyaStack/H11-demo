/* H11 – kleine UI-Helfer (alle Seiten) */
(function () {
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r = document) => r.querySelector(s);

  function toast(msg, ms = 4200) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // Dezenter Hinweis, solange Demo-Modus aktiv ist
  function demoStrip() {
    if (!document.body) return;
    const isDemo = window.H11Api ? !!window.H11Api.demo : !!(window.H11_ORDERING && window.H11_ORDERING.DEMO_MODE);
    let d = $(".demo-strip");
    if (!isDemo) {
      if (d) d.remove();
      return;
    }
    if (!d) {
      d = document.createElement("div");
      d.className = "demo-strip";
      document.body.prepend(d);
    }
    d.textContent = "Demo-Modus – keine echte Zahlung";
  }

  window.H11UI = { esc, $, toast, demoStrip };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demoStrip);
  } else {
    demoStrip();
  }
})();
