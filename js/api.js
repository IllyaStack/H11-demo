/* H11 – Daten- & Supabase-Schicht.
 * Nutzt EINEN gemeinsamen Supabase-Browser-Client (window.H11Supabase / H11Api.client()) mit dem
 * öffentlichen Publishable Key (NIEMALS secret / service_role im Browser!).
 * Lädt Kategorien, Speisekarte (menu_items inkl. Optionen) und öffentliche Restaurant-Einstellungen
 * aus Supabase und bewahrt den Demo-Modus als sicheren Fallback. */
(function () {
  const O = window.H11_ORDERING || {};
  const C = window.H11 || {};
  const SUPABASE_URL = (O.SUPABASE_URL || (O.supabase && O.supabase.url) || "").trim();
  const SUPABASE_PUBLISHABLE_KEY = (
    O.SUPABASE_PUBLISHABLE_KEY ||
    (O.supabase && (O.supabase.publishableKey || O.supabase.anonKey)) ||
    ""
  ).trim();
  const useSB = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js";

  const STATUS = {
    new: "Neu",
    preparing: "In Zubereitung",
    ready: "Abholbereit",
    picked_up: "Abgeholt",
    cancelled: "Storniert",
  };
  const euro = (n) => "€ " + Number(n || 0).toFixed(2).replace(".", ",");
  const err = (code, detail) => Object.assign(new Error(code + (detail ? ":" + detail : "")), { code, detail });

  function humanError(e) {
    const m = String((e && e.message) || e || "");
    const [code, detail] = m.split(/:(.*)/s);
    switch (code) {
      case "ordering_paused":
        return "Online-Bestellungen sind momentan pausiert.";
      case "sold_out":
        return `„${detail || "Ein Artikel"}“ ist leider heute ausverkauft. Bitte entferne ihn aus dem Warenkorb.`;
      case "invalid_item":
        return "Ein Artikel ist nicht mehr verfügbar. Bitte Warenkorb prüfen.";
      case "invalid_option":
        return "Die gewählten Optionen sind ungültig. Bitte Artikel neu auswählen.";
      case "invalid_input":
        return detail === "name"
          ? "Bitte gib deinen Namen an."
          : detail === "email"
          ? "Bitte prüfe deine E-Mail-Adresse."
          : "Bitte prüfe deine Eingaben.";
      case "demo_disabled":
        return "Der Demo-Modus ist auf dem Server deaktiviert.";
      case "stripe_unavailable":
        return "Online-Zahlung ist noch nicht eingerichtet.";
      default:
        return "Verbindungsproblem – bitte versuche es gleich noch einmal.";
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const subs = (set) => (f) => {
    set.add(f);
    return () => set.delete(f);
  };

  /* ======================= 1. SHARED SUPABASE BROWSER CLIENT ======================= */
  let sharedClient = null;
  let sharedClientPromise = null;

  function getSharedSupabaseClient() {
    if (!useSB) return Promise.resolve(null);
    if (sharedClient) return Promise.resolve(sharedClient);
    if (window.H11Supabase) {
      sharedClient = window.H11Supabase;
      return Promise.resolve(sharedClient);
    }
    if (!sharedClientPromise) {
      sharedClientPromise = new Promise((resolve, reject) => {
        const init = () => {
          try {
            sharedClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
            });
            window.H11Supabase = sharedClient;
            resolve(sharedClient);
          } catch (e) {
            reject(err("network"));
          }
        };
        if (window.supabase && typeof window.supabase.createClient === "function") {
          init();
        } else {
          const s = document.createElement("script");
          s.src = SDK;
          s.onload = init;
          s.onerror = () => reject(err("network"));
          document.head.appendChild(s);
        }
      });
    }
    return sharedClientPromise;
  }

  /* ======================= 2. LOCAL FALLBACK BACKEND (DEMO MODE) ======================= */
  const local = (() => {
    const KEY = "h11_local_db_v1";
    const listeners = new Set();
    const load = () => {
      let db = null;
      try {
        db = JSON.parse(localStorage.getItem(KEY));
      } catch (e) {}
      if (!db || !db.orders) {
        db = {
          orders: [],
          settings: {
            id: 1,
            ordering_enabled: true,
            demo_mode: true,
            pickup_message: "",
            restaurant_name: C.name || "H11 Neubau",
            address: C.address ? `${C.address.street}, ${C.address.zip} ${C.address.city}` : "Neubaugasse 9, 1070 Wien",
          },
          soldOut: {},
          counter: (O.localFirstOrderNumber || 142) - 1,
        };
      }
      return db;
    };
    const save = (db) => {
      localStorage.setItem(KEY, JSON.stringify(db));
      fire();
    };
    const fire = () => listeners.forEach((f) => f());
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) fire();
    });
    const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

    function validate(payload, db) {
      if (!db.settings.ordering_enabled) throw err("ordering_paused");
      const c = payload.customer || {};
      const name = String(c.name || "").trim() || "Abholung";
      if (name.length > 60) throw err("invalid_input", "name");
      if (String(c.email || "").length > 120 || (c.email && !String(c.email).includes("@"))) {
        throw err("invalid_input", "email");
      }
      if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 30) {
        throw err("invalid_input", "items");
      }
      let subtotal = 0;
      const lines = [];
      payload.items.forEach((x) => {
        const it = C.catalog.byId[x.id];
        const qty = Number(x.qty);
        if (!it || !it.active || !(it.price > 0)) throw err("invalid_item");
        if (!Number.isInteger(qty) || qty < 1 || qty > (O.maxQtyPerLine || 20)) throw err("invalid_input", "items");
        if (db.soldOut[it.id] || it.sold_out) throw err("sold_out", it.name);
        const ids = x.options || [];
        if (new Set(ids).size !== ids.length) throw err("invalid_option");
        const chosen = [];
        (it.groups || []).forEach((g) => {
          const sel = g.options.filter((o) => ids.includes(o.id));
          if (sel.length > g.max || sel.length < (g.required ? Math.max(g.min, 1) : g.min)) {
            throw err("invalid_option", g.name);
          }
          chosen.push(...sel);
        });
        if (chosen.length !== ids.length) throw err("invalid_option");
        const unit = Number(it.price) + chosen.reduce((s, o) => s + Number(o.delta || 0), 0);
        subtotal += unit * qty;
        lines.push({
          menu_item_id: it.id,
          name: it.name,
          unit_price: unit,
          quantity: qty,
          selected_options: chosen.map((o) => ({ id: o.id, name: o.name, price_delta: o.delta })),
          note: String(x.note || "").slice(0, 140),
          total_price: unit * qty,
        });
      });
      return { name, lines, subtotal: Math.round(subtotal * 100) / 100 };
    }

    const pub = (o) => ({
      public_order_number: o.public_order_number,
      customer_name: o.customer_name,
      customer_note: o.customer_note,
      payment_status: o.payment_status,
      order_status: o.order_status,
      total: o.total,
      created_at: o.created_at,
      items: o.order_items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        selected_options: i.selected_options,
        note: i.note,
      })),
    });

    return {
      async getSettings() {
        return load().settings;
      },
      async getMenuState() {
        const db = load();
        return C.catalog.items.map((i) => ({
          id: i.id,
          price: i.price,
          active: i.active !== false,
          sold_out: !!(db.soldOut[i.id] || i.sold_out),
        }));
      },
      watchSettings(cb) {
        const f = () => cb(load().settings);
        return subs(listeners)(f);
      },
      watchMenu(cb) {
        const f = () => {
          const db = load();
          cb(
            C.catalog.items.map((i) => ({
              id: i.id,
              sold_out: !!(db.soldOut[i.id] || i.sold_out),
              active: i.active !== false,
            }))
          );
        };
        return subs(listeners)(f);
      },
      async placeDemoOrder(payload) {
        await sleep(350);
        const db = load();
        const v = validate(payload, db);
        db.counter += 1;
        const c = payload.customer || {};
        const note = String(payload.note != null ? payload.note : c.note || "").slice(0, 300);
        const o = {
          id: rid(),
          public_order_number: "H11-" + db.counter,
          tracking_token: rid(),
          customer_name: v.name,
          customer_phone: String(c.phone || "").slice(0, 30),
          customer_email: String(c.email || "").slice(0, 120),
          customer_note: note,
          subtotal: v.subtotal,
          total: v.subtotal,
          currency: "eur",
          payment_status: "paid",
          order_status: "new",
          is_demo: true,
          created_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
          order_items: v.lines,
        };
        db.orders.unshift(o);
        save(db);
        return {
          order_id: o.id,
          order_number: o.public_order_number,
          tracking_token: o.tracking_token,
          total: o.total,
        };
      },
      async createCheckout() {
        throw err("stripe_unavailable");
      },
      async getOrderPublic(token) {
        const o = load().orders.find((x) => x.tracking_token === token);
        return o ? pub(o) : null;
      },
      watchOrderPublic(token, cb) {
        const f = async () => cb(await this.getOrderPublic(token), true);
        const un = subs(listeners)(f);
        const t = setInterval(f, 4000);
        f();
        return () => {
          un();
          clearInterval(t);
        };
      },
      watchOrders(cb, onConn) {
        const f = () => cb(load().orders.filter((o) => o.payment_status === "paid"));
        const un = subs(listeners)(f);
        onConn && onConn(true);
        f();
        return un;
      },
      async setOrderStatus(o, status) {
        const db = load();
        const x = db.orders.find((y) => y.id === o.id);
        if (!x) return;
        x.order_status = status;
        const now = new Date().toISOString();
        if (status === "preparing") x.preparing_at = now;
        if (status === "ready") x.ready_at = now;
        if (status === "picked_up") x.collected_at = now;
        if (status === "cancelled") x.cancelled_at = now;
        save(db);
      },
      async setSettings(patch) {
        const db = load();
        db.settings = { ...db.settings, ...patch };
        save(db);
      },
      async setSoldOut(id, v) {
        const db = load();
        if (v) db.soldOut[id] = true;
        else delete db.soldOut[id];
        if (C.catalog && C.catalog.byId[id]) C.catalog.byId[id].sold_out = !!v;
        save(db);
      },
      auth: {
        async session() {
          return { local: true };
        },
        async isStaff() {
          return true;
        },
        async signIn() {},
        async signOut() {},
        onAuthStateChange() {
          return () => {};
        },
      },
      async clearAll() {
        localStorage.removeItem(KEY);
        fire();
      },
    };
  })();

  /* ======================= 3. SUPABASE CATALOG + SETTINGS LOADER ======================= */
  let dbReady = false;
  let bootstrapPromise = null;

  function applyCatalogFromSupabase(cats, rows) {
    const categories = [];
    const items = [];
    const byId = {};
    const byName = {};
    const menu = [];

    cats.forEach((c, ci) => {
      const catId = c.id;
      categories.push({
        id: catId,
        name: c.name,
        slug: c.slug || catId,
        sort_order: c.sort_order ?? ci,
      });
      const mc = { id: catId, label: c.name, items: [] };
      menu.push(mc);

      rows
        .filter((r) => r.category_id === catId)
        .forEach((r, ii) => {
          const rawPrice =
            r.price != null ? Number(r.price) : r.price_cents != null ? Number(r.price_cents) / 100 : null;
          const priceCents =
            r.price_cents != null
              ? Number(r.price_cents)
              : rawPrice != null && !Number.isNaN(rawPrice)
              ? Math.round(rawPrice * 100)
              : null;
          const groups = (r.menu_option_groups || [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((g) => ({
              id: g.id,
              name: g.name,
              required: !!g.required,
              min: g.min_choices ?? 0,
              max: g.max_choices ?? 1,
              sort_order: g.sort_order ?? 0,
              options: (g.menu_options || [])
                .filter((o) => o.active !== false)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((o) => ({
                  id: o.id,
                  name: o.name,
                  delta: Number(o.price_delta ?? 0),
                  sort_order: o.sort_order ?? 0,
                })),
            }));
          const it = {
            id: r.id,
            name: r.name,
            desc: r.description || "",
            price: rawPrice,
            price_cents: priceCents,
            displayPrice: null,
            category: catId,
            image: r.image_url || null,
            active: r.active !== false,
            sold_out: !!r.sold_out,
            sort_order: r.sort_order ?? ii,
            price_is_demo: !!r.price_is_demo,
            groups,
          };
          mc.items.push(it);
          items.push(it);
          byId[it.id] = it;
          byName[it.name] = it;
        });
    });

    const nonEmptyMenu = menu.filter((m) => m.items.length > 0);
    if (!items.length || !nonEmptyMenu.length) return false;

    C.menu = nonEmptyMenu;
    C.catalog = { categories, items, byId, byName };
    C.menuSource = "supabase";
    O.pricesAreDemo = items.some((i) => i.price_is_demo);
    return true;
  }

  function applyPublicSettings(s) {
    if (!s) return;
    C.settings = s;
    if (s.restaurant_name) C.name = s.restaurant_name;
    if (Array.isArray(s.opening_hours) && s.opening_hours.length) {
      C.hours = s.opening_hours;
      C.hoursConfirmed = !!s.hours_confirmed;
    }
    if (typeof s.demo_mode === "boolean") {
      // Wenn DEMO_MODE in config.js explizit false ist, bleibt Echtbetrieb erzwungen.
      // Andernfalls steuert restaurant_settings.demo_mode aus Supabase den Modus.
      window.H11Api.demo = O.DEMO_MODE === false ? false : s.demo_mode;
    }
    if (window.H11UI && typeof window.H11UI.demoStrip === "function") {
      window.H11UI.demoStrip();
    }
  }

  function loadCatalogAndSettings() {
    if (!useSB) {
      C.menuSource = "demo";
      return Promise.resolve({ dbReady: false, source: "demo" });
    }
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        const c = await getSharedSupabaseClient();
        const [catsRes, itemsRes, settingsRes] = await Promise.all([
          c.from("categories").select("*").eq("active", true).order("sort_order", { ascending: true }),
          c
            .from("menu_items")
            .select("*, menu_option_groups(*, menu_options(*))")
            .eq("active", true)
            .order("sort_order", { ascending: true }),
          c.from("restaurant_settings").select("*").eq("id", 1).maybeSingle(),
        ]);

        if (catsRes.error || itemsRes.error) {
          throw catsRes.error || itemsRes.error;
        }

        dbReady = true;
        if (settingsRes.data) {
          applyPublicSettings(settingsRes.data);
        }
        const applied = applyCatalogFromSupabase(catsRes.data || [], itemsRes.data || []);
        if (!applied) {
          console.info(
            "[H11] Supabase-Tabellen erreichbar, aber noch keine aktiven menu_items vorhanden – Demo-Katalog bleibt als Fallback aktiv."
          );
          C.menuSource = "demo";
        }
        document.dispatchEvent(
          new CustomEvent("h11:catalog", {
            detail: { source: C.menuSource, settings: settingsRes.data || null },
          })
        );
        document.dispatchEvent(new CustomEvent("h11:menu"));
        return { dbReady: true, source: C.menuSource, settings: settingsRes.data || null };
      } catch (e) {
        dbReady = false;
        C.menuSource = "demo";
        console.warn(
          "[H11] Supabase-Datenbank noch nicht initialisiert oder nicht erreichbar – Demo-Modus-Fallback aktiv:",
          (e && e.message) || e
        );
        return { dbReady: false, source: "demo", error: e };
      }
    })();
    return bootstrapPromise;
  }

  /* ======================= 4. SUPABASE BACKEND ======================= */
  const remote = (() => {
    const wrap = async (fn) => {
      try {
        const c = await getSharedSupabaseClient();
        return await fn(c);
      } catch (e) {
        if (e && e.code && typeof e.code === "string" && !/^PGRST|^42/.test(e.code)) throw e;
        throw err("network");
      }
    };
    const fail = (error) => {
      if (!error) return;
      const msg = String(error.message || "");
      throw err(/^[a-z_]+(:.*)?$/s.test(msg) ? msg : "network");
    };

    function channel(name, table, handler, onConn) {
      let ch = null;
      let dead = false;
      getSharedSupabaseClient()
        .then((c) => {
          if (dead || !c) return;
          ch = c
            .channel(name + "-" + Math.random().toString(36).slice(2, 8))
            .on("postgres_changes", { event: "*", schema: "public", table }, handler)
            .subscribe((st) => onConn && onConn(st === "SUBSCRIBED"));
        })
        .catch(() => onConn && onConn(false));
      return () => {
        dead = true;
        if (ch && sharedClient) sharedClient.removeChannel(ch);
      };
    }

    return {
      getSettings: async () => {
        await loadCatalogAndSettings();
        if (!dbReady) return local.getSettings();
        return wrap(async (c) => {
          const { data, error } = await c.from("restaurant_settings").select("*").eq("id", 1).maybeSingle();
          if (error) fail(error);
          if (data) applyPublicSettings(data);
          return data || { ordering_enabled: true, demo_mode: true };
        });
      },
      getMenuState: async () => {
        await loadCatalogAndSettings();
        if (!dbReady) return local.getMenuState();
        return wrap(async (c) => {
          const { data, error } = await c.from("menu_items").select("id,price,price_cents,active,sold_out");
          if (error) fail(error);
          return data || [];
        });
      },
      watchSettings(cb) {
        const unLocal = local.watchSettings((s) => {
          if (!dbReady) cb(s);
        });
        const unRemote = channel("settings", "restaurant_settings", (p) => {
          if (p.new) {
            dbReady = true;
            applyPublicSettings(p.new);
            cb(p.new);
          }
        });
        return () => {
          unLocal();
          unRemote();
        };
      },
      watchMenu(cb) {
        const unLocal = local.watchMenu((rows) => {
          if (!dbReady) cb(rows);
        });
        const unRemote = channel("menu", "menu_items", (p) => {
          if (p.new) {
            dbReady = true;
            cb([p.new]);
          }
        });
        return () => {
          unLocal();
          unRemote();
        };
      },
      placeDemoOrder: async (payload) => {
        await loadCatalogAndSettings();
        if (!dbReady) return local.placeDemoOrder(payload);
        return wrap(async (c) => {
          const { data, error } = await c.rpc("place_demo_order", { payload });
          if (error) fail(error);
          return {
            order_id: data.order_id,
            order_number: data.order_number,
            tracking_token: data.tracking_token,
            total: data.total,
          };
        });
      },
      createCheckout: (payload) =>
        wrap(async (c) => {
          const { data, error } = await c.functions.invoke("create-checkout-session", { body: payload });
          if (error) {
            let m = "network";
            try {
              m = (await error.context.json()).error || m;
            } catch (e) {}
            throw err(...String(m).split(/:(.*)/s).slice(0, 2));
          }
          return data;
        }),
      getOrderPublic: async (token) => {
        await loadCatalogAndSettings();
        if (!dbReady) return local.getOrderPublic(token);
        return wrap(async (c) => {
          const { data, error } = await c.rpc("get_order_by_token", { p_token: token });
          if (error) fail(error);
          return data || (await local.getOrderPublic(token));
        });
      },
      watchOrderPublic(token, cb) {
        // Anonyme Kunden haben keinen direkten Lesezugriff auf public.orders (RLS).
        // Kombination aus Realtime-Broadcast (auf dem Token-Kanal) + sicherem RPC-Polling.
        let stop = false;
        let bcast = null;
        const tick = async () => {
          if (stop) return;
          try {
            const d = await this.getOrderPublic(token);
            cb(d, true);
          } catch (e) {
            cb(undefined, false);
          }
        };
        getSharedSupabaseClient()
          .then((c) => {
            if (stop || !c) return;
            bcast = c
              .channel("order:" + token)
              .on("broadcast", { event: "order_updated" }, () => tick())
              .subscribe();
          })
          .catch(() => {});
        const loop = async () => {
          if (stop) return;
          await tick();
          if (!stop) setTimeout(loop, document.hidden ? 8000 : 3000);
        };
        loop();
        return () => {
          stop = true;
          if (bcast && sharedClient) sharedClient.removeChannel(bcast);
        };
      },
      watchOrders(cb, onConn) {
        const map = new Map();
        let live = false;
        let dead = false;
        const emit = () => cb([...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        const loadAll = () =>
          wrap(async (c) => {
            const { data, error } = await c
              .from("orders")
              .select("*, order_items(*)")
              .eq("payment_status", "paid")
              .order("created_at", { ascending: false })
              .limit(300);
            if (error) fail(error);
            map.clear();
            (data || []).forEach((o) => map.set(o.id, o));
            emit();
          }).catch(() => {});
        loadAll();
        const un = channel(
          "orders",
          "orders",
          async (p) => {
            const row = p.new;
            if (!row || !row.id) return;
            if (row.payment_status !== "paid") {
              map.delete(row.id);
              return emit();
            }
            try {
              const c = await getSharedSupabaseClient();
              const { data } = await c.from("orders").select("*, order_items(*)").eq("id", row.id).single();
              if (data) {
                map.set(data.id, data);
                emit();
              }
            } catch (e) {
              loadAll();
            }
          },
          (ok) => {
            const was = live;
            live = ok;
            onConn && onConn(ok);
            if (ok && !was) loadAll();
          }
        );
        const t = setInterval(() => {
          if (!live && !dead) loadAll();
        }, 20000);
        return () => {
          dead = true;
          clearInterval(t);
          un();
        };
      },
      setOrderStatus: (o, status) =>
        wrap(async (c) => {
          const { error } = await c.from("orders").update({ order_status: status }).eq("id", o.id);
          if (error) fail(error);
          // Sofortiges Realtime-Signal an die Bestellstatus-Seite des Kunden senden (falls geöffnet):
          if (o && o.tracking_token) {
            try {
              const ch = c.channel("order:" + o.tracking_token);
              ch.subscribe((st) => {
                if (st === "SUBSCRIBED") {
                  ch.send({ type: "broadcast", event: "order_updated", payload: { order_status: status } });
                  setTimeout(() => c.removeChannel(ch), 1500);
                }
              });
            } catch (e) {}
          }
        }),
      setSettings: (patch) =>
        wrap(async (c) => {
          const { error } = await c.from("restaurant_settings").update(patch).eq("id", 1);
          if (error) fail(error);
        }),
      setSoldOut: (id, v) =>
        wrap(async (c) => {
          const { error } = await c.from("menu_items").update({ sold_out: v }).eq("id", id);
          if (error) fail(error);
        }),
      auth: {
        session: () => wrap(async (c) => (await c.auth.getSession()).data.session),
        isStaff: () =>
          wrap(async (c) => {
            const { data, error } = await c.rpc("is_staff");
            if (error) return false;
            return !!data;
          }),
        signIn: (email, password) =>
          wrap(async (c) => {
            const { error } = await c.auth.signInWithPassword({ email, password });
            if (error) throw err("login_failed");
          }),
        signOut: () =>
          wrap(async (c) => {
            await c.auth.signOut();
          }),
        onAuthStateChange: (cb) => {
          let sub = null;
          getSharedSupabaseClient()
            .then((c) => {
              if (!c) return;
              const { data } = c.auth.onAuthStateChange((event, session) => cb(event, session));
              sub = data && data.subscription;
            })
            .catch(() => {});
          return () => {
            if (sub) sub.unsubscribe();
          };
        },
      },
    };
  })();

  window.H11Api = {
    ...(useSB ? remote : local),
    useSB,
    demo: !!O.DEMO_MODE,
    isDbReady: () => dbReady,
    client: getSharedSupabaseClient,
    ready: loadCatalogAndSettings,
    STATUS,
    euro,
    humanError,
    localBackend: local,
  };

  // Startet das Laden von Kategorien, Speisekarte und Einstellungen sofort beim Skriptstart
  if (useSB) {
    loadCatalogAndSettings();
  }
})();
