// Edge Function: create-checkout-session
// Nimmt einen Warenkorb (nur IDs + Mengen) entgegen, lässt die Datenbank alles prüfen und neu berechnen
// (Preise, Verfügbarkeit, Optionen, Pause-Schalter) und erstellt eine Stripe-Checkout-Session.
// Die Bestellung bleibt "pending" – bezahlt wird sie AUSSCHLIESSLICH durch den Stripe-Webhook.
//
// Secrets (nur serverseitig!): STRIPE_SECRET_KEY, SITE_URL (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sind automatisch vorhanden)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") ?? "*", // Tipp: auf deine GitHub-Pages-Origin einschränken
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (!stripeKey || !siteUrl) return json({ error: "stripe_unavailable" }, 503);

    const payload = await req.json();
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // 1) Serverseitige Validierung + Preisberechnung (SQL-Funktion). Fehler = z. B. "sold_out:Pommes Frites"
    const { data, error } = await supa.rpc("create_order_from_cart", { payload, p_paid: false, p_demo: false });
    if (error) return json({ error: error.message }, 400);

    // 2) Stripe Checkout Session (Beträge in Cent, aus den Datenbankwerten)
    const f = new URLSearchParams();
    f.set("mode", "payment");
    f.set("success_url", `${siteUrl}/order.html?t=${data.tracking_token}`);
    f.set("cancel_url", `${siteUrl}/index.html?payment=cancelled#speisekarte`);
    f.set("client_reference_id", data.order_id);
    f.set("metadata[order_id]", data.order_id);
    f.set("payment_intent_data[metadata][order_id]", data.order_id);
    f.set("payment_intent_data[description]", `H11 Neubau Bestellung ${data.order_number}`);
    const email = payload?.customer?.email;
    if (typeof email === "string" && /^\S+@\S+\.\S+$/.test(email)) f.set("customer_email", email);
    (data.items as any[]).forEach((it, i) => {
      const opts = (it.selected_options ?? []).map((o: any) => o.name).join(", ");
      f.set(`line_items[${i}][quantity]`, String(it.quantity));
      f.set(`line_items[${i}][price_data][currency]`, "eur");
      f.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(Number(it.unit_price) * 100)));
      f.set(`line_items[${i}][price_data][product_data][name]`, it.name);
      if (opts) f.set(`line_items[${i}][price_data][product_data][description]`, opts);
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": data.order_id,
      },
      body: f,
    });
    const session = await res.json();
    if (!res.ok) {
      console.error("stripe error", session?.error?.message);
      await supa.from("orders").update({ payment_status: "failed" }).eq("id", data.order_id);
      return json({ error: "stripe_unavailable" }, 502);
    }
    await supa.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", data.order_id);

    return json({ url: session.url, order_number: data.order_number });
  } catch (e) {
    console.error(e);
    return json({ error: "network" }, 500);
  }
});
