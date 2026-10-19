// Erzeugt supabase/seed.sql aus der Speisekarte in config.js (einzige Quelle der Wahrheit für Inhalte).
// Ausführen:  node supabase/generate-seed.mjs
// Bei Re-Run werden Name/Beschreibung/Preis/Bild aktualisiert – "sold_out" und "active" bleiben unverändert.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} }; ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, "config.js"), "utf8"), ctx);
const { catalog } = ctx.window.H11;
const O = ctx.window.H11_ORDERING;

const q = (v) => (v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const out = ["-- GENERIERT von supabase/generate-seed.mjs – nicht von Hand bearbeiten.", "begin;"];

catalog.categories.forEach((c) => out.push(
  `insert into categories (id,name,slug,sort_order) values (${q(c.id)},${q(c.name)},${q(c.slug)},${c.sort_order}) on conflict (id) do update set name=excluded.name, sort_order=excluded.sort_order;`));

catalog.items.forEach((i) => {
  out.push(`insert into menu_items (id,category_id,name,description,price,price_is_demo,image_url,sort_order) values (${q(i.id)},${q(i.category)},${q(i.name)},${q(i.desc)},${i.price.toFixed(2)},${O.pricesAreDemo},${q(i.image)},${i.sort_order}) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, price_is_demo=excluded.price_is_demo, image_url=excluded.image_url, sort_order=excluded.sort_order;`);
  i.groups.forEach((g) => {
    out.push(`insert into menu_option_groups (id,menu_item_id,name,required,min_choices,max_choices,sort_order) values (${q(g.id)},${q(i.id)},${q(g.name)},${g.required},${g.min},${g.max},${g.sort_order}) on conflict (id) do update set name=excluded.name, required=excluded.required, min_choices=excluded.min_choices, max_choices=excluded.max_choices;`);
    g.options.forEach((o) => out.push(
      `insert into menu_options (id,option_group_id,name,price_delta,sort_order) values (${q(o.id)},${q(g.id)},${q(o.name)},${o.delta.toFixed(2)},${o.sort_order}) on conflict (id) do update set name=excluded.name, price_delta=excluded.price_delta;`));
  });
});
out.push(`update restaurant_settings set demo_mode=${!!O.DEMO_MODE} where id=1;`, "commit;");
writeFileSync(join(root, "supabase", "seed.sql"), out.join("\n") + "\n");
console.log(`seed.sql: ${catalog.categories.length} Kategorien, ${catalog.items.length} Artikel`);
