/* H11 – Kunden-Bestellstatus (order.html?t=<tracking_token>) */
(function () {
  const A = window.H11Api, C = window.H11, { esc } = window.H11UI;
  const box = document.getElementById("box");
  const token = new URLSearchParams(location.search).get("t");
  const route = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(C.routeQuery);
  const euro = A.euro;
  let connected = true, order = undefined;

  const addr = `<p><b>H11 Neubau</b><br>${esc(C.address.street)}<br>${esc(C.address.zip)} ${esc(C.address.city)}</p>`;
  const live = () => `<p class="live ${connected ? "" : "off"}"><i></i>${connected ? "Live – Status aktualisiert sich automatisch" : "Verbindung wird wiederhergestellt …"}</p>`;

  function items(o) {
    return `<div class="panel"><h2>Deine Bestellung</h2><ul>${(o.items || []).map((i) => `<li><b>${i.quantity}×</b><span>${esc(i.name)}${
      (i.selected_options || []).length ? `<small>${i.selected_options.map((x) => esc(x.name)).join(", ")}</small>` : ""}${
      i.note ? `<small>Anmerkung: ${esc(i.note)}</small>` : ""}</span></li>`).join("")}</ul>
      <p><b>Gesamt: ${euro(o.total)}</b></p></div>`;
  }

  function render() {
    if (!token) return (box.innerHTML = notFound());
    if (order === undefined) {
      box.innerHTML = connected ? "<p>Bestellung wird geladen …</p>" : `<h1>Keine Verbindung</h1><p>Wir versuchen es gleich noch einmal. Deine Bestellung geht dabei nicht verloren.</p>${live()}`;
      return;
    }
    if (order === null) return (box.innerHTML = notFound());
    const o = order, st = o.order_status;

    if (o.payment_status === "pending") {
      box.innerHTML = `<h1>Zahlung wird bestätigt …</h1><p class="big">Bestellung ${esc(o.public_order_number)}</p><p>Bitte einen Moment Geduld – das Fenster aktualisiert sich automatisch.</p>${live()}`;
      return;
    }
    if (o.payment_status === "failed" || o.payment_status === "refunded") {
      box.innerHTML = `<h1>Zahlung nicht erfolgreich</h1><p>Es wurde nichts abgebucht bzw. der Betrag wurde erstattet. Du kannst jederzeit neu bestellen.</p><a class="btn btn--primary" href="index.html#speisekarte">Zur Speisekarte</a>`;
      return;
    }
    window.H11Cart.clear(); // Bezahlt → Warenkorb leeren

    const stepState = (n) => { // 1 bezahlt, 2 in Zubereitung, 3 abholbereit
      const rank = { new: 1, preparing: 2, ready: 3, picked_up: 4 }[st] || 0;
      return n < rank ? "done" : n === rank ? "now" : "";
    };
    const stepsHtml = st === "cancelled" ? "" : `<ol class="steps">
      <li class="${st === "new" ? "done" : "done"}">Bestellung bezahlt</li>
      <li class="${st === "new" ? "now" : st === "preparing" ? "now" : "done"}">${st === "new" ? "Wird gleich angenommen" : "Wird vorbereitet"}</li>
      <li class="${st === "ready" ? "now" : st === "picked_up" ? "done" : ""}">Abholbereit</li></ol>`;

    let headline = "";
    if (st === "new") headline = `<p class="big">Bestellung eingegangen</p>`;
    if (st === "preparing") headline = `<p class="big">Wird zubereitet</p>`;
    if (st === "ready") headline = `<p class="big big--ready">Deine Bestellung ist abholbereit!</p>${addr}<a class="btn btn--primary" href="${route}" target="_blank" rel="noopener">Route planen</a>`;
    if (st === "picked_up") headline = `<p class="big">Abgeholt – guten Appetit!</p>`;
    if (st === "cancelled") headline = `<p class="big">Bestellung storniert</p><p>Bitte wende dich direkt an das Restaurant.</p>${addr}`;

    box.innerHTML = `<p class="eyebrow eyebrow--dark">Danke, ${esc(o.customer_name)}!</p>
      <h1>Bestellung bestätigt</h1><div class="num" aria-label="Abholnummer">${esc(o.public_order_number)}</div>
      ${headline}${stepsHtml}
      ${st !== "ready" && st !== "cancelled" && st !== "picked_up" ? `<div class="panel"><h2>Abholung</h2>${addr}<p class="fine">Nur Abholung im Restaurant. Nenne bei der Abholung deine Nummer ${esc(o.public_order_number)}.</p></div>` : ""}
      ${items(o)}${live()}`;
  }
  function notFound() { return `<h1>Bestellung nicht gefunden</h1><p>Dieser Link ist ungültig oder abgelaufen.</p><a class="btn btn--primary" href="index.html">Zur Startseite</a>`; }

  if (token) A.watchOrderPublic(token, (o, ok) => { connected = ok !== false; if (o !== undefined) order = o; render(); });
  render();
})();
