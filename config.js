// ============================================================
// H11 NEUBAU – zentrale Konfiguration
// Alle restaurant-spezifischen Daten werden NUR hier gepflegt.
// ============================================================

// Hilfsfunktion für Menüeinträge: item(id, name, desc, price, image)
const item = (id, name, desc, price = null, image = null) => ({ id, name, desc, price, image });

window.H11 = {
  name: "H11 Neubau",
  address: { street: "Neubaugasse 9", zip: "1070", city: "Wien" },

  // Externe Bestell-Links (öffnen in neuem Tab)
  orderLinks: {
    wolt: "https://wolt.com/en/aut/vienna/restaurant/h11-neubau",
    lieferando: "https://www.lieferando.at/bg/menu/pane-gourmet-neubaugasse",
    foodora: "https://www.foodora.at/restaurant/eul1/h-11-doner-and-pizza",
  },

  social: {
    instagram: null, // TODO: echte H11-Neubau-URL eintragen; null = nicht klickbarer Platzhalter
  },

  // PLATZHALTER – Öffnungszeiten sind NICHT bestätigt.
  hoursConfirmed: false,
  hours: [
    { day: "Montag – Donnerstag", time: "Wird ergänzt" },
    { day: "Freitag – Samstag", time: "Wird ergänzt" },
    { day: "Sonntag", time: "Wird ergänzt" },
  ],

  // Google-Maps-Embed (Suche nach Adresse, kein API-Key nötig)
  mapQuery: "Neubaugasse 9, 1070 Wien",
  routeQuery: "H11 Neubau, Neubaugasse 9, 1070 Wien",

  // Favorites: echte Produktfotos aus der digitalen Speisekarte von H11
  favorites: [
    { name: "Chicken Döner Dürüm", desc: "Zartes Hühnchen mit knackigem Gemüse im Fladenbrot.", img: "assets/menu/chicken-doener-dueruem.webp", price: 7.5 },
    { name: "Beef Döner Sandwich", desc: "Kräftiges Rindfleisch im knusprigen Fladenbrot.", img: "assets/menu/beef-doener-sandwich.webp", price: 7.9 },
    { name: "Köfte Teller", desc: "Hausgemachte Köfte mit Pommes – deftig und sättigend.", img: "assets/menu/koefte-teller.webp", price: 16.9 },
    { name: "Pizza H11 Mix", desc: "Haus-Spezialität mit buntem Belag.", img: "assets/menu/pizza-h11-mix.webp", price: 14.9 },
  ],

  // Speisekarte – echte H11-Daten & Produktfotos aus https://h11doner-pizza.at/digitalmenu
  menu: [
    { id: "suppen", label: "Suppen", items: [
      item("linsensuppe", "Linsensuppe", "Cremige türkische Linsensuppe mit Gewürzen und Gemüse.", 5.9, "assets/menu/linsensuppe.webp"),
      item("patscha-suppe", "Patscha Suppe", "Traditionelle Spezialität – kräftig und sättigend.", 6.9, "assets/menu/patscha-suppe.webp"),
      item("huehnersuppe", "Hühnersuppe", "Klare Hühnerbrühe mit zartem Fleisch – wärmend und leicht.", 6.9, "assets/menu/huehnersuppe.jpg"),
    ]},
    { id: "wraps", label: "Wraps (Dürüm)", items: [
      item("beef-doener-dueruem", "Beef Döner Dürüm", "Saftiges Rindfleisch, frischer Salat und würzige Soße.", 8.9, "assets/menu/beef-doener-dueruem.webp"),
      item("chicken-doener-dueruem", "Chicken Döner Dürüm", "Zartes Hühnchen mit knackigem Gemüse im Fladenbrot.", 7.5, "assets/menu/chicken-doener-dueruem.webp"),
      item("koefte-dueruem", "Köfte Dürüm", "Gegrillte Köfte mit Salat und Soße im Dürüm.", 8.9, "assets/menu/koefte-dueruem.webp"),
      item("falafel-dueruem", "Falafel Dürüm", "Knusprige Falafel, Hummus, Salat – 100 % vegetarisch.", 7.5, "assets/menu/falafel-dueruem.webp"),
    ]},
    { id: "sandwiches", label: "Sandwiches", items: [
      item("beef-doener-sandwich", "Beef Döner Sandwich", "Kräftiges Rindfleisch im knusprigen Fladenbrot.", 7.9, "assets/menu/beef-doener-sandwich.webp"),
      item("chicken-doener-sandwich", "Chicken Döner Sandwich", "Frisches Hühnchen, Salat und hausgemachte Soße.", 6.9, "assets/menu/chicken-doener-sandwich.webp"),
      item("koefte-sandwich", "Köfte Sandwich", "Würzige Köfte mit Zwiebeln und frischem Gemüse.", 7.9, "assets/menu/koefte-sandwich.webp"),
      item("falafel-sandwich", "Falafel Sandwich", "Hausgemachte Falafel mit Salat und Tahini-Soße.", 6.9, "assets/menu/falafel-sandwich.webp"),
    ]},
    { id: "sandwichmenus", label: "Menüs", items: [
      item("chicken-sandwich-menue", "Chicken-Sandwich-Menü", "Inkl. Pommes & Getränk.", 12.9, null),
      item("beef-sandwich-menue", "Beef-Sandwich-Menü", "Inkl. Pommes & Getränk.", 13.9, null),
    ]},
    { id: "lahmacun", label: "Lahmacun Menü", items: [
      item("lahmacun-1-stk", "Lahmacun 1 Stk.", "Dünner Fladen mit würzigem Hackfleischbelag.", 6.9, "assets/menu/lahmacun-1-stk.webp"),
      item("lahmacun-portion", "Lahmacun Portion", "Mit Beilage und Soße – reichhaltig und frisch.", 12.9, "assets/menu/lahmacun-portion.webp"),
    ]},
    { id: "pizza", label: "Pizza", items: [
      item("pizza-margherita", "Pizza Margherita", "Tomatensoße, Mozzarella und Basilikum – der Klassiker.", 9.9, "assets/menu/pizza-margherita.webp"),
      item("pizza-funghi", "Pizza Funghi", "Mit frischen Champignons und zartem Käse.", 10.9, "assets/menu/pizza-funghi.webp"),
      item("pizza-al-tonno", "Pizza al Tonno", "Mit saftigem Thunfisch und roten Zwiebeln.", 10.9, "assets/menu/pizza-al-tonno.webp"),
      item("pizza-salami", "Pizza Salami", "Knuspriger Boden mit würziger Rindersalami.", 10.9, "assets/menu/pizza-salami.webp"),
      item("pizza-cardinale", "Pizza Cardinale", "Mit feinem Putenschinken und geschmolzenem Käse.", 10.9, "assets/menu/pizza-cardinale.webp"),
      item("pizza-h11-mix", "Pizza H11 Mix", "Haus-Spezialität mit buntem Belag.", 14.9, "assets/menu/pizza-h11-mix.webp"),
      item("pizza-quattro-formaggi", "Pizza Quattro Formaggi", "Vier Sorten Käse – cremig und intensiv.", 12.9, "assets/menu/pizza-quattro-formaggi.webp"),
      item("pizza-vegetarisch", "Pizza Vegetarisch", "Frisches Marktgemüse auf knusprigem Teig.", 10.9, "assets/menu/pizza-vegetarisch.webp"),
      item("beef-doener-pizza", "Beef Döner Pizza", "Dönerfleisch, Gemüse und Käse – Döner trifft Pizza.", 15.9, "assets/menu/beef-doener-pizza.webp"),
      item("chicken-doener-pizza", "Chicken Döner Pizza", "Mit Hühnchen, Gemüse und Käse – lecker und herzhaft.", 13.9, "assets/menu/chicken-doener-pizza.webp"),
    ]},
    { id: "grill", label: "Grillteller", items: [
      item("koefte-teller", "Köfte Teller", "Hausgemachte Köfte mit Pommes – deftig und sättigend.", 16.9, "assets/menu/koefte-teller.webp"),
      item("chicken-doener-teller", "Chicken Döner Teller", "Hühnchen Döner mit Reis – saftig und lecker.", 14.9, "assets/menu/chicken-doener-teller.webp"),
      item("beef-doener-teller", "Beef Döner Teller", "Rindfleisch Döner mit Reis – klassisch und herzhaft.", 16.9, "assets/menu/beef-doener-teller.webp"),
      item("iskender-kebap", "Iskender Kebap", "Mit Butter und typischer Soße – vom Grill.", 17.9, "assets/menu/iskender-kebap.webp"),
    ]},
    { id: "tagesmenus", label: "Tagesmenüs", items: [
      item("tagesmenue", "Tagesmenü", "Täglich wechselndes Gericht – frisch zubereitet.", 14.9, null),
    ]},
    { id: "beilagen", label: "Beilagen", items: [
      item("tzatziki", "Tzatziki", "Frischer Joghurt-Dip mit Gurke und Knoblauch.", 4.9, "assets/menu/tzatziki.webp"),
      item("hummus", "Hummus", "Cremiger Kichererbsen-Dip – vegetarisch und lecker.", 5.9, "assets/menu/hummus.webp"),
      item("pommes-frites", "Pommes Frites", "Knusprig und heiß – klassisch als Beilage.", 4.5, "assets/menu/pommes-frites.webp"),
      item("reis", "Reis", "Locker gedämpfter Reis – die klassische Beilage.", 3.9, null),
    ]},
    { id: "desserts", label: "Desserts", items: [
      item("milchreis", "Milchreis", "Cremig und süß – traditioneller Nachtisch.", 5.9, "assets/menu/milchreis.webp"),
      item("magnolia-schoko", "Magnolia Schoko", "Schichtdessert mit Schokolade, Früchten und Creme.", 5.9, "assets/menu/magnolia-schoko.webp"),
      item("magnolia-lotus", "Magnolia Lotus", "Mit karamellisiertem Lotus-Keks und feiner Creme.", 5.9, "assets/menu/magnolia-lotus.webp"),
      item("magnolia-oreo", "Magnolia Oreo", "Cremiges Dessert mit Oreo-Stückchen.", 5.9, "assets/menu/magnolia-oreo.webp"),
      item("baklava", "Baklava", "Blätterteig mit Nüssen und Sirup – klassisch süß.", 4.9, "assets/menu/baklava.webp"),
      item("havuc-baklava", "Havuç Baklava", "Spezialform mit Pistazien – besonders zart.", 4.9, "assets/menu/havuc-baklava.webp"),
      item("sekerpare", "Şekerpare", "Traditionelles Grießgebäck in süßem Sirup.", 6.9, "assets/menu/sekerpare.webp"),
    ]},
    { id: "getranke", label: "Getränke", items: [
      item("coca-cola-0-33l", "Coca-Cola 0,33l", "Klassisch erfrischend.", 2.5, "assets/menu/coca-cola-0-33l.webp"),
      item("coca-cola-0-5l", "Coca-Cola 0,5l", "Die größere Portion Erfrischung.", 2.8, "assets/menu/coca-cola-0-5l.webp"),
      item("ayran-0-25l", "Ayran 0,25l", "Erfrischendes Joghurtgetränk – leicht gesalzen.", 1.9, "assets/menu/ayran-0-25l.webp"),
      item("eistee-pfirsich-0-5l", "Eistee Pfirsich 0,5l", "Fruchtig und gekühlt.", 2.8, "assets/menu/eistee-pfirsich-0-5l.webp"),
      item("eistee-zitrone-0-33l", "Eistee Zitrone 0,33l", "Spritzig mit Zitronennote.", 2.5, "assets/menu/eistee-zitrone-0-33l.webp"),
      item("coca-cola-zero-0-33l", "Coca-Cola Zero 0,33l", "Voller Geschmack, ohne Zucker.", 2.5, "assets/menu/coca-cola-zero-0-33l.webp"),
      item("red-bull-250ml", "Red Bull 250ml", "Energy-Drink – belebt Geist und Körper.", 2.9, "assets/menu/red-bull-250ml.webp"),
      item("beypazari-soda", "Beypazarı Soda", "Natürliches Mineralwasser – prickelnd frisch.", 2.5, "assets/menu/beypazari-soda.jpg"),
      item("roemerquelle-0-2l", "Römerquelle 0,2l", "Österreichisches Mineralwasser.", 3.4, "assets/menu/roemerquelle-0-2l.jpg"),
      item("fritz-kola-0-33l", "Fritz-Kola 0,33l", "Kola mit viel Koffein.", 3.6, "assets/menu/fritz-kola-0-33l.jpg"),
      item("eistee-im-glas-0-33l", "Eistee im Glas 0,33l", "Hausgemacht & gekühlt im Glas serviert.", 3.6, "assets/menu/eistee-im-glas-0-33l.jpg"),
      item("soda-himbeer-0-33l", "Soda Himbeer 0,33l", "Prickelndes Soda mit fruchtigem Himbeersirup.", 3.5, "assets/menu/soda-himbeer-0-33l.jpg"),
      item("soda-zitrone-0-33l", "Soda Zitrone 0,33l", "Erfrischendes Soda mit Zitrone.", 3.5, "assets/menu/soda-zitrone-0-33l.jpg"),
      item("pago-0-25l", "Pago 0,25l", "Fruchtsaft in verschiedenen Sorten.", 2.5, null),
    ]},
    { id: "heissgetranke", label: "Heiße Getränke", items: [
      item("tuerkischer-kaffee", "Türkischer Kaffee", "Kräftig und aromatisch, traditionell zubereitet.", 3.5, "assets/menu/tuerkischer-kaffee.jpg"),
      item("melange", "Melange", "Wiener Klassiker mit geschäumter Milch.", 4.4, "assets/menu/melange.jpg"),
      item("cappuccino", "Cappuccino", "Espresso mit feinem Milchschaum.", 4.4, "assets/menu/cappuccino.jpg"),
      item("espresso-einfach", "Espresso einfach", "Kleiner, kräftiger Espresso.", 3.9, "assets/menu/espresso-einfach.jpg"),
      item("espresso-doppelt", "Espresso doppelt", "Doppelter Espresso für extra Energie.", 4.9, "assets/menu/espresso-doppelt.jpg"),
      item("latte-macchiato", "Latte Macchiato", "Geschichteter Milchkaffee, mild und cremig.", 5.9, null),
    ]},
  ],

  gallery: [
    { src: "assets/menu/beef-doener-sandwich.webp", alt: "Beef Döner Sandwich" },
    { src: "assets/menu/koefte-teller.webp", alt: "Köfte Teller mit Pommes und Salat" },
    { src: "assets/menu/pommes-frites.webp", alt: "Knusprige Pommes Frites" },
    { src: "assets/menu/chicken-doener-dueruem.webp", alt: "Chicken Döner Dürüm" },
    { src: "assets/menu/pizza-h11-mix.webp", alt: "Pizza H11 Mix" },
  ],
};

