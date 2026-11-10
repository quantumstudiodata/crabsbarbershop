import type Stripe from "stripe";
import { actualizarCuenta, confirmarPago, marcarReembolso } from "@/lib/pagos";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Avisos de Stripe (cuentas conectadas). Solo se acepta un aviso con firma válida:
 * un pago cuenta únicamente cuando Stripe lo confirma por aquí, nunca porque el navegador lo diga.
 */
export async function POST(req: Request) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  const firma = req.headers.get("stripe-signature");
  if (!secreto || !firma || !process.env.STRIPE_SECRET_KEY) return new Response("Sin configurar", { status: 400 });
  const cuerpo = await req.text();
  let ev: Stripe.Event;
  try {
    ev = stripe().webhooks.constructEvent(cuerpo, firma, secreto);
  } catch {
    return new Response("Firma inválida", { status: 400 });
  }
  try {
    if (ev.type === "payment_intent.succeeded" && ev.account) await confirmarPago(ev.data.object, ev.account);
    else if (ev.type === "account.updated") await actualizarCuenta(ev.data.object);
    else if (ev.type === "charge.refunded") await marcarReembolso(ev.data.object);
  } catch (err) {
    console.error("stripe_webhook", ev.type, err);
    // Stripe reintenta el aviso si respondemos con error.
    return new Response("Error", { status: 500 });
  }
  return Response.json({ recibido: true });
}
