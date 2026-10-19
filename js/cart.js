/* H11 – Warenkorb (localStorage). Preise hier sind nur Anzeige – der Server berechnet den echten Betrag neu. */
(function () {
  const KEY = "h11_cart_v1";
  const C = window.H11;
  const listeners = new Set();
  let lines = [];

  try { lines = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { lines = []; }
  if (!Array.isArray(lines)) lines = [];
  lines = lines.filter((l) => l && C.catalog.byId[l.itemId]);

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch (e) {} listeners.forEach((f) => f()); };
  const keyOf = (itemId, optionIds, note) => [itemId, [...optionIds].sort().join(","), (note || "").trim().toLowerCase()].join("|");

  // Aktuelle Preise (ggf. aus Supabase überschrieben) werden über H11.catalog gelesen
  function priced() {
    return lines.map((l) => {
      const it = C.catalog.byId[l.itemId];
      const opts = [];
      it.groups.forEach((g) => g.options.forEach((o) => { if (l.optionIds.includes(o.id)) opts.push(o); }));
      const unit = it.price + opts.reduce((s, o) => s + o.delta, 0);
      return { ...l, item: it, name: it.name, options: opts, unit, total: unit * l.qty };
    });
  }

  const api = {
    lines: () => lines,
    priced,
    count: () => lines.reduce((s, l) => s + l.qty, 0),
    subtotal: () => priced().reduce((s, l) => s + l.total, 0),
    add(itemId, qty, optionIds, note) {
      const key = keyOf(itemId, optionIds, note);
      const max = window.H11_ORDERING.maxQtyPerLine;
      const ex = lines.find((l) => l.key === key);
      if (ex) ex.qty = Math.min(max, ex.qty + qty);
      else lines.push({ key, itemId, qty: Math.min(max, qty), optionIds: [...optionIds], note: (note || "").trim() });
      save();
    },
    setQty(key, qty) {
      const l = lines.find((x) => x.key === key); if (!l) return;
      if (qty <= 0) lines = lines.filter((x) => x.key !== key);
      else l.qty = Math.min(window.H11_ORDERING.maxQtyPerLine, qty);
      save();
    },
    remove(key) { lines = lines.filter((l) => l.key !== key); save(); },
    clear() { lines = []; save(); },
    // Payload für den Server: nur IDs + Mengen, KEINE Preise
    payloadItems: () => lines.map((l) => ({ id: l.itemId, qty: l.qty, options: l.optionIds, note: l.note })),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  };
  window.addEventListener("storage", (e) => { if (e.key === KEY) { try { lines = JSON.parse(e.newValue || "[]"); } catch (x) { lines = []; } listeners.forEach((f) => f()); } });
  window.H11Cart = api;
})();