// ============================================================
// DIREKT-BESTELLUNG (Abholung) – Konfiguration
// ============================================================
window.H11_ORDERING = {
  // true  = Demo-Modus als Fallback erlaubt (solange restaurant_settings.demo_mode = true oder DB noch nicht migriert).
  // false = ausschließlich echte Stripe-Zahlung über die Server-Edge-Function create-checkout-session.
  DEMO_MODE: true,

  // Browser-sichere öffentliche Supabase-Konfiguration (Publishable Key).
  // WICHTIG: NIEMALS secret / service_role Keys oder Stripe-Secret-Keys im Frontend oder in Git speichern!
  SUPABASE_URL: "https://frjjmhkkchmwfgwolqcd.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_wIXC1hHSUmKEndPRh-EnIQ_-kmP4dve",

  supabase: {
    url: "https://frjjmhkkchmwfgwolqcd.supabase.co",
    publishableKey: "sb_publishable_wIXC1hHSUmKEndPRh-EnIQ_-kmP4dve",
    anonKey: "sb_publishable_wIXC1hHSUmKEndPRh-EnIQ_-kmP4dve",
  },

  // Echte Preise aus https://h11doner-pizza.at/digitalmenu
  pricesAreDemo: false,

  currency: "EUR",
  maxQtyPerLine: 20,
  localFirstOrderNumber: 142, // Lokaler Fallback: erste Bestellnummer = H11-142
};

// ------------------------------------------------------------
// Katalog (aus der Speisekarte oben abgeleitet; wird bei aktiver Supabase-Verbindung
// zusätzlich live aus categories & menu_items synchronisiert).
// ------------------------------------------------------------
(function () {
  const categories = [],
    items = [],
    byId = {},
    byName = {};
  window.H11.menu.forEach((c, ci) => {
    categories.push({ id: c.id, name: c.label, slug: c.id, sort_order: ci });
    c.items.forEach((it, ii) => {
      it.category = c.id;
      it.price_cents = it.price != null ? Math.round(Number(it.price) * 100) : null;
      it.displayPrice = it.displayPrice || null;
      it.active = it.price != null && it.price > 0;
      it.sold_out = false;
      it.sort_order = ii;
      it.price_is_demo = false;
      it.groups = [];
      items.push(it);
      byId[it.id] = it;
      byName[it.name] = it;
    });
  });
  window.H11.catalog = { categories, items, byId, byName };
})();
