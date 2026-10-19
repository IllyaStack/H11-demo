# H11 Neubau – Website mit Direkt-Bestellung (Abholung)

Online bestellen → online bezahlen → Küche sieht die Bestellung → Kunde holt ab.
Nur Abholung. Keine Lieferung, keine Kundenkonten, keine Kassen-/POS-Anbindung.

Statisches Frontend (GitHub-Pages-tauglich, kein Build-Schritt) + Supabase (Datenbank, Realtime, Auth, Edge Functions) + Stripe Checkout.

| Datei | Zweck |
|---|---|
| `index.html`, `app.js`, `styles.css` | öffentliche Website (Menü, Favorites, Galerie, Standort) |
| `config.js` | **zentrale Konfiguration**: Adresse, Öffnungszeiten, Bestell-Links, Speisekarte, Demo-Preise, `H11_ORDERING` (Demo-Modus, Supabase) |
| `js/shop.js`, `js/cart.js` | Produkt-Sheet, Warenkorb, Checkout, Demo-Zahlung |
| `order.html`, `js/order.js` | Kunden-Bestellstatus (`order.html?t=<geheimer Token>`) |
| `kitchen.html`, `js/kitchen.js` | Küchen-Dashboard (Bestellungen, Verlauf, Ausverkauft, Pause-Schalter) |
| `js/api.js` | Datenschicht: `local` (Demo ohne Server) **oder** `supabase` |
| `supabase/migrations/001_init.sql` | Tabellen, Funktionen, RLS, Realtime |
| `supabase/generate-seed.mjs` → `seed.sql` | Speisekarte aus `config.js` in die DB |
| `supabase/functions/create-checkout-session` | prüft/berechnet den Warenkorb, erstellt Stripe-Session |
| `supabase/functions/stripe-webhook` | **einzige** Stelle, die eine Bestellung auf „bezahlt“ setzt |

---

## Lokale Entwicklung

`file://` funktioniert nicht zuverlässig (Pfad enthält `#`). Besser einen kleinen Server starten:

```bash
npx serve .          # oder: python -m http.server 8000
```
Öffnen: `http://localhost:3000` (Kunde) und `http://localhost:3000/kitchen.html` (Küche).

## Demo-Modus

In `config.js` → `H11_ORDERING`:

```js
DEMO_MODE: true,                  // Demo-Zahlung, Hinweis „Demo-Modus – keine echte Zahlung“
supabase: { url: "", anonKey: "" } // leer = lokaler Demo-Speicher
```

**Variante A – ohne Server (sofort):** Kunden-Seite und `kitchen.html` in **zwei Tabs desselben Browsers** öffnen. Die Daten liegen in `localStorage`; Änderungen erscheinen live im anderen Tab. Zwei *verschiedene Geräte* (Handy + Laptop) sehen sich in dieser Variante **nicht**.

**Variante B – Handy + Laptop (empfohlen für die Präsentation):** Supabase einrichten (siehe unten), `url` + `anonKey` in `config.js` eintragen, `DEMO_MODE: true` lassen. Die Demo-Zahlung läuft dann über die Funktion `place_demo_order`, die Warenkorb/Preise **serverseitig** prüft und die Bestellung als bezahlte Demo-Bestellung speichert – ohne Stripe. Das Küchen-Tablet meldet sich einmal an.

Ablauf der Demo: Handy → Menü → Artikel (Sheet mit Optionen/Anmerkung) → Warenkorb → Name → „Sicher bezahlen“ → Demo-Zahlung bestätigen → Bestellnummer. Küche: Karte erscheint + Ton → „Zubereitung starten“ → Handy: „Wird zubereitet“ → „Fertig“ → Handy: „abholbereit“ → „Abgeholt“ → Verlauf.
Im Küchen-Dashboard gibt es im Demo-Modus zusätzlich den Button **+ Test-Bestellung**.

Demo-Zahlung testen: im Zahlungsfenster „Zahlung fehlschlagen lassen“ / „Abbrechen“.

## Supabase einrichten

