/* H11 – Warenkorb (localStorage). Preise hier sind nur Anzeige – der Server berechnet den echten Betrag neu. */
(function () {
  const KEY = "h11_cart_v1";
  const C = window.H11;
  const listeners = new Set();
  let lines = [];

  try {
    lines = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch (e) {
    lines = [];
  }
  if (!Array.isArray(lines)) lines = [];
  lines = lines.filter((l) => l && l.itemId && Number.isInteger(l.qty) && l.qty > 0);

  const notify = () => listeners.forEach((f) => f());
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch (e) {}
    notify();
  };
  const keyOf = (itemId, optionIds, note) =>
    [itemId, [...(optionIds || [])].sort().join(","), (note || "").trim().toLowerCase()].join("|");

  // Aktuelle Preise aus dem geladenen Katalog (Supabase bzw. Fallback)
  function priced() {
    const byId = (C.catalog && C.catalog.byId) || {};
    return lines
      .map((l) => {
        const it = byId[l.itemId];
        if (!it) return null;
        const opts = [];
        const optIds = Array.isArray(l.optionIds) ? l.optionIds : [];
        (it.groups || []).forEach((g) =>
          (g.options || []).forEach((o) => {
            if (optIds.includes(o.id)) opts.push(o);
          })
        );
        const unit = Number(it.price || 0) + opts.reduce((s, o) => s + Number(o.delta || 0), 0);
        return { ...l, item: it, name: it.name, options: opts, unit, total: unit * l.qty };
      })
      .filter(Boolean);
  }

  // Sobald der autoritative Katalog (aus Supabase) geladen ist, ungültige IDs bereinigen
  document.addEventListener("h11:catalog", () => {
    const byId = (C.catalog && C.catalog.byId) || {};
    const before = lines.length;
    lines = lines.filter((l) => l && byId[l.itemId]);
    if (lines.length !== before) save();
    else notify();
  });

  const api = {
    lines: () => lines,
    priced,
    count: () => priced().reduce((s, l) => s + l.qty, 0),
    subtotal: () => priced().reduce((s, l) => s + l.total, 0),
    add(itemId, qty, optionIds, note) {
      const key = keyOf(itemId, optionIds, note);
      const max = window.H11_ORDERING.maxQtyPerLine || 20;
      const ex = lines.find((l) => l.key === key);
      if (ex) ex.qty = Math.min(max, ex.qty + qty);
      else lines.push({ key, itemId, qty: Math.min(max, qty), optionIds: [...(optionIds || [])], note: (note || "").trim() });
      save();
    },
    setQty(key, qty) {
      const l = lines.find((x) => x.key === key);
      if (!l) return;
      if (qty <= 0) lines = lines.filter((x) => x.key !== key);
      else l.qty = Math.min(window.H11_ORDERING.maxQtyPerLine || 20, qty);
      save();
    },
    remove(key) {
      lines = lines.filter((l) => l.key !== key);
      save();
    },
    clear() {
      lines = [];
      save();
    },
    // Payload für den Server: nur IDs + Mengen, KEINE Preise
    payloadItems: () => lines.map((l) => ({ id: l.itemId, qty: l.qty, options: l.optionIds || [], note: l.note || "" })),
    onChange(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      try {
        lines = JSON.parse(e.newValue || "[]");
      } catch (x) {
        lines = [];
      }
      notify();
    }
  });
  window.H11Cart = api;
})();
