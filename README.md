# H11 Neubau – Direkt-Bestellsystem (Abholung / Pickup)

Statisches Frontend (GitHub Pages kompatibel) verbunden mit **Supabase** (Datenbank, Auth, Realtime, Edge Functions) und **Stripe Checkout**.

---

## 1. Aktuelle Frontend-Konfiguration (`config.js`)

Das Frontend ist mit dem Supabase-Projekt verbunden über **einen gemeinsamen Browser-Client** (`window.H11Supabase` / `window.H11Api.client()` in [`js/api.js`](js/api.js)):

- **`SUPABASE_URL`**: `https://frjjmhkkchmwfgwolqcd.supabase.co`
- **`SUPABASE_PUBLISHABLE_KEY`**: `sb_publishable_wIXC1hHSUmKEndPRh-EnIQ_-kmP4dve`

> **Sicherheitshinweis:** Im Frontend (`config.js`, HTML, JS) wird ausschließlich der browser-sichere `sb_publishable_...` Key verwendet. `service_role`- oder `sb_secret_...`-Schlüssel dürfen **niemals** in Frontend-Dateien oder in Git gespeichert werden. Solange die Supabase-Tabellen noch nicht migriert sind oder offline sind, greift automatisch der **Demo-Modus-Fallback**.

---

## 2. Welche Migrationen ausgeführt werden müssen

