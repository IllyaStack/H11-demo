// Edge Function: stripe-webhook  (Deploy mit --no-verify-jwt, Stripe sendet kein Supabase-JWT)
// Der Webhook ist die EINZIGE Quelle der Wahrheit für "bezahlt".
//  • Signatur wird geprüft (Stripe-Signature, HMAC-SHA256, 5 Min. Toleranz)
//  • Idempotenz: jede Event-ID wird nur einmal verarbeitet (Tabelle stripe_events)
//  • Betrag wird gegen die in der DB berechnete Summe geprüft
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_…)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const enc = new TextEncoder();

async function verify(body: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}
function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const body = await req.text();
  if (!(await verify(body, req.headers.get("stripe-signature"), secret))) {
    return new Response("invalid signature", { status: 400 });
  }
  const event = JSON.parse(body);
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Idempotenz: Event schon gesehen? → 200 und fertig (Stripe liefert Events ggf. mehrfach)
  const ins = await supa.from("stripe_events").insert({ id: event.id, type: event.type });
  if (ins.error) {
    if (ins.error.code === "23505") return new Response("duplicate", { status: 200 });
    console.error(ins.error);
    return new Response("db error", { status: 500 });
  }

  try {
    const s = event.data?.object;
    const orderId: string | undefined = s?.client_reference_id ?? s?.metadata?.order_id;

    if (orderId && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
      if (s.payment_status === "paid") {
        const { data: order } = await supa.from("orders").select("id,total,payment_status").eq("id", orderId).single();
        if (!order) throw new Error("order not found");
        if (Math.round(Number(order.total) * 100) !== s.amount_total) {
          console.error("amount mismatch", orderId, order.total, s.amount_total); // NICHT als bezahlt markieren
        } else {
          // Nur pending → paid (zweite Absicherung gegen Doppelverarbeitung)
          await supa.from("orders").update({
            payment_status: "paid", paid_at: new Date().toISOString(),
            stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
            stripe_checkout_session_id: s.id,
          }).eq("id", orderId).eq("payment_status", "pending");
        }
      }
    } else if (orderId && (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired")) {
      await supa.from("orders").update({ payment_status: "failed" }).eq("id", orderId).eq("payment_status", "pending");
    } else if (event.type === "charge.refunded") {
      const pi = event.data?.object?.payment_intent;
      if (pi) await supa.from("orders").update({ payment_status: "refunded" }).eq("stripe_payment_intent_id", pi);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    await supa.from("stripe_events").delete().eq("id", event.id); // erlaubt Stripe-Retry
    return new Response("processing error", { status: 500 });
  }
});
