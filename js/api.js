/* H11 – Daten-Schicht. Zwei Backends mit identischer Schnittstelle:
 *   • "local"    – localStorage (Demo ohne Server, nur im selben Browser sichtbar)
 *   • "supabase" – echte Datenbank, Realtime, Auth, Stripe über Edge Functions
 * Das Frontend vertraut NIE den Preisen aus dem Browser – der Server (bzw. die lokale Simulation) rechnet neu. */
(function () {
  const O = window.H11_ORDERING, C = window.H11;
  const useSB = !!(O.supabase.url && O.supabase.anonKey);
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

  const STATUS = { new: "Neu", preparing: "In Zubereitung", ready: "Abholbereit", picked_up: "Abgeholt", cancelled: "Storniert" };
  const euro = (n) => "€ " + Number(n).toFixed(2).replace(".", ",");
  const err = (code, detail) => Object.assign(new Error(code + (detail ? ":" + detail : "")), { code, detail });

  // Server-Fehlercodes → verständliche Meldungen
  function humanError(e) {
    const m = String((e && e.message) || e || "");
    const [code, detail] = m.split(/:(.*)/s);
    switch (code) {
      case "ordering_paused": return "Online-Bestellungen sind momentan pausiert.";
      case "sold_out": return `„${detail || "Ein Artikel"}“ ist leider heute ausverkauft. Bitte entferne ihn aus dem Warenkorb.`;
      case "invalid_item": return "Ein Artikel ist nicht mehr verfügbar. Bitte Warenkorb prüfen.";
      case "invalid_option": return "Die gewählten Optionen sind ungültig. Bitte Artikel neu auswählen.";
      case "invalid_input": return detail === "name" ? "Bitte gib deinen Namen an." : detail === "email" ? "Bitte prüfe deine E-Mail-Adresse." : "Bitte prüfe deine Eingaben.";
      case "demo_disabled": return "Der Demo-Modus ist auf dem Server deaktiviert.";
      case "stripe_unavailable": return "Online-Zahlung ist noch nicht eingerichtet.";
      default: return "Verbindungsproblem – bitte versuche es gleich noch einmal.";
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const subs = (set) => (f) => { set.add(f); return () => set.delete(f); };

  /* ======================= LOCAL BACKEND ======================= */
  const local = (() => {
    const KEY = "h11_local_db_v1";
    const listeners = new Set();
    const load = () => {
      let db = null; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
      if (!db || !db.orders) db = { orders: [], settings: { ordering_enabled: true, pickup_message: "" }, soldOut: {}, counter: O.localFirstOrderNumber - 1 };
      return db;
    };
    const save = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); fire(); };
    const fire = () => listeners.forEach((f) => f());
    window.addEventListener("storage", (e) => { if (e.key === KEY) fire(); });
    const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

    function validate(payload, db) {
      if (!db.settings.ordering_enabled) throw err("ordering_paused");
      const c = payload.customer || {};
      const name = String(c.name || "").trim();
      if (!name || name.length > 60) throw err("invalid_input", "name");
      if (String(c.email || "").length > 120 || (c.email && !String(c.email).includes("@"))) throw err("invalid_input", "email");
      if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 30) throw err("invalid_input", "items");
      let subtotal = 0; const lines = [];
      payload.items.forEach((x) => {
        const it = C.catalog.byId[x.id]; const qty = Number(x.qty);
        if (!it || !it.active) throw err("invalid_item");
        if (!Number.isInteger(qty) || qty < 1 || qty > O.maxQtyPerLine) throw err("invalid_input", "items");
        if (db.soldOut[it.id]) throw err("sold_out", it.name);
        const ids = x.options || [];
        if (new Set(ids).size !== ids.length) throw err("invalid_option");
        const chosen = [];
        it.groups.forEach((g) => {
          const sel = g.options.filter((o) => ids.includes(o.id));
          if (sel.length > g.max || sel.length < (g.required ? Math.max(g.min, 1) : g.min)) throw err("invalid_option", g.name);
          chosen.push(...sel);
        });
        if (chosen.length !== ids.length) throw err("invalid_option");
        const unit = it.price + chosen.reduce((s, o) => s + o.delta, 0);
        subtotal += unit * qty;
        lines.push({ menu_item_id: it.id, name: it.name, unit_price: unit, quantity: qty,
          selected_options: chosen.map((o) => ({ id: o.id, name: o.name, price_delta: o.delta })),
          note: String(x.note || "").slice(0, 140), total_price: unit * qty });
      });
      return { name, lines, subtotal: Math.round(subtotal * 100) / 100 };
    }

    const pub = (o) => ({ public_order_number: o.public_order_number, customer_name: o.customer_name, payment_status: o.payment_status,
      order_status: o.order_status, total: o.total, created_at: o.created_at,
      items: o.order_items.map((i) => ({ name: i.name, quantity: i.quantity, selected_options: i.selected_options, note: i.note })) });

    return {
      async getSettings() { return load().settings; },
      async getMenuState() { const db = load(); return C.catalog.items.map((i) => ({ id: i.id, price: i.price, active: true, sold_out: !!db.soldOut[i.id] })); },
      watchSettings(cb) { const f = () => cb(load().settings); return subs(listeners)(f); },
      watchMenu(cb) { const f = () => { const db = load(); cb(C.catalog.items.map((i) => ({ id: i.id, sold_out: !!db.soldOut[i.id], active: true }))); }; return subs(listeners)(f); },
      async placeDemoOrder(payload) {
        await sleep(500);
        const db = load(); const v = validate(payload, db);
        db.counter += 1;
        const c = payload.customer;
        const o = { id: rid(), public_order_number: "H" + db.counter, tracking_token: rid(), customer_name: v.name,
          customer_phone: String(c.phone || "").slice(0, 30), customer_email: String(c.email || "").slice(0, 120),
          customer_note: String(c.note || "").slice(0, 300), subtotal: v.subtotal, total: v.subtotal, currency: "eur",
          payment_status: "paid", order_status: "new", is_demo: true, created_at: new Date().toISOString(),
          paid_at: new Date().toISOString(), order_items: v.lines };
        db.orders.unshift(o); save(db);
        return { order_id: o.id, order_number: o.public_order_number, tracking_token: o.tracking_token, total: o.total };
      },
      async createCheckout() { throw err("stripe_unavailable"); },
      async getOrderPublic(token) { const o = load().orders.find((x) => x.tracking_token === token); return o ? pub(o) : null; },
      watchOrderPublic(token, cb) {
        const f = async () => cb(await this.getOrderPublic(token), true);
        const un = subs(listeners)(f); const t = setInterval(f, 4000); f();
        return () => { un(); clearInterval(t); };
      },
      watchOrders(cb, onConn) { const f = () => cb(load().orders.filter((o) => o.payment_status === "paid")); const un = subs(listeners)(f); onConn && onConn(true); f(); return un; },
      async setOrderStatus(o, status) {
        const db = load(); const x = db.orders.find((y) => y.id === o.id); if (!x) return;
        x.order_status = status; const now = new Date().toISOString();
        if (status === "preparing") x.preparing_at = now; if (status === "ready") x.ready_at = now;
        if (status === "picked_up") x.collected_at = now; if (status === "cancelled") x.cancelled_at = now;
        save(db);
      },
      async setSettings(patch) { const db = load(); db.settings = { ...db.settings, ...patch }; save(db); },
      async setSoldOut(id, v) { const db = load(); if (v) db.soldOut[id] = true; else delete db.soldOut[id]; save(db); },
      auth: { async session() { return { local: true }; }, async isStaff() { return true; }, async signIn() {}, async signOut() {} },
      async clearAll() { localStorage.removeItem(KEY); fire(); },
    };
  })();

  /* ======================= SUPABASE BACKEND ======================= */
  const remote = (() => {
    let sb = null, loading = null;
    function client() {
      if (sb) return Promise.resolve(sb);
      if (!loading) loading = new Promise((res, rej) => {
        const s = document.createElement("script"); s.src = SDK;
        s.onload = () => { sb = window.supabase.createClient(O.supabase.url, O.supabase.anonKey); res(sb); };
        s.onerror = () => rej(err("network")); document.head.appendChild(s);
      });
      return loading;
    }
    const wrap = async (fn) => { try { return await fn(await client()); } catch (e) { if (e && e.code) throw e; throw err("network"); } };
    const fail = (error) => { throw err(error.message && /^[a-z_]+(:.*)?$/s.test(error.message) ? error.message : "network"); };

    function channel(name, table, handler, onConn) {
      let ch = null, dead = false;
      client().then((c) => {
        if (dead) return;
        ch = c.channel(name + Math.random().toString(36).slice(2))
          .on("postgres_changes", { event: "*", schema: "public", table }, handler)
          .subscribe((st) => onConn && onConn(st === "SUBSCRIBED"));
      }).catch(() => onConn && onConn(false));
      return () => { dead = true; if (ch) sb.removeChannel(ch); };
    }

    return {
      getSettings: () => wrap(async (c) => { const { data, error } = await c.from("restaurant_settings").select("*").eq("id", 1).single(); if (error) fail(error); return data; }),
      getMenuState: () => wrap(async (c) => { const { data, error } = await c.from("menu_items").select("id,price,active,sold_out"); if (error) fail(error); return data; }),
      watchSettings: (cb) => channel("settings", "restaurant_settings", (p) => p.new && cb(p.new)),
      watchMenu: (cb) => channel("menu", "menu_items", (p) => p.new && cb([p.new])),
      placeDemoOrder: (payload) => wrap(async (c) => {
        const { data, error } = await c.rpc("place_demo_order", { payload }); if (error) fail(error);
        return { order_id: data.order_id, order_number: data.order_number, tracking_token: data.tracking_token, total: data.total };
      }),
      createCheckout: (payload) => wrap(async (c) => {
        const { data, error } = await c.functions.invoke("create-checkout-session", { body: payload });
        if (error) { let m = "network"; try { m = (await error.context.json()).error || m; } catch (e) {} throw err(...String(m).split(/:(.*)/s).slice(0, 2)); }
        return data;
      }),
      getOrderPublic: (token) => wrap(async (c) => { const { data, error } = await c.rpc("get_order_by_token", { p_token: token }); if (error) fail(error); return data; }),
      watchOrderPublic(token, cb) {
        // Kunden sind anonym (kein Realtime-Zugriff auf RLS-geschützte Tabellen) → kurzes Polling über sichere RPC.
        let stop = false, last = "";
        const tick = async () => {
          if (stop) return;
          try { const d = await this.getOrderPublic(token); cb(d, true); last = JSON.stringify(d); }
          catch (e) { cb(undefined, false); }
          setTimeout(tick, document.hidden ? 8000 : 3000);
        };
        tick(); return () => { stop = true; };
      },
      watchOrders(cb, onConn) {
        const map = new Map(); let live = false, dead = false;
        const emit = () => cb([...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        const loadAll = () => wrap(async (c) => {
          const { data, error } = await c.from("orders").select("*, order_items(*)").eq("payment_status", "paid").order("created_at", { ascending: false }).limit(300);
          if (error) fail(error); map.clear(); data.forEach((o) => map.set(o.id, o)); emit();
        }).catch(() => {});
        loadAll();
        const un = channel("orders", "orders", async (p) => {
          const row = p.new; if (!row || !row.id) return;
          if (row.payment_status !== "paid") { map.delete(row.id); return emit(); }
          try {
            const c = await client();
            const { data } = await c.from("orders").select("*, order_items(*)").eq("id", row.id).single();
            if (data) { map.set(data.id, data); emit(); }
          } catch (e) { loadAll(); }
        }, (ok) => { const was = live; live = ok; onConn && onConn(ok); if (ok && !was) loadAll(); });
        const t = setInterval(() => { if (!live && !dead) loadAll(); }, 20000); // Sicherheitsnetz bei Verbindungsverlust
        return () => { dead = true; clearInterval(t); un(); };
      },
      setOrderStatus: (o, status) => wrap(async (c) => { const { error } = await c.from("orders").update({ order_status: status }).eq("id", o.id); if (error) fail(error); }),
      setSettings: (patch) => wrap(async (c) => { const { error } = await c.from("restaurant_settings").update(patch).eq("id", 1); if (error) fail(error); }),
      setSoldOut: (id, v) => wrap(async (c) => { const { error } = await c.from("menu_items").update({ sold_out: v }).eq("id", id); if (error) fail(error); }),
      auth: {
        session: () => wrap(async (c) => (await c.auth.getSession()).data.session),
        isStaff: () => wrap(async (c) => { const { data } = await c.rpc("is_staff"); return !!data; }),
        signIn: (email, password) => wrap(async (c) => { const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw err("login_failed"); }),
        signOut: () => wrap(async (c) => { await c.auth.signOut(); }),
      },
    };
  })();

  window.H11Api = { ...(useSB ? remote : local), useSB, demo: !!O.DEMO_MODE, STATUS, euro, humanError, localBackend: local };
})();