1. Konto + neues Projekt auf <https://supabase.com> (Region EU).
2. **SQL Editor** → Inhalt von `supabase/migrations/001_init.sql` einfügen → *Run*.
3. Speisekarte erzeugen und einspielen:
   ```bash
   node supabase/generate-seed.mjs     # schreibt supabase/seed.sql aus config.js
   ```
   Inhalt von `supabase/seed.sql` im SQL Editor ausführen. (Nach Preis-/Menüänderungen in `config.js` erneut ausführen – `sold_out` bleibt erhalten.)
4. *Project Settings → API*: `Project URL` und `anon public` Key in `config.js` → `H11_ORDERING.supabase` eintragen. **Niemals** den `service_role` Key eintragen.
5. *Authentication → Providers → Email*: **„Allow new users to sign up“ ausschalten** (nur das Personal wird manuell angelegt).

## Personal-Konto (Küche) anlegen

1. *Authentication → Users → Add user* → E-Mail + Passwort, „Auto Confirm User“ anhaken.
2. Die User-ID (UUID) kopieren und im SQL Editor freischalten:
   ```sql
   insert into staff_users (user_id) values ('DIE-USER-UUID');
   ```
Nur Konten in `staff_users` dürfen Bestellungen lesen/ändern, Einstellungen ändern und Artikel auf „ausverkauft“ setzen (per Row Level Security, nicht nur im UI).

## Küchen-Dashboard

`https://…/kitchen.html` (nicht in der Navigation verlinkt, `noindex`). Anmelden → Spalten **Neu / In Zubereitung / Abholbereit**; Aktionen: *Zubereitung starten → Fertig → Abgeholt*; **Stornieren** braucht einen zweiten Tipp („Wirklich stornieren?“).
Oben: großer Schalter **ONLINE-BESTELLUNGEN OFFEN/PAUSIERT**, Verbindungsanzeige (`● Live`), **Ton aktivieren** (ein Zweiklang pro neuer Bestellung; Browser verlangen einen Klick, die Einstellung wird gemerkt). Tabs: **Verlauf** (Filter Abgeholt/Storniert) und **Verfügbarkeit** (Verfügbar/Ausverkauft pro Gericht – wirkt sofort auf der Website).
Verbindungsabbruch: Anzeige „Verbindung wird wiederhergestellt“, danach lädt die Liste automatisch neu; Daten gehen nicht verloren.

## Stripe (Testmodus)

1. Konto auf <https://stripe.com>, Dashboard im **Testmodus**.
2. *Developers → API keys*: `sk_test_…` kopieren.
3. Supabase CLI installieren, einloggen und verknüpfen:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref DEIN-PROJECT-REF
   ```
4. Secrets setzen (siehe `.env.example`, Datei als `supabase/.env` anlegen – ist in `.gitignore`):
   ```bash
   supabase secrets set --env-file supabase/.env
   ```
5. Functions deployen:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

### Webhook

Stripe → *Developers → Webhooks → Add endpoint*
URL: `https://DEIN-PROJECT-REF.supabase.co/functions/v1/stripe-webhook`
Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
Den *Signing secret* (`whsec_…`) als `STRIPE_WEBHOOK_SECRET` setzen (Schritt 4 wiederholen). Lokal testen: `stripe listen --forward-to …/functions/v1/stripe-webhook`.

Sicherheitsmodell: Eine Bestellung wird **nur** durch den signierten Webhook „bezahlt“ (Rückkehr auf die Erfolgsseite zählt nicht; sie zeigt „Zahlung wird bestätigt …“, bis der Webhook durch ist). Jede Stripe-Event-ID wird nur einmal verarbeitet (`stripe_events`), der Betrag wird gegen die Datenbank-Summe geprüft. Der Browser sendet nur Artikel-IDs, Optionen und Mengen – Preise berechnet ausschließlich die DB-Funktion `create_order_from_cart`.

## Kompletten Testlauf durchführen

1. Supabase + Stripe wie oben, `DEMO_MODE: false`, in der DB `update restaurant_settings set demo_mode = false;`.
2. Website öffnen, bestellen, bei Stripe mit Testkarte `4242 4242 4242 4242` (beliebiges Datum/CVC) zahlen.
3. Küche zeigt die Bestellung erst nach dem Webhook; Kundenseite wechselt auf den Status.
4. Weitere Tests: Pause-Schalter, Ausverkauft, Zahlung abbrechen (`?payment=cancelled`), Karte `4000 0000 0000 0002` (abgelehnt).

