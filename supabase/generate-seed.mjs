// Erzeugt supabase/seed.sql aus data/h11-menu.json (offizielle H11-Speisekarte).
// Ausführen:  node supabase/generate-seed.mjs
// Bei Re-Run werden Name/Beschreibung/Preis/Bild aktualisiert – "sold_out" und "restaurant_settings" bleiben erhalten.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const menu = JSON.parse(readFileSync(join(root, "data", "h11-menu.json"), "utf8"));

const q = (v) => (v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const out = [
  "-- GENERIERT von supabase/generate-seed.mjs aus data/h11-menu.json – nicht von Hand bearbeiten.",
  "-- Sicher mehrfach ausführbar (Upsert): sold_out-Status und Restaurant-Einstellungen werden NICHT überschrieben.",
  "begin;",
];

menu.categories.forEach((c) => {
  out.push(
    `insert into public.categories (id,name,slug,sort_order,active) values (${q(c.id)},${q(c.name)},${q(c.id)},${c.sort_order},true) on conflict (id) do update set name=excluded.name, slug=excluded.slug, sort_order=excluded.sort_order, active=true;`
  );
});

menu.items.forEach((i) => {
  const cents = i.price_cents != null ? Number(i.price_cents) : 0;
  const eur = (cents / 100).toFixed(2);
  const active = cents > 0;
  out.push(
    `insert into public.menu_items (id,category_id,name,description,price,price_cents,price_is_demo,image_url,image_source_url,source_ref,source_order,sort_order,active) values (${q(i.id)},${q(i.category_id)},${q(i.name)},${q(i.description)},${eur},${cents},false,${q(i.image_url)},${q(i.image_source_url)},${q(i.source_ref)},${i.source_order ?? 0},${i.sort_order ?? 0},${active}) on conflict (id) do update set category_id=excluded.category_id, name=excluded.name, description=excluded.description, price=excluded.price, price_cents=excluded.price_cents, price_is_demo=false, image_url=coalesce(excluded.image_url, public.menu_items.image_url), image_source_url=excluded.image_source_url, source_ref=excluded.source_ref, source_order=excluded.source_order, sort_order=excluded.sort_order, active=excluded.active;`
  );
});

out.push(
  "insert into public.restaurant_settings (id, restaurant_name, address, postal_code, city, ordering_enabled, pickup_enabled, demo_mode) values (1, 'H11 Neubau', 'Neubaugasse 9, 1070 Wien', '1070', 'Wien', true, true, true) on conflict (id) do nothing;",
  "commit;"
);

writeFileSync(join(root, "supabase", "seed.sql"), out.join("\n") + "\n");
console.log(`seed.sql: ${menu.categories.length} Kategorien, ${menu.items.length} Artikel`);
