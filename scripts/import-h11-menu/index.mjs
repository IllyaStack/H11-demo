#!/usr/bin/env node
// ============================================================================
// H11 Neubau – Menü-Import aus der digitalen Speisekarte des Restaurants
//   Quelle:  https://h11doner-pizza.at/digitalmenu   (nur zur Datenpflege, NIE zur Laufzeit!)
//   Ziel:    data/h11-menu.json  (+ assets/menu/*.webp)  →  optional Supabase (RPC import_menu)
//
// Aufrufe:
//   node scripts/import-h11-menu/index.mjs                 # laden, normalisieren, Bilder holen, JSON schreiben, Diff zeigen
//   node scripts/import-h11-menu/index.mjs --dry-run       # nur Diff anzeigen, keine Dateien schreiben
//   node scripts/import-h11-menu/index.mjs --apply         # zusätzlich in Supabase einspielen (benötigt Env-Variablen)
//   node scripts/import-h11-menu/index.mjs --apply --deactivate-unlisted   # Artikel, die nicht (mehr) in der Quelle sind, deaktivieren
//   node scripts/import-h11-menu/index.mjs --from-file page.html            # statt Netzwerk eine gespeicherte HTML-Datei lesen
//
// Env für --apply (NIE in Dateien/Git ablegen, nur in der Shell setzen):
//   SUPABASE_URL           https://<project-ref>.supabase.co
//   SUPABASE_SECRET_KEY    serverseitiger Secret-/service_role-Key
//
// Der Import überschreibt NIE: sold_out, Verfügbarkeits-Einstellungen oder Bestellungen.
// Es werden keine Preise, Zutaten, Extras oder Allergene erfunden: Die Quelle enthält nur Name, Beschreibung, Preis, Bild.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_URL = "https://h11doner-pizza.at/digitalmenu";
const OUT_JSON = path.join(ROOT, "data", "h11-menu.json");
const IMG_DIR = path.join(ROOT, "assets", "menu");
const args = new Set(process.argv.slice(2));
const fromFile = process.argv.includes("--from-file") ? process.argv[process.argv.indexOf("--from-file") + 1] : null;

const slug = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Deutsche Kategorienamen stehen im Quelltext im Sprachobjekt "de" (sec:{…}); Fallback = Schlüssel.
function extractObjectLiteral(html, startToken) {
  const s = html.indexOf(startToken);
  if (s < 0) throw new Error(`Marker nicht gefunden: ${startToken}`);
  const i = html.indexOf("{", s);
  let d = 0, j = i, inStr = null, esc = false;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") d++; else if (c === "}") { d--; if (!d) break; }
  }
  return html.slice(i, j + 1);
}
const evalLiteral = (lit) => vm.runInNewContext("(" + lit + ")", {}, { timeout: 2000 });

async function loadHtml() {
  if (fromFile) return fs.readFileSync(fromFile, "utf8");
  const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "H11-menu-import/1.0" } });
  if (!r.ok) throw new Error(`Quelle nicht erreichbar: HTTP ${r.status}`);
  return r.text();
}

