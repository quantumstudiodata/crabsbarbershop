import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

function firmaValida(payload: string, header: string, secret: string) {
  const partes = header.split(",").map((p) => p.split("=", 2));
  const timestamp = partes.find(([k]) => k === "t")?.[1];
  const firmas = partes.filter(([k]) => k === "v1").map(([, v]) => v).filter((v): v is string => !!v);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const esperado = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest();
  return firmas.some((hex) => {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
    const recibida = Buffer.from(hex, "hex");
    return recibida.length === esperado.length && timingSafeEqual(recibida, esperado);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const header = req.headers.get("stripe-signature");
  if (!secret || !header) return NextResponse.json({ error: "Configuración de webhook incompleta." }, { status: 400 });
  const raw = await req.text();
  if (!firmaValida(raw, header, secret)) return NextResponse.json({ error: "Firma no válida." }, { status: 400 });
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Evento no válido." }, { status: 400 }); }
  const session = event.data?.object;
  if (!session || typeof session.id !== "string" || typeof session.metadata !== "object" || !session.metadata) return NextResponse.json({ received: true });
  const meta = session.metadata as Record<string, unknown>;
  if (typeof meta.appointment_id !== "string" || typeof meta.barberia_id !== "string") return NextResponse.json({ received: true });

  const [cita] = await db.select().from(schema.citas)
    .where(and(eq(schema.citas.id, meta.appointment_id), eq(schema.citas.barberiaId, meta.barberia_id), eq(schema.citas.stripeCheckoutSessionId, session.id))).limit(1);
  if (!cita) return NextResponse.json({ received: true });
  const pagoCompleto = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  const fallo = event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired";
  if (!pagoCompleto && !fallo) return NextResponse.json({ received: true });
  // checkout.session.completed también puede llegar antes de que se liquide un método asíncrono.
  if (pagoCompleto && session.payment_status !== "paid") return NextResponse.json({ received: true });
  if (pagoCompleto && (session.currency !== "mxn" || session.amount_total !== cita.precio)) {
    return NextResponse.json({ error: "El pago no coincide con el total de la cita." }, { status: 400 });
  }
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
  await db.update(schema.citas).set({
    estadoPago: pagoCompleto ? "pagada" : "fallida",
    stripePaymentIntentId: paymentIntent ?? cita.stripePaymentIntentId,
  }).where(and(eq(schema.citas.id, cita.id), eq(schema.citas.stripeCheckoutSessionId, session.id)));
  return NextResponse.json({ received: true });
}
