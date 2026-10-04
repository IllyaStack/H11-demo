// ============================================================
// H11 NEUBAU – zentrale Konfiguration
// Alle restaurant-spezifischen Daten werden NUR hier gepflegt.
// ============================================================
window.H11 = {
  name: "H11 Neubau",
  address: { street: "Neubaugasse 9", zip: "1070", city: "Wien" },

  // Externe Bestell-Links (öffnen in neuem Tab).
  // TODO: Durch die restaurant-spezifischen H11-Neubau-URLs ersetzen – aktuell nur Plattform-Startseiten.
  orderLinks: {
    wolt: "https://wolt.com/",
    lieferando: "https://www.lieferando.at/",
    foodora: "https://www.foodora.at/",
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

  // Favorites: price = null → "Preis folgt"
  favorites: [
    { name: "Beef Döner", desc: "Saftiges Rindfleisch, knackiger Salat, hausgemachte Saucen im frischen Brot.", img: "assets/hero.jpg", price: null },
    { name: "Chicken Dürüm", desc: "Gegrilltes Hühnerfleisch, frisches Gemüse, im knusprig gegrillten Fladen.", img: "assets/dueruem.jpg", price: null },
    { name: "Köfte Teller", desc: "Gegrillte Köfte mit Reis, Salat und Grillgemüse.", img: "assets/koefte.jpg", price: null },
    { name: "Pizza", desc: "Heiß aus dem Ofen, mit viel Käse und knusprigem Rand.", img: "assets/pizza.jpg", price: null },
  ],

  // Speisekarte – DEMO-INHALT, bitte durch finale Karte ersetzen.
  // price: Zahl (z. B. 7.9) oder null → "Preis folgt"
  menu: [
    { id: "doener", label: "Döner", items: [
      { name: "Beef Döner", desc: "Rindfleisch, Salat, Zwiebel, Sauce", price: null },
      { name: "Chicken Döner", desc: "Hühnerfleisch, Salat, Tomaten, Sauce", price: null },
      { name: "Döner Teller", desc: "Fleisch, Reis oder Pommes, Salat", price: null },
    ]},
    { id: "grill", label: "Grill", items: [
      { name: "Köfte Teller", desc: "Gegrillte Köfte, Beilage, Salat", price: null },
      { name: "Grillspieß", desc: "Vom Grill, mit Beilage", price: null },
    ]},
    { id: "pizza", label: "Pizza", items: [
      { name: "Pizza Margherita", desc: "Tomatensauce, Käse", price: null },
      { name: "Pizza Salami", desc: "Tomatensauce, Käse, Salami", price: null },
    ]},
    { id: "wraps", label: "Wraps", items: [
      { name: "Chicken Dürüm", desc: "Hühnerfleisch, Gemüse, Sauce", price: null },
      { name: "Beef Dürüm", desc: "Rindfleisch, Gemüse, Sauce", price: null },
    ]},
    { id: "bowls", label: "Bowls", items: [
      { name: "Chicken Bowl", desc: "Reis, Hühnerfleisch, Salat", price: null },
      { name: "Beef Bowl", desc: "Reis, Rindfleisch, Salat", price: null },
    ]},
    { id: "beilagen", label: "Beilagen", items: [
      { name: "Pommes", desc: "Knusprig frittiert", price: null },
      { name: "Reis", desc: "Als Beilage", price: null },
    ]},
    { id: "desserts", label: "Desserts", items: [
      { name: "Baklava", desc: "Demo-Eintrag", price: null },
      { name: "Dessert des Tages", desc: "Demo-Eintrag", price: null },
    ]},
    { id: "drinks", label: "Drinks", items: [
      { name: "Softdrinks", desc: "Auswahl folgt", price: null },
      { name: "Ayran", desc: "Demo-Eintrag", price: null },
    ]},
  ],

  gallery: [
    { src: "assets/hero.jpg", alt: "Frischer Döner mit Dampf" },
    { src: "assets/koefte.jpg", alt: "Köfte Teller mit Reis und Salat" },
    { src: "assets/fries.jpg", alt: "Knusprige Pommes mit Dips" },
    { src: "assets/dueruem.jpg", alt: "Chicken Dürüm aufgeschnitten" },
    { src: "assets/pizza.jpg", alt: "Heiße Pizza mit Käse" },
  ],
};
