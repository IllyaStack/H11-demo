/* H11 – Küchen-Dashboard-Logik (Supabase Auth + Realtime Orders, Menu & Settings) */
(function () {
  const A = window.H11Api,
    C = window.H11,
    { esc, $, toast } = window.H11UI;
  const euro = A.euro,
    ST = A.STATUS;
  const $$ = (s) => document.querySelectorAll(s);
  let orders = [],
    known = null,
    settings = { ordering_enabled: true },
    filter = "all",
    armed = null,
    busy = new Set();
  let audio = null,
    soundOn = localStorage.getItem("h11_sound") === "1";

  /* ---------- Anmeldung (Supabase Auth für Küchenpersonal) ---------- */
  async function boot() {
    await A.ready();
    if (!A.useSB) return start();
    try {
      const s = await A.auth.session();
      if (s && (await A.auth.isStaff())) return start();
    } catch (e) {
      $("#lErr").textContent = "Server nicht erreichbar.";
    }
    $("#login").hidden = false;
    $("#app").hidden = true;
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#lErr").textContent = "";
    try {
      await A.auth.signIn($("#lEmail").value.trim(), $("#lPass").value);
      if (!(await A.auth.isStaff())) {
        await A.auth.signOut();
        $("#lErr").textContent = "Dieses Konto hat keinen Küchen-Zugriff (nicht in staff_users freigeschaltet).";
        return;
      }
      $("#login").hidden = true;
      start();
    } catch (err) {
      $("#lErr").textContent =
        err.code === "login_failed"
          ? "E-Mail oder Passwort falsch."
          : "Anmeldung nicht möglich. Bitte Datenbankverbindung prüfen.";
    }
  });
  $("#logout").addEventListener("click", async () => {
    await A.auth.signOut();
    location.reload();
  });

  if (A.auth && typeof A.auth.onAuthStateChange === "function") {
    A.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && started) {
        location.reload();
      }
    });
  }

  /* ---------- Start ---------- */
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    $("#app").hidden = false;
    $("#logout").hidden = !A.useSB;
    $("#testBtn").hidden = !A.demo;
    updSound();
    try {
      setSettings(await A.getSettings());
      applyMenu(await A.getMenuState());
    } catch (e) {
      toast("Verbindung zum Server fehlgeschlagen.");
    }
    A.watchSettings(setSettings);
    A.watchMenu(applyMenu);
    A.watchOrders(onOrders, (ok) => {
      const c = $("#conn");
      c.textContent = ok ? "● Live" : "Verbindung wird wiederhergestellt";
      c.classList.toggle("off", !ok);
    });
    renderMenu();
    document.addEventListener("h11:catalog", renderMenu);
  }

  /* ---------- Bestellungen ---------- */
  function onOrders(list) {
    const newOnes = known ? list.filter((o) => !known.has(o.id) && o.order_status === "new") : [];
    known = new Set(list.map((o) => o.id));
    orders = list;
    if (newOnes.length) {
      beep();
      flash(newOnes);
    }
    render();
  }
  function flash(n) {
    const f = $("#flash");
    f.textContent = `Neue Bestellung ${n.map((o) => o.public_order_number).join(", ")}!`;
    f.hidden = false;
    clearTimeout(f._t);
    f._t = setTimeout(() => (f.hidden = true), 6000);
  }

  const time = (iso) => new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const itemsHtml = (o) =>
    `<ul class="oitems">${(o.order_items || [])
      .map(
        (i) =>
          `<li><b>${i.quantity}×</b>${esc(i.name)}${
            (i.selected_options || []).length
              ? `<small>${i.selected_options.map((x) => esc(x.name)).join(", ")}</small>`
              : ""
          }${i.note ? `<small>Anmerkung: ${esc(i.note)}</small>` : ""}</li>`
      )
      .join("")}</ul>`;

  function card(o) {
    const act = {
      new: ["preparing", "Zubereitung starten"],
      preparing: ["ready", "Fertig"],
      ready: ["picked_up", "Abgeholt"],
    }[o.order_status];
    const b = busy.has(o.id);
    const hasName = o.customer_name && o.customer_name !== "Abholung";
    return `<article class="ocard" data-id="${o.id}">
      <div class="ocard__h"><div class="onum">${esc(o.public_order_number)}</div><div class="ometa"><span class="paid">BEZAHLT</span><br>${time(o.created_at)} Uhr<br>${euro(o.total)}</div></div>
      ${hasName ? `<div class="oname">${esc(o.customer_name)}${o.customer_phone ? ` <small>· ${esc(o.customer_phone)}</small>` : ""}</div>` : ""}
      ${itemsHtml(o)}
      ${o.customer_note ? `<div class="onote">ANMERKUNG: ${esc(o.customer_note)}</div>` : ""}
      <div class="oact"><button class="kbtn kbtn--go" data-act="${act[0]}" ${b ? "disabled" : ""}>${act[1]}</button>
      <button class="kbtn kbtn--cancel${armed && armed.id === o.id ? " armed" : ""}" data-cancel ${b ? "disabled" : ""}>${armed && armed.id === o.id ? "Wirklich stornieren?" : "Stornieren"}</button></div></article>`;
  }

  function render() {
    const by = (s) => orders.filter((o) => o.order_status === s);
    [
      ["colNew", "new", "n1"],
      ["colPrep", "preparing", "n2"],
      ["colReady", "ready", "n3"],
    ].forEach(([id, s, n]) => {
      const l = by(s).sort((a, b) => a.created_at.localeCompare(b.created_at));
      $("#" + id).innerHTML = l.length ? l.map(card).join("") : `<p class="empty">Keine Bestellungen</p>`;
      $("#" + n).textContent = l.length;
    });
    $("#cLive").textContent = by("new").length + by("preparing").length + by("ready").length;
    const hist = orders
      .filter(
        (o) =>
          (o.order_status === "picked_up" || o.order_status === "cancelled") &&
          (filter === "all" || o.order_status === filter)
      )
      .slice(0, 100);
    $("#histList").innerHTML = hist.length
      ? hist
          .map(
            (o) => `<div class="hrow"><b>${esc(o.public_order_number)}</b>
      <div>${esc(o.customer_name || "Abholung")} · ${time(o.created_at)} Uhr · ${euro(o.total)}<small>${(o.order_items || []).map((i) => i.quantity + "× " + esc(i.name)).join(", ")}</small></div>
      <span class="hs hs--${o.order_status}">${ST[o.order_status]}</span></div>`
          )
          .join("")
      : `<p class="empty">Noch keine Einträge</p>`;
  }

  async function act(id, status) {
    const o = orders.find((x) => x.id === id);
    if (!o || busy.has(id)) return;
    busy.add(id);
    render();
    try {
      await A.setOrderStatus(o, status);
      o.order_status = status; // optimistisch; Realtime bestätigt
    } catch (e) {
      toast("Status konnte nicht geändert werden. Bitte erneut versuchen.");
    }
    busy.delete(id);
    armed = null;
    render();
  }
  $("#vLive").addEventListener("click", (e) => {
    const c = e.target.closest(".ocard");
    if (!c) return;
    const id = c.dataset.id;
    const a = e.target.closest("[data-act]");
    if (a) return act(id, a.dataset.act);
    if (e.target.closest("[data-cancel]")) {
      if (armed && armed.id === id) {
        clearTimeout(armed.t);
        return act(id, "cancelled");
      }
      if (armed) clearTimeout(armed.t);
      armed = {
        id,
        t: setTimeout(() => {
          armed = null;
          render();
        }, 4000),
      };
      render();
    }
  });

  /* ---------- Bestellungen ein/aus ---------- */
  function setSettings(s) {
    if (s) settings = s;
    const on = settings.ordering_enabled !== false,
      t = $("#orderToggle");
    t.classList.toggle("off", !on);
    t.setAttribute("aria-pressed", on);
    $("#orderState").textContent = on ? "OFFEN" : "PAUSIERT";
    $("#testBtn").hidden = !A.demo;
  }
  $("#orderToggle").addEventListener("click", async () => {
    const next = settings.ordering_enabled === false;
    try {
      await A.setSettings({ ordering_enabled: next });
      setSettings({ ...settings, ordering_enabled: next });
    } catch (e) {
      toast("Einstellung konnte nicht gespeichert werden.");
    }
  });

  /* ---------- Verfügbarkeit (ausverkauft) ---------- */
  function applyMenu(rows) {
    (rows || []).forEach((r) => {
      const it = C.catalog.byId[r.id];
      if (it && r.sold_out != null) it.sold_out = r.sold_out;
    });
    renderMenu();
  }
  function renderMenu() {
    $("#menuAdmin").innerHTML = C.catalog.categories
      .map(
        (c) =>
          `<div class="mcat"><h3>${esc(c.name)}</h3>${C.catalog.items
            .filter((i) => i.category === c.id)
            .map(
              (i) => `<div class="mrow"><span>${esc(i.name)}</span>
        <button data-sold="${esc(i.id)}" class="${i.sold_out ? "out" : ""}" aria-pressed="${!!i.sold_out}">${i.sold_out ? "AUSVERKAUFT" : "VERFÜGBAR"}</button></div>`
            )
            .join("")}</div>`
      )
      .join("");
  }
  $("#vMenu").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sold]");
    if (!b) return;
    const it = C.catalog.byId[b.dataset.sold];
    if (!it) return;
    const v = !it.sold_out;
    try {
      await A.setSoldOut(it.id, v);
      it.sold_out = v;
      renderMenu();
    } catch (err) {
      toast("Konnte nicht gespeichert werden.");
    }
  });

  /* ---------- Tabs / Filter ---------- */
  $$(".ktabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".ktabs button").forEach((x) => x.classList.toggle("on", x === b));
      ["live", "history", "menu"].forEach((v) => ($("#v" + v[0].toUpperCase() + v.slice(1)).hidden = v !== b.dataset.v));
    })
  );
  $$("#filters button").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.f;
      $$("#filters button").forEach((x) => x.classList.toggle("on", x === b));
      render();
    })
  );

  /* ---------- Ton ---------- */
  function updSound() {
    const b = $("#soundBtn");
    b.textContent = soundOn && audio ? "Ton aktiv ✓" : "Ton aktivieren";
    b.classList.toggle("on", soundOn && !!audio);
  }
  function unlock() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  }
  $("#soundBtn").addEventListener("click", () => {
    if (soundOn && audio) {
      soundOn = false;
      localStorage.setItem("h11_sound", "0");
    } else {
      soundOn = true;
      localStorage.setItem("h11_sound", "1");
      unlock();
      beep(true);
    }
    updSound();
  });
  document.addEventListener(
    "click",
    () => {
      if (soundOn && !audio) {
        unlock();
        updSound();
      }
    },
    { once: false }
  );
  function beep() {
    if (!soundOn || !audio) return;
    try {
      unlock();
      const t = audio.currentTime;
      [
        [880, 0],
        [1175, 0.18],
      ].forEach(([f, d]) => {
        const o = audio.createOscillator(),
          g = audio.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
        o.connect(g).connect(audio.destination);
        o.start(t + d);
        o.stop(t + d + 0.18);
      });
    } catch (e) {}
  }

  /* ---------- Test-Bestellung (nur Demo-Modus) ---------- */
  $("#testBtn").addEventListener("click", async () => {
    const pick = (...ids) => ids.map((k) => C.catalog.byId[k] || C.catalog.byName[k]).find((x) => x && x.active && !x.sold_out);
    const sample = [
      pick("chicken-doener-dueruem", "Chicken Döner Dürüm"),
      pick("pommes-frites", "Pommes Frites"),
      pick("coca-cola-0-33l", "coca-cola-0-33-l", "Coca-Cola 0,33l", "Coca-Cola 0,33 l"),
    ].filter(Boolean);
    const items = (sample.length ? sample : C.catalog.items.filter((i) => i.active && !i.sold_out).slice(0, 2)).map((it) => ({
      id: it.id,
      qty: 1,
      options: [],
      note: "",
    }));
    try {
      await A.placeDemoOrder({
        note: "Ohne Zwiebeln",
        customer: { note: "Ohne Zwiebeln" },
        items,
      });
    } catch (e) {
      toast(A.humanError(e));
    }
  });

  boot();
})();
