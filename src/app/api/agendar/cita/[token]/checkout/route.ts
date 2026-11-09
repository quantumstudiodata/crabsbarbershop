import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

async function stripeRequest(path: string, key: string, init?: RequestInit) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    ...init, cache: "no-store",
    headers: { authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "No se encontró la cita." }, { status: 404 });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "El pago en línea todavía no está configurado." }, { status: 503 });
  const [cita] = await db.select().from(schema.citas).where(eq(schema.citas.tokenPublico, token)).limit(1);
  if (!cita || cita.estado === "cancelada") return NextResponse.json({ error: "No se encontró una cita disponible." }, { status: 404 });
  if (cita.estadoPago === "pagada") return NextResponse.json({ pagada: true });

  if (cita.stripeCheckoutSessionId) {
    const r = await stripeRequest(`checkout/sessions/${encodeURIComponent(cita.stripeCheckoutSessionId)}`, key);
    if (r.ok) {
      const session = await r.json();
      if (session.payment_status === "paid") {
        await db.update(schema.citas).set({ estadoPago: "pagada", stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null })
          .where(eq(schema.citas.id, cita.id));
        return NextResponse.json({ pagada: true });
      }
      if (session.status === "open" && session.client_secret) return NextResponse.json({ clientSecret: session.client_secret });
    }
  }

  const form = new URLSearchParams();
  form.set("ui_mode", "elements");
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][price_data][currency]", "mxn");
  form.set("line_items[0][price_data][product_data][name]", cita.servicioNombre);
  form.set("line_items[0][price_data][product_data][description]", `Cita en Crabs Barbería · ${cita.iniciaEn.toISOString()}`);
  form.set("line_items[0][price_data][unit_amount]", String(cita.precio));
  form.set("line_items[0][quantity]", "1");
  form.set("return_url", `${req.nextUrl.origin}/agendar/confirmada/${token}?session_id={CHECKOUT_SESSION_ID}`);
  form.set("metadata[appointment_id]", cita.id);
  form.set("metadata[barberia_id]", cita.barberiaId);
  if (cita.clienteEmail) form.set("customer_email", cita.clienteEmail);

  const idem = `cita_${cita.id}_${Math.floor(Date.now() / 60_000)}`;
  const created = await stripeRequest("checkout/sessions", key, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "idempotency-key": idem }, body: form,
  });
  const data = await created.json();
  if (!created.ok || !data.client_secret || !data.id) {
    console.error("No se pudo crear el Checkout Session de Stripe", data.error?.type ?? created.status);
    return NextResponse.json({ error: "Stripe no pudo preparar el pago. Intenta de nuevo o paga al llegar." }, { status: 502 });
  }
  await db.update(schema.citas).set({ estadoPago: "pendiente", stripeCheckoutSessionId: data.id }).where(eq(schema.citas.id, cita.id));
  return NextResponse.json({ clientSecret: data.client_secret });
}