## Von Demo auf echte Bestellungen umstellen

1. `config.js`: `DEMO_MODE: false`, `pricesAreDemo: false` (erst nach bestätigten Preisen).
2. DB: `update restaurant_settings set demo_mode = false;` → `place_demo_order` wird serverseitig gesperrt (Fehler „demo_disabled“).
3. Echte Preise/Menü/Optionen: Demo-Preise in `config.js` (`DEMO_PRICES`) ersetzen, Demo-Optionen (`optionGroups`) ersetzen oder leeren, `node supabase/generate-seed.mjs`, `seed.sql` erneut ausführen.
4. Alte Demo-Bestellungen löschen: `delete from orders where is_demo;`.

## Stripe von Test auf Live

1. Stripe-Konto vollständig aktivieren (Geschäftsdaten, Bankkonto).
2. Im **Live-Modus** neuen Webhook-Endpoint (gleiche URL/Events) anlegen.
3. `STRIPE_SECRET_KEY=sk_live_…` und neues `STRIPE_WEBHOOK_SECRET` setzen: `supabase secrets set …`; Functions müssen nicht neu deployt werden.
4. Mit einer echten Kleinstbestellung testen und ggf. in Stripe erstatten.

## GitHub Pages

1. Repository auf GitHub, Dateien pushen (`.env`/`supabase/.env` sind ausgeschlossen).
2. *Settings → Pages → Deploy from a branch → `main` / root*.
3. `SITE_URL` (Secret) = `https://NAME.github.io/REPO` setzen, damit Stripe zurück auf `order.html` bzw. `index.html` leitet. Optional `SITE_ORIGIN` für CORS.
4. Der Anon-Key im Frontend ist öffentlich vorgesehen; Schutz erfolgt über RLS.

## Wichtige Hinweise

- **Preise** in `config.js` sind **vorläufige Demo-Preise** (`pricesAreDemo`) und im UI mit `*` bzw. „Demo-Preis“ markiert. Optionen („Ohne Zwiebeln“, „Extra Fleisch“, „Extra Käse“) sind **Demo-Beispiele**, keine bestätigten H11-Optionen.
- Die Fotos in `assets/` sind KI-generierte Platzhalter.
- Kundenstatus-Seite: anonyme Kunden fragen den Status per Token alle ~3 s über eine sichere Funktion ab (kein Realtime-Zugriff auf die geschützte Bestelltabelle). Die Küche nutzt echtes Realtime.
- Kein Ersatz für Kasse/Buchhaltung/Fiskalisierung; keine POS-Anbindung (Phase 1). Die DB ist so aufgebaut (Snapshots in `order_items`, `public_order_number`), dass sie später angebunden werden kann.
- Öffnungszeiten bleiben Platzhalter; vorerst gilt allein der Schalter OFFEN/PAUSIERT (später automatisierbar über `restaurant_settings`).
- Datenschutz: nur Name ist Pflicht, Telefon/E-Mail freiwillig, kein Marketing-Opt-in. Impressum/Datenschutz sind noch Platzhalter.

## Checkliste vor echten Zahlungen

- [ ] Finale Speisekarte, **finale Preise**, finale Extras/Optionen
- [ ] Bestätigte Öffnungszeiten
- [ ] Stripe-Konto des Restaurants aktiv (Live-Keys)
- [ ] Korrekte Geschäftsdaten, **Impressum & Datenschutzerklärung** (inkl. Stripe/Supabase), AGB/Widerruf nach Rücksprache
- [ ] Personal-Login getestet, öffentliche Registrierung deaktiviert
- [ ] Zahlungstest (Erfolg, Abbruch, abgelehnte Karte)
- [ ] Webhook-Test (Bestellung erscheint erst nach Webhook, Doppel-Events erzeugen nichts Doppeltes)
- [ ] Kompletter Bestellablauf Handy → Küche → Abholung
- [ ] Küchen-Tablet-Test (Ton, Touch, WLAN-Ausfall)
- [ ] Pause-Test (Bestellen gesperrt, Meldung sichtbar)
- [ ] Ausverkauft-Test (Artikel gesperrt, auch bei offenem Warenkorb)
- [ ] `demo_mode = false` in der DB, `DEMO_MODE: false` im Frontend