function germanSectionLabels(html) {
  // erstes Vorkommen von sec:{suppen:"Suppen", …} mit deutschem Wortlaut
  const m = html.match(/sec:\s*\{\s*suppen:\s*\\?"Suppen\\?"[^}]*\}/);
  if (!m) return {};
  try { return evalLiteral(m[0].replace(/^sec:\s*/, "").replace(/\\"/g, '"')); } catch { return {}; }
}

async function sha1(buf) { return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10); }

async function main() {
  const html = await loadHtml();
  const menuData = evalLiteral(extractObjectLiteral(html, "const menuData = "));
  const orderMatch = html.match(/const SECTION_ORDER = (\[[^\]]*\])/);
  const order = orderMatch ? evalLiteral(orderMatch[1]) : Object.keys(menuData);
  const labels = germanSectionLabels(html);
  const disclaimer = (html.match(/Produktbilder dienen ausschlie(?:ß|ss)lich als Beispiel[^"<]*/) || [""])[0].trim();

  const categories = []; const items = []; const usedIds = new Set();
  order.filter((k) => menuData[k]).concat(Object.keys(menuData).filter((k) => !order.includes(k))).forEach((key, ci) => {
    categories.push({ id: key, name: labels[key] || key.charAt(0).toUpperCase() + key.slice(1), sort_order: ci });
    menuData[key].items.forEach((it, ii) => {
      const name = String(it.name.de || "").trim();
      if (!name) return;
      let id = slug(name); if (usedIds.has(id)) id = `${id}-${slug(key)}`; usedIds.add(id);
      const cents = typeof it.price === "number" && it.price > 0 ? Math.round(it.price * 100) : null; // KEIN Preis → nicht bestellbar
      const ref = (String(it.img || "").match(/\/media\/([A-Za-z0-9]+)\.(?:webp|jpe?g|png)/) || [])[1] || null;
      items.push({ id, category_id: key, name, description: String(it.desc?.de || "").trim() || null, price_cents: cents,
        image_source_url: it.img || null, source_ref: ref, source_order: ii, sort_order: ii });
    });
  });

  // ---- Bilder: deterministisch pro Quell-Medium (media-ID); bereits vorhandene Dateien werden nicht erneut geladen
  if (!args.has("--dry-run")) fs.mkdirSync(IMG_DIR, { recursive: true });
  let downloaded = 0, reused = 0, missing = 0;
  for (const it of items) {
    if (!it.image_source_url || !it.source_ref) { it.image_url = null; missing++; continue; }
    const ext = (it.image_source_url.match(/\.(webp|jpe?g|png)(?:\?|$)/i) || [, "webp"])[1].toLowerCase();
    const file = `${it.source_ref}.${ext}`; const full = path.join(IMG_DIR, file);
    it.image_url = `assets/menu/${file}`;
    if (fs.existsSync(full)) { reused++; continue; }
    if (args.has("--dry-run")) continue;
    const r = await fetch(it.image_source_url);
    if (!r.ok) { console.warn(`  ! Bild nicht ladbar (${r.status}): ${it.name}`); it.image_url = null; missing++; continue; }
    fs.writeFileSync(full, Buffer.from(await r.arrayBuffer())); downloaded++;
  }

  const result = { source: SOURCE_URL, imported_at: new Date().toISOString(), image_disclaimer: disclaimer || null, categories, items };

  // ---- Diff gegen den letzten Import (zur Prüfung vor dem Veröffentlichen)
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT_JSON, "utf8")); } catch {}
  const pm = new Map((prev?.items || []).map((i) => [i.id, i]));
  const added = [], changed = [], removed = [];
  items.forEach((i) => { const o = pm.get(i.id); if (!o) added.push(i); else {
    const d = ["name", "description", "price_cents", "image_source_url", "category_id"].filter((k) => o[k] !== i[k]);
    if (d.length) changed.push(`${i.name}: ${d.map((k) => `${k} ${JSON.stringify(o[k])} → ${JSON.stringify(i[k])}`).join("; ")}`); pm.delete(i.id); } });
  pm.forEach((o) => removed.push(o));
  console.log(`Quelle: ${categories.length} Kategorien, ${items.length} Artikel (${items.filter((i) => i.price_cents == null).length} ohne Preis → nicht bestellbar)`);
  console.log(`Bilder: ${downloaded} neu geladen, ${reused} bereits vorhanden, ${missing} ohne Bild`);
  if (prev) console.log(`Diff: +${added.length} neu, ~${changed.length} geändert, -${removed.length} entfallen`);
  changed.forEach((c) => console.log("  ~ " + c)); added.forEach((a) => prev && console.log("  + " + a.name)); removed.forEach((r) => console.log("  - " + r.name));

  if (!args.has("--dry-run")) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + "\n");
    console.log(`geschrieben: ${path.relative(ROOT, OUT_JSON)}`);
  }

  // ---- Supabase (optional)
  if (args.has("--apply")) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("--apply benötigt SUPABASE_URL und SUPABASE_SECRET_KEY als Umgebungsvariablen.");
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/import_menu`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: result, p_deactivate_unlisted: args.has("--deactivate-unlisted") }),
    });
    const body = await r.text();
    if (!r.ok) throw new Error(`Import fehlgeschlagen (${r.status}): ${body.slice(0, 300)}`);
    console.log("Supabase:", body);
  } else console.log("Hinweis: ohne --apply wurde Supabase nicht verändert.");
}
main().catch((e) => { console.error("FEHLER:", e.message); process.exit(1); });
