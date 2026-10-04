// ============================================================
// H11 NEUBAU – zentrale Konfiguration
// Alle restaurant-spezifischen Daten werden NUR hier gepflegt.
// ============================================================

// Hilfsfunktion für Menüeinträge. price: Zahl (z. B. 7.9) oder null → "Preis folgt"
const item = (name, desc, price = null) => ({ name, desc, price });

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

  // Favorites: price = null → "Preis folgt"
  favorites: [
    { name: "Chicken Döner Dürüm", desc: "Gegrilltes Hühner-Dönerfleisch, frischer Salat und Tomaten im Dürüm.", img: "assets/dueruem.jpg", price: null },
    { name: "Beef Döner Sandwich", desc: "Rind-Dönerfleisch mit Salat und Zwiebeln im knusprigen Brot.", img: "assets/hero.jpg", price: null },
    { name: "Köfte Teller", desc: "Gegrillte Köfte mit Salat, Pommes und Pita-Brot.", img: "assets/koefte.jpg", price: null },
    { name: "Pizza H11 Mix", desc: "Schinken, Salami, Paprika, Oliven, Mais und Mozzarella.", img: "assets/pizza.jpg", price: null },
  ],

  // Speisekarte – aktuelle Auswahl (vorläufig, Quelle: öffentliche Foodora-Listung).
  // Finale Karte, Preise und Zutaten bestätigt der Inhaber.
  menu: [
    { id: "menues", label: "Menüs", items: [
      item("Rind Kebab Menü", "Rind-Döner im knusprigen Brot mit Salat, Tomaten, Zwiebeln und cremiger Sauce. Dazu Pommes und ein 0,33-l-Getränk nach Wahl."),
      item("Hühner Sandwich Menü", "Hühner-Döner-Sandwich mit frischem Salat und Sauce, kombiniert mit Pommes und einem 0,33-l-Getränk nach Wahl."),
    ]},
    { id: "wraps", label: "Wraps", items: [
      item("Chicken Döner Dürüm", "Gegrilltes Hühner-Dönerfleisch mit frischem Salat und Tomaten, eingerollt im Dürüm-Fladenbrot."),
      item("Falafel Dürüm", "Knusprige Falafel mit Hummus und frischem Salat im Dürüm-Fladenbrot."),
      item("Beef Döner Dürüm", "Gegrilltes Rind-Dönerfleisch mit frischem Salat und Tomaten im Dürüm."),
      item("Köfte Dürüm", "Gegrillte Köfte mit frischem Salat und Tomaten im weichen Dürüm-Fladenbrot."),
    ]},
    { id: "sandwiches", label: "Sandwiches", items: [
      item("Beef Döner Sandwich", "Gegrilltes Rind-Dönerfleisch mit frischem Salat und Zwiebeln im Brot."),
      item("Chicken Döner Sandwich", "Hühner-Dönerfleisch mit Salat und frischen Tomaten im Sandwich."),
      item("Köfte Sandwich", "Gegrillte Köfte mit frischem Salat und Zwiebeln im Brot."),
      item("Falafel Sandwich", "Knusprige Falafel mit Hummus und frischem Salat im Sandwich."),
    ]},
    { id: "lahmacun", label: "Lahmacun", items: [
      item("Lahmacun Portion", "Knuspriger Teig mit würzigem Rindfleisch, Tomaten, Paprika und frischen Kräutern."),
      item("Lahmacun 1 Stk.", "Ein Stück klassisch knuspriger Lahmacun."),
    ]},
    { id: "pizza", label: "Pizza", items: [
      item("Pizza Margherita", "Tomatensauce, Mozzarella und frisches Basilikum."),
      item("Pizza Funghi", "Tomatensauce, Mozzarella und frische Champignons."),
      item("Pizza al Tonno", "Thunfisch, Zwiebeln, Tomatensauce und Mozzarella."),
      item("Pizza Salami", "Salami, Tomatensauce und Mozzarella."),
      item("Pizza Cardinale", "Schinken, Tomatensauce und Mozzarella."),
      item("Pizza H11 Mix", "Schinken, Salami, Paprika, Oliven und Mais auf Tomatensauce mit Mozzarella."),
      item("Pizza Quattro Formaggi", "Mozzarella, Parmesan, Gorgonzola und Emmentaler."),
      item("Pizza Vegetarisch", "Paprika, Zucchini, Champignons und Oliven auf Tomatensauce mit Mozzarella."),
      item("Beef Döner Pizza", "Rind-Dönerfleisch mit Zwiebeln, Paprika und Mozzarella."),
      item("Chicken Döner Pizza", "Hühner-Dönerfleisch mit Tomaten, Zwiebeln, Paprika und Mozzarella."),
    ]},
    { id: "grillteller", label: "Grillteller", items: [
      item("Köfte Teller", "Gegrillte Köfte mit frischem Salat, Pommes und gegrilltem Pita-Brot."),
      item("Chicken Döner Teller", "Gegrilltes Hühner-Dönerfleisch mit Salat, Basmatireis und gegrilltem Pita-Brot."),
      item("Beef Döner Teller", "Gegrilltes Rind-Dönerfleisch mit Salat, Basmatireis und gegrilltem Pita-Brot."),
    ]},
    { id: "boxbowl", label: "Box & Bowl", items: [
      item("Beef Box", "Rind-Dönerfleisch mit frischem Salat und Gemüse, dazu Pommes oder Reis und Sauce nach Wahl."),
      item("Beef Bowl", "Rind-Dönerfleisch mit Salat und Gemüse, kombiniert mit Pommes oder Reis und Sauce nach Wahl."),
      item("Chicken Box", "Hühner-Dönerfleisch mit frischem Salat und Gemüse, dazu Pommes oder Reis und Sauce nach Wahl."),
      item("Chicken Bowl", "Dönerfleisch mit frischem Salat und Gemüse, dazu Pommes oder Reis und Sauce nach Wahl."),
      item("Falafel Box", "Knusprige Falafel mit Salat und Gemüse, dazu Pommes oder Reis und Sauce nach Wahl."),
      item("Falafel Bowl", "Knusprige Falafel mit frischem Salat und Gemüse, dazu Reis und Sauce nach Wahl."),
      item("Köfte Box", "Gegrillte Köfte mit Salat und Gemüse, dazu Pommes oder Reis und Sauce nach Wahl."),
      item("Köfte Bowl", "Gegrillte Köfte mit Salat und Gemüse, dazu Reis und Sauce nach Wahl."),
    ]},
    { id: "salate", label: "Salate", items: [
      item("Halloumi-Käse-Salat", "Saisonaler gemischter Salat mit gegrilltem Halloumi und Olivenöl."),
      item("Hähnchen-Streifen-Salat", "Gemischter saisonaler Salat mit Hähnchenstreifen, knusprigem Sesambrot und Olivenöl."),
      item("Köfte-Streifen-Salat", "Saisonaler gemischter Salat mit gegrillten Rind-Köfte-Streifen, Sesambrot und Olivenöl."),
      item("Feta-Käse-Salat", "Gemischter saisonaler Salat mit gebackenem Feta, Sesambrot und Olivenöl."),
    ]},
    { id: "beilagen", label: "Beilagen", items: [
      item("Pommes Frites", "Knusprig gebackene Pommes Frites."),
    ]},
    { id: "desserts", label: "Desserts", items: [
      item("Magnolia Schoko", "Cremiger Magnolia-Pudding mit Schokolade und frischen Früchten."),
      item("Magnolia Lotus", "Cremiger Magnolia-Pudding mit Lotus-Keks und frischen Früchten."),
      item("Magnolia Oreo", "Cremiger Magnolia-Pudding mit Oreo und frischen Früchten."),
      item("Baklava", "Knuspriges türkisches Gebäck mit Pistazienfüllung."),
      item("Havuç Baklava", "Karottenförmige Baklava mit Pistazienfüllung."),
      item("Milchreis", "Cremiger, leicht gesüßter Milchreis."),
    ]},
    { id: "drinks", label: "Getränke", items: [
      item("Coca-Cola 0,33 l", "Klassische Coca-Cola in der 0,33-l-Dose."),
      item("Coca-Cola 0,5 l", "Klassische Coca-Cola in der 0,5-l-PET-Flasche."),
      item("Coca-Cola Zero Zucker 0,33 l", "Zuckerfreie Coca-Cola in der 0,33-l-Dose."),
      item("Ayran 0,25 l", "Erfrischendes, cremiges Joghurtgetränk."),
      item("Eistee Pfirsich 0,5 l", "Erfrischender Eistee mit Pfirsichgeschmack."),
      item("Eistee Pfirsich 0,33 l", "Eistee mit fruchtigem Pfirsichgeschmack."),
      item("Eistee Zitrone 0,33 l", "Erfrischender Eistee mit Zitronengeschmack."),
      item("Red Bull Energy Drink 250 ml", "Energy Drink mit Koffein und Taurin."),
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