Öffne das [Supabase Dashboard](https://supabase.com/dashboard/project/frjjmhkkchmwfgwolqcd/sql/new) → **SQL Editor** → **New query** und führe die folgenden **3 SQL-Dateien nacheinander** aus:

1. **`supabase/migrations/001_init.sql`**
   Erstellt alle Basistabellen, Datenbank-Funktionen (`is_staff`, `next_order_number`, `create_order_from_cart`, `place_demo_order`, `get_order_by_token`), Trigger, Row Level Security (RLS) und die Realtime-Publication.
2. **`supabase/migrations/002_production_rls_and_realtime.sql`**
   Erweitert die Tabellen additiv für den Produktionsbetrieb (`price_cents`, `source_ref`, `opening_hours`, Format `H11-101`), härtet RLS (`FORCE ROW LEVEL SECURITY`, `REVOKE ALL ON orders FROM anon`), setzt `REPLICA IDENTITY FULL` für Realtime und fügt die Server-RPC `import_menu` hinzu.
3. **`supabase/seed.sql`**
   Befüllt `categories` (12 Kategorien), `menu_items` (61 Gerichte der H11-Speisekarte inkl. Preisen und Bildern in `assets/menu/`) sowie die Zeile `id = 1` in `restaurant_settings`.
   *(Hinweis: `seed.sql` arbeitet mit `ON CONFLICT DO UPDATE` und überschreibt niemals `sold_out` oder bestehende Schalter in `restaurant_settings`.)*

Alternativ über die Supabase CLI:
```bash
npx supabase link --project-ref frjjmhkkchmwfgwolqcd
npx supabase db query -f supabase/migrations/001_init.sql
npx supabase db query -f supabase/migrations/002_production_rls_and_realtime.sql
npx supabase db query -f supabase/seed.sql
```

---

## 3. Welche Tabellen in Supabase existieren müssen

Nach dem Ausführen der Migrationen existieren im Schema `public` diese **10 Tabellen**:

| Tabelle | Zweck | Zugriff (RLS & Grants) |
|---|---|---|
| `public.categories` | Menü-Kategorien (`id`, `name`, `slug`, `sort_order`, `active`) | Öffentlich lesbar (`SELECT`), Schreibzugriff nur Personal (`is_staff()`) |
| `public.menu_items` | Speisen & Getränke (`id`, `category_id`, `name`, `description`, `price`, `price_cents`, `image_url`, `active`, `sold_out`) | Öffentlich lesbar (`SELECT`), Schreibzugriff nur Personal (`is_staff()`) |
| `public.menu_option_groups` | Optionale Auswahl-Gruppen pro Gericht | Öffentlich lesbar (`SELECT`), Schreibzugriff nur Personal |
| `public.menu_options` | Einzelne Auswahl-Optionen mit Aufpreis (`price_delta`) | Öffentlich lesbar (`SELECT`), Schreibzugriff nur Personal |
| `public.restaurant_settings` | Öffentliche Einstellungen (`id = 1`: `ordering_enabled`, `pickup_enabled`, `demo_mode`, `pickup_message`, `restaurant_name`, `address`, `opening_hours`) | Öffentlich lesbar (`SELECT`), `UPDATE` nur Personal (`is_staff()`) |
| `public.staff_users` | Freigeschaltete Küchen-Benutzer (`user_id` → `auth.users.id`) | Nur eigener Eintrag lesbar (`user_id = auth.uid()`), Prüfung über `public.is_staff()` |
| `public.order_counters` | Täglicher Zähler für Bestellnummern (`H11-101`, `H11-102`, …) | Kein Client-Zugriff (nur `service_role` / `SECURITY DEFINER`) |
| `public.orders` | Bestellungen (`id`, `public_order_number`, `tracking_token`, `payment_status`, `order_status`, `total`, …) | **Kein anonymer Zugriff!** `SELECT` & `UPDATE` nur für authentifiziertes Personal (`is_staff()`). Kein direktes Client-`INSERT`. |
| `public.order_items` | Bestellpositionen (`order_id`, `menu_item_id`, `name`, `unit_price`, `quantity`, `selected_options`, `note`) | **Kein anonymer Zugriff!** `SELECT` nur für authentifiziertes Personal (`is_staff()`). |
| `public.stripe_events` | Verarbeitete Stripe-Webhook-Event-IDs (Idempotenz-Schutz) | Kein Client-Zugriff (nur `service_role`) |

Prüfabfrage im SQL Editor:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

---

## 4. Küchen-Personal-Account (Kitchen Staff) anlegen

Das Küchen-Dashboard (`kitchen.html`) nutzt **Supabase Auth** (`signInWithPassword`) und prüft anschließend per RPC `public.is_staff()`, ob die `user_id` in `public.staff_users` eingetragen ist.

### Schritt 1: Benutzer in Supabase Auth erstellen
1. Öffne im Supabase Dashboard: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Vergib E-Mail-Adresse (z. B. `kueche@h11neubau.at`) und ein sicheres Passwort.
3. Aktiviere **Auto Confirm User** und klicke auf **Create user**.

### Schritt 2: Benutzer als Küchen-Personal freischalten
Führe im **SQL Editor** folgenden Befehl mit der E-Mail-Adresse des eben angelegten Benutzers aus:

```sql
insert into public.staff_users (user_id, email)
select id, email
from auth.users
where email = 'kueche@h11neubau.at'
on conflict (user_id) do update set email = excluded.email;
```

Danach kannst du dich unter `kitchen.html` mit dieser E-Mail und dem Passwort anmelden.

---

## 5. Datenbankverbindung & RLS testen

### A) Im Browser testen (`index.html`)
1. Öffne die Website und die Browser-Entwicklerkonsole (`F12` → **Console**).
2. Führe aus:
   ```js
   await window.H11Api.ready()
   ```
   Erwartete Rückgabe nach erfolgreicher Migration & Seed:
   ```json
   { "dbReady": true, "source": "supabase", "settings": { "id": 1, "restaurant_name": "H11 Neubau", ... } }
   ```
3. Prüfe den gemeinsamen Supabase-Client und die geladene Speisekarte:
   ```js
   console.log("Menu source:", window.H11.menuSource, "Items:", window.H11.catalog.items.length);
   ```
   (`window.H11.menuSource === "supabase"`, `61` Artikel in `12` Kategorien).

### B) Prüfen, dass anonyme Nutzer KEINE Bestellungen auflisten können (RLS-Test)
Führe in der Browser-Konsole auf `index.html` (als nicht eingeloggter Besucher) aus:
```js
const { data, error } = await window.H11Supabase.from("orders").select("*");
console.log({ data, error });
```
Erwartetes Ergebnis: `error` (`permission denied for table orders` / leeres Resultat) – anonyme Besucher können `public.orders` weder lesen noch direkt beschreiben.

---

## 6. Supabase Realtime prüfen

Realtime wird für 4 Ereignisse genutzt:
1. **Neue bezahlte Bestellungen** (`public.orders` → `kitchen.html` spielt Ton ab und zeigt die Bestellung in **Neu**)
2. **Küchen-Status-Updates** (`public.orders` + Broadcast `order:<tracking_token>` → `kitchen.html` & `order.html`)
3. **Ausverkauft-Status (`sold_out`)** (`public.menu_items` → `index.html` & `kitchen.html`)
4. **Bestellungen offen / pausiert (`ordering_enabled`)** (`public.restaurant_settings` → `index.html` & `kitchen.html`)

### SQL-Prüfung der Realtime-Publication
```sql
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```
Erwartet: `categories`, `menu_items`, `orders`, `restaurant_settings`.

### Live-Funktionstest in zwei Browser-Tabs
1. Öffne **Tab 1**: `index.html#speisekarte` (Kundenansicht).
2. Öffne **Tab 2**: `kitchen.html` und melde dich mit dem Küchen-Account an (oben erscheint `● Live`).
3. **Pause-Schalter testen:** Klicke in `kitchen.html` oben auf `ONLINE-BESTELLUNGEN OFFEN` → schaltet auf `PAUSIERT`. In **Tab 1** erscheint sofort ohne Neuladen das Banner *„Online-Bestellungen sind momentan pausiert.“* und der Bestell-Button wird gesperrt.
4. **Ausverkauft testen:** Wechsle in `kitchen.html` auf den Tab **Verfügbarkeit** und klicke bei einem Gericht auf `VERFÜGBAR` → `AUSVERKAUFT`. In **Tab 1** wird das Gericht sofort als *„Heute ausverkauft“* markiert.
5. **Bestellung & Status testen:** Löse eine Test-Bestellung aus → sie erscheint sofort mit Ton-Signal in `kitchen.html` unter **Neu**. Klicke auf `Zubereitung starten` → `Fertig` → `Abgeholt` und beobachte die Live-Aktualisierung auf `order.html`.

---

## 7. Edge Functions deployen (`create-checkout-session` & `stripe-webhook`)

Bezahlte Echtbestellungen laufen ausschließlich über die serverseitige Edge Function **`create-checkout-session`** (erstellt eine `pending`-Bestellung über `service_role` und startet Stripe Checkout) sowie **`stripe-webhook`** (verifiziert die Stripe-Signatur und setzt `payment_status = 'paid'`).

### Schritt 1: Supabase CLI verknüpfen
```bash
npx supabase login
npx supabase link --project-ref frjjmhkkchmwfgwolqcd
```

### Schritt 2: Server-Secrets in Supabase hinterlegen
*(Niemals in `config.js` oder Git eintragen!)*
```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_DEIN_STRIPE_SECRET_KEY \
  STRIPE_WEBHOOK_SECRET=whsec_DEIN_STRIPE_WEBHOOK_SECRET \
  SITE_URL=https://illyastack.github.io/H11-demo \
  SITE_ORIGIN=https://illyastack.github.io \
  --project-ref frjjmhkkchmwfgwolqcd
```
*(Hinweis: `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase in Edge Functions automatisch bereit.)*

### Schritt 3: Beide Edge Functions deployen
Da das Frontend den neuen `sb_publishable_...`-Key nutzt und Stripe keinen Supabase-JWT-Header sendet, werden beide Functions mit `--no-verify-jwt` deployed (bereits in [`supabase/config.toml`](supabase/config.toml) hinterlegt):

```bash
npx supabase functions deploy create-checkout-session --project-ref frjjmhkkchmwfgwolqcd --no-verify-jwt
npx supabase functions deploy stripe-webhook --project-ref frjjmhkkchmwfgwolqcd --no-verify-jwt
```

### Schritt 4: Stripe-Webhook einrichten
Lege im [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) einen Endpoint auf folgende URL an:
```text
https://frjjmhkkchmwfgwolqcd.supabase.co/functions/v1/stripe-webhook
```
Ausgewählte Events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

### Schritt 5: Demo-Modus für den Echtbetrieb deaktivieren
Sobald Stripe getestet ist, schalte den Demo-Modus in der Datenbank und in `config.js` aus:
```sql
update public.restaurant_settings
set demo_mode = false
where id = 1;
```
Und setze in [`config.js`](config.js) `DEMO_MODE: false`.
