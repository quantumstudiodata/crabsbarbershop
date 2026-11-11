"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { pagosLinea } from "@/lib/db/schema";
import { verificarPago } from "@/lib/pagos";
import { stripe } from "@/lib/stripe";

async function pagoPendiente(token: string) {
  const [p] = await db.select().from(pagosLinea).where(eq(pagosLinea.token, String(token).slice(0, 40))).limit(1);
  if (!p || p.tipo !== "venta" || !p.intento) return null;
  const [b] = await db.select({ cuenta: schema.barberias.stripeCuenta }).from(schema.barberias).where(eq(schema.barberias.id, p.barberiaId)).limit(1);
  return b?.cuenta ? { p, cuenta: b.cuenta } : null;
}

/** El cliente elige propina: se ajusta el monto del intento antes de pagar. La propina va de 0 al 100% del servicio. */
export async function elegirPropina(token: string, propina: number): Promise<{ ok?: boolean; error?: string; total?: number }> {
  const x = await pagoPendiente(token);
  if (!x || x.p.estado !== "pendiente") return { error: "Este pago ya no está disponible." };
  const d = x.p.detalle as { propinaFija?: boolean };
  if (d.propinaFija) return { error: "La propina ya se incluyó en el cobro." };
  const monto = Math.round(Number(propina));
  if (!Number.isFinite(monto) || monto < 0 || monto > x.p.monto) return { error: "Elige una propina válida." };
  try {
    await stripe().paymentIntents.update(x.p.intento!, { amount: x.p.monto + monto }, { stripeAccount: x.cuenta });
    await db.update(pagosLinea).set({ propina: monto }).where(and(eq(pagosLinea.id, x.p.id), eq(pagosLinea.estado, "pendiente")));
    return { ok: true, total: x.p.monto + monto };
  } catch (err) {
    console.error(err);
    return { error: "No se pudo actualizar la propina. Intenta de nuevo." };
  }
}

/** Estado del pago para la página del cliente (sin datos de la venta más allá de lo que ya ve). */
export async function estadoPago(token: string): Promise<{ estado: string }> {
  const t = String(token).slice(0, 40);
  const [p] = await db.select({ estado: pagosLinea.estado, intento: pagosLinea.intento, barberiaId: pagosLinea.barberiaId }).from(pagosLinea).where(eq(pagosLinea.token, t)).limit(1);
  if (!p) return { estado: "desconocido" };
  if (p.estado === "pendiente") {
    await verificarPago(p);
    const [n] = await db.select({ estado: pagosLinea.estado }).from(pagosLinea).where(eq(pagosLinea.token, t)).limit(1);
    return { estado: n?.estado ?? p.estado };
  }
  return { estado: p.estado };
}
