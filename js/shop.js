/* H11 – Shop-UI: Produkt-Sheet, Warenkorb-Drawer, Checkout, Demo-Zahlung, Warenkorb-Leiste */
(function () {
  const C = window.H11, O = window.H11_ORDERING, A = window.H11Api, Cart = window.H11Cart;
  const { esc, $, toast } = window.H11UI;
  const euro = A.euro;
  const state = { settings: { ordering_enabled: true }, unavailable: false };
  let lastFocus = null;

  /* ---------- Verfügbarkeit ---------- */
  const canOrder = () => !state.unavailable && state.settings.ordering_enabled !== false;
  const isSoldOut = (id) => !!(C.catalog.byId[id] || {}).sold_out;
  const blockedMsg = () => state.unavailable ? "Das Bestellsystem ist gerade nicht erreichbar. Bitte versuche es später erneut."
    : "Online-Bestellungen sind momentan pausiert.";

  function setSettings(s) { if (s) state.settings = s; refresh(); }
  function applyRows(rows) {
    (rows || []).forEach((r) => {
      const it = C.catalog.byId[r.id]; if (!it) return;
      if (r.price != null) it.price = Number(r.price);
      if (r.active != null) it.active = r.active;
      if (r.sold_out != null) it.sold_out = r.sold_out;
    });
    refresh();
  }
  function refresh() {
    const b = $("#orderStatus");
    if (b) {
      b.hidden = canOrder();
      b.textContent = canOrder() ? "" : blockedMsg() + (state.settings.pickup_message ? " " + state.settings.pickup_message : "");
    }
    document.dispatchEvent(new CustomEvent("h11:menu"));
    renderBar();
    if (drawerOpen()) render();
  }

  /* ---------- Warenkorb-Leiste ---------- */
  const bar = document.createElement("button");
  bar.className = "cartbar"; bar.hidden = true; bar.type = "button";
  bar.addEventListener("click", () => openCart());
  document.body.appendChild(bar);
  function renderBar() {
    const n = Cart.count();
    const show = n > 0 && !drawerOpen();
    bar.hidden = !show;
    document.body.classList.toggle("has-cartbar", show);
    if (n) bar.innerHTML = `<span>Warenkorb · ${n} Artikel</span><b>${euro(Cart.subtotal())}</b>`;
  }
  Cart.onChange(() => { renderBar(); if (drawerOpen()) render(); });

  /* ---------- Produkt-Sheet ---------- */
  const pm = document.createElement("div");
  pm.className = "ov"; pm.hidden = true;
  pm.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pmT"><button class="x" type="button" aria-label="Schließen">×</button><div class="sheet__in"></div></div>`;
  document.body.appendChild(pm);
  pm.addEventListener("click", (e) => { if (e.target === pm || e.target.closest(".x")) closeProduct(); });

  function openProduct(id) {
    const it = C.catalog.byId[id]; if (!it || !it.active || !(it.price > 0)) return;
    if (!canOrder()) return toast(blockedMsg());
    if (it.sold_out) return toast("Heute ausverkauft.");
    lastFocus = document.activeElement;
    let qty = 1; const sel = new Set();
    const inner = $(".sheet__in", pm);
    const groupsHtml = it.groups.map((g) => {
      const radio = g.max === 1 && g.min >= 1;
      return `<fieldset class="grp" data-g="${esc(g.id)}"><legend>${esc(g.name)} <small>${g.required || g.min ? "Pflicht" : "Optional"}${g.max > 1 ? " · max. " + g.max : ""}</small></legend>
        ${g.options.map((o) => `<label class="opt"><input type="${radio ? "radio" : "checkbox"}" name="${esc(g.id)}" value="${esc(o.id)}"><span>${esc(o.name)}</span><em>${o.delta ? "+ " + euro(o.delta) : "inklusive"}</em></label>`).join("")}</fieldset>`;
    }).join("");
    inner.innerHTML = `
      ${it.image ? `<img class="sheet__img" src="${esc(it.image)}" alt="" loading="lazy">` : ""}
      <div class="sheet__body">
        <h3 id="pmT">${esc(it.name)}</h3><p class="sheet__d">${esc(it.desc)}</p>
        ${O.pricesAreDemo ? `<p class="demo-price">Demo-Preis – vorläufig</p>` : ""}
        ${groupsHtml}
        <label class="fld">Anmerkung (optional)<input id="pmNote" maxlength="140" placeholder="z. B. Ohne Zwiebeln" autocomplete="off"></label>
        <p class="err" id="pmErr" role="alert"></p>
      </div>
      <div class="sheet__f"><div class="qty" aria-label="Menge"><button type="button" data-d="-1" aria-label="Weniger">−</button><output id="pmQ">1</output><button type="button" data-d="1" aria-label="Mehr">+</button></div>
        <button class="btn btn--primary" id="pmAdd" type="button"></button></div>`;
    const unit = () => it.price + it.groups.reduce((s, g) => s + g.options.filter((o) => sel.has(o.id)).reduce((a, o) => a + o.delta, 0), 0);
    const upd = () => {
      $("#pmQ", inner).textContent = qty;
      $("#pmAdd", inner).textContent = `Hinzufügen · ${euro(unit() * qty)}`;
      it.groups.forEach((g) => { // Maximum erzwingen
        const full = g.options.filter((o) => sel.has(o.id)).length >= g.max && g.max > 1;
        inner.querySelectorAll(`input[name="${g.id}"]`).forEach((i) => { i.disabled = full && !i.checked; });
      });
    };
    inner.onchange = (e) => {
      const i = e.target; if (i.tagName !== "INPUT") return;
      if (i.type === "radio") inner.querySelectorAll(`input[name="${i.name}"]`).forEach((r) => sel.delete(r.value));
      i.checked ? sel.add(i.value) : sel.delete(i.value); upd();
    };
    inner.onclick = (e) => {
      const d = e.target.closest("[data-d]"); if (d) { qty = Math.max(1, Math.min(O.maxQtyPerLine, qty + Number(d.dataset.d))); upd(); }
    };
    $("#pmAdd", inner).addEventListener("click", () => {
      for (const g of it.groups) {
        const n = g.options.filter((o) => sel.has(o.id)).length;
        if (n < (g.required ? Math.max(g.min, 1) : g.min)) { $("#pmErr", inner).textContent = `Bitte wähle: ${g.name}`; return; }
      }
      Cart.add(it.id, qty, [...sel], $("#pmNote", inner).value);
      closeProduct(); toast(`${qty}× ${it.name} hinzugefügt`);
    });
    upd();
    pm.hidden = false; document.body.classList.add("lock"); renderBar();
    $(".x", pm).focus();
  }
  function closeProduct() { pm.hidden = true; document.body.classList.remove("lock"); renderBar(); lastFocus && lastFocus.focus && lastFocus.focus(); }

  /* ---------- Warenkorb / Checkout / Demo-Zahlung ---------- */
  const ov = document.createElement("div");
  ov.className = "ov ov--drawer"; ov.hidden = true;
  ov.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drT">
    <header class="drawer__h"><button class="back" type="button" aria-label="Zurück" hidden>‹</button><h3 id="drT">Warenkorb</h3><button class="x" type="button" aria-label="Schließen">×</button></header>
    <div class="drawer__b"></div><footer class="drawer__f"></footer></aside>`;
  document.body.appendChild(ov);
  const drB = $(".drawer__b", ov), drF = $(".drawer__f", ov), drT = $("#drT", ov), back = $(".back", ov);
  let view = "cart"; let cust = { name: "", phone: "", email: "", note: "" }; let msg = ""; let busy = false;
  const drawerOpen = () => !ov.hidden;

  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".x")) closeCart(); });
  back.addEventListener("click", () => { msg = ""; view = view === "pay" ? "checkout" : "cart"; render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!pm.hidden) closeProduct(); else if (drawerOpen() && !busy) closeCart(); } });

  function openCart(v) {
    lastFocus = document.activeElement; view = v || "cart"; msg = ""; ov.hidden = false;
    document.body.classList.add("lock"); render(); renderBar(); $(".x", ov).focus();
  }
  function closeCart() { ov.hidden = true; document.body.classList.remove("lock"); renderBar(); lastFocus && lastFocus.focus && lastFocus.focus(); }

  const lineHtml = (l, editable) => {
    const gone = !l.item.active || l.item.sold_out;
    return `<li class="line${gone ? " line--bad" : ""}">
      <div class="line__t"><b>${esc(l.name)}</b>
        ${l.options.length ? `<small>${l.options.map((o) => esc(o.name)).join(", ")}</small>` : ""}
        ${l.note ? `<small>Anmerkung: ${esc(l.note)}</small>` : ""}
        ${gone ? `<small class="bad">Nicht mehr verfügbar – bitte entfernen</small>` : ""}</div>
      ${editable ? `<div class="qty qty--s"><button type="button" data-q="${esc(l.key)}" data-d="-1" aria-label="Weniger">−</button><output>${l.qty}</output><button type="button" data-q="${esc(l.key)}" data-d="1" aria-label="Mehr">+</button></div>`
        : `<span class="line__q">${l.qty}×</span>`}
      <span class="line__p">${euro(l.total)}</span>
      ${editable ? `<button class="line__x" type="button" data-rm="${esc(l.key)}" aria-label="${esc(l.name)} entfernen">Entfernen</button>` : ""}</li>`;
  };
  const totalsHtml = () => `<div class="sum"><div><span>Zwischensumme</span><span>${euro(Cart.subtotal())}</span></div><div class="sum__t"><span>Gesamt</span><span>${euro(Cart.subtotal())}</span></div></div>`;
  const demoNote = () => O.pricesAreDemo ? `<p class="fine">Preise sind vorläufige Demo-Preise.</p>` : "";

  function render() {
    back.hidden = view === "cart";
    if (view === "cart") renderCartView(); else if (view === "checkout") renderCheckout(); else renderPay();
  }

  function renderCartView() {
    drT.textContent = "Warenkorb";
    const lines = Cart.priced();
    if (!lines.length) {
      drB.innerHTML = `<div class="empty"><p>Dein Warenkorb ist leer.</p><p class="fine">Wähle etwas Leckeres aus der Speisekarte.</p></div>`;
      drF.innerHTML = `<button class="btn btn--primary btn--block" type="button" id="toMenu">Zur Speisekarte</button>`;
      $("#toMenu", drF).onclick = () => { closeCart(); location.hash = "#speisekarte"; };
      return;
    }
    const bad = lines.some((l) => !l.item.active || l.item.sold_out);
    drB.innerHTML = `<ul class="lines">${lines.map((l) => lineHtml(l, true)).join("")}</ul>${demoNote()}`;
    drF.innerHTML = `${totalsHtml()}${!canOrder() ? `<p class="err" role="alert">${esc(blockedMsg())}</p>` : ""}
      <button class="btn btn--primary btn--block" type="button" id="toCo" ${!canOrder() || bad ? "disabled" : ""}>Zur Bestellung</button>`;
    drB.onclick = (e) => {
      const q = e.target.closest("[data-q]"), r = e.target.closest("[data-rm]");
      if (q) { const l = Cart.lines().find((x) => x.key === q.dataset.q); if (l) Cart.setQty(l.key, l.qty + Number(q.dataset.d)); }
      if (r) Cart.remove(r.dataset.rm);
    };
    $("#toCo", drF).onclick = () => { view = "checkout"; msg = ""; render(); };
  }

  function renderCheckout() {
    drT.textContent = "Bestellung";
    const lines = Cart.priced();
    drB.innerHTML = `
      <div class="pickup"><b>Nur Abholung im Restaurant</b><span>H11 Neubau<br>Neubaugasse 9<br>1070 Wien</span></div>
      ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}
      <form id="coForm" novalidate>
        <label class="fld">Name *<input id="cName" name="name" required maxlength="60" autocomplete="given-name" value="${esc(cust.name)}"></label>
        <label class="fld">Telefonnummer (optional)<input id="cPhone" name="phone" type="tel" maxlength="30" autocomplete="tel" inputmode="tel" value="${esc(cust.phone)}"></label>
        <label class="fld">E-Mail (optional)<input id="cMail" name="email" type="email" maxlength="120" autocomplete="email" value="${esc(cust.email)}"></label>
        <label class="fld">Anmerkung zur Bestellung<textarea id="cNote" name="note" rows="2" maxlength="300" placeholder="z. B. Ohne Zwiebeln">${esc(cust.note)}</textarea></label>
        <p class="fine">Wir speichern nur, was für deine Bestellung nötig ist. Telefon und E-Mail sind freiwillig.</p>
      </form>
      <h4 class="sub">Deine Bestellung</h4>
      <ul class="lines lines--ro">${lines.map((l) => lineHtml(l, false)).join("")}</ul>${demoNote()}`;
    drF.innerHTML = `${totalsHtml()}<button class="btn btn--primary btn--block" type="submit" form="coForm" id="payBtn" ${busy ? "disabled" : ""}>${busy ? "Bitte warten …" : "Sicher bezahlen"}</button>`;
    const form = $("#coForm", drB);
    form.onsubmit = async (e) => {
      e.preventDefault(); if (busy) return;
      cust = { name: $("#cName").value.trim(), phone: $("#cPhone").value.trim(), email: $("#cMail").value.trim(), note: $("#cNote").value.trim() };
      if (!cust.name) { msg = "Bitte gib deinen Namen an."; render(); $("#cName").focus(); return; }
      if (cust.email && !/^\S+@\S+\.\S+$/.test(cust.email)) { msg = "Bitte prüfe deine E-Mail-Adresse."; render(); return; }
      if (!Cart.count()) { msg = "Dein Warenkorb ist leer."; view = "cart"; render(); return; }
      if (!canOrder()) { msg = blockedMsg(); render(); return; }
      if (Cart.priced().some((l) => !l.item.active || l.item.sold_out)) { view = "cart"; render(); return; }
      if (A.demo) { view = "pay"; msg = ""; render(); return; }
      // Echtmodus: Stripe Checkout über Edge Function (Server prüft & berechnet alles neu)
      busy = true; render();
      try {
        const res = await A.createCheckout({ customer: cust, items: Cart.payloadItems() });
        if (!res || !res.url) throw new Error("network");
        window.location.href = res.url;
      } catch (e2) { busy = false; msg = A.humanError(e2); render(); }
    };
  }

  function renderPay() {
    drT.textContent = "Demo-Zahlung";
    const total = euro(Cart.subtotal());
    drB.innerHTML = `
      ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}
      <div class="paybox">
        <p class="paybox__tag">Demo-Modus – keine echte Zahlung</p>
        <p class="paybox__sum">${total}</p>
        <div class="paybox__card"><span>Kartennummer</span><b>4242 4242 4242 4242</b><div><span>12/34</span><span>CVC 123</span></div></div>
        <p class="fine">Simulierte Zahlung für die Präsentation. Es wird nichts abgebucht.</p>
      </div>`;
    drF.innerHTML = `<button class="btn btn--primary btn--block" type="button" id="payOk" ${busy ? "disabled" : ""}>${busy ? "Zahlung läuft …" : "Demo-Zahlung bestätigen · " + total}</button>
      <div class="pay__alt"><button type="button" class="link" id="payFail" ${busy ? "disabled" : ""}>Zahlung fehlschlagen lassen</button><button type="button" class="link" id="payCancel" ${busy ? "disabled" : ""}>Abbrechen</button></div>`;
    $("#payCancel", drF).onclick = () => { view = "checkout"; msg = "Zahlung abgebrochen. Dein Warenkorb ist noch da."; render(); };
    $("#payFail", drF).onclick = () => { view = "checkout"; msg = "Die Zahlung ist fehlgeschlagen. Es wurde nichts abgebucht – bitte versuche es erneut."; render(); };
    $("#payOk", drF).onclick = async () => {
      busy = true; render();
      try {
        const r = await A.placeDemoOrder({ customer: cust, items: Cart.payloadItems() });
        Cart.clear();
        location.href = `order.html?t=${encodeURIComponent(r.tracking_token)}`;
      } catch (e) {
        busy = false; msg = A.humanError(e);
        view = /sold_out|invalid_item|invalid_option/.test(String(e.message)) ? "cart" : "checkout";
        if (view === "cart") toast(msg, 6000);
        render();
      }
    };
  }

  /* ---------- Start ---------- */
  async function init() {
    try {
      await A.ready();
      const [s, m] = await Promise.all([A.getSettings(), A.getMenuState()]);
      state.settings = s || state.settings; applyRows(m);
    } catch (e) { state.unavailable = true; refresh(); }
    A.watchSettings((s) => { state.unavailable = false; setSettings(s); });
    A.watchMenu(applyRows);
    document.addEventListener("h11:catalog", refresh);
    const p = new URLSearchParams(location.search);
    if (p.get("payment") === "cancelled") {
      toast("Zahlung abgebrochen – dein Warenkorb ist noch da.", 6000);
      history.replaceState(null, "", location.pathname + location.hash);
    }
    renderBar(); refresh();
  }
  window.H11Shop = { openProduct, openCart, isSoldOut, canOrder };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
