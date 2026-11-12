import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { registrar } from "./historial";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Venta ya calculada (precios, promociones, descuentos y comisiones), lista para guardarse. */
export type PlanVenta = {
  barberiaId: string; turnoId: string; usuarioId: string; usuarioNombre: string;
  total: number; descuentoTotal: number; descuento: number; motivoDescuento: string; observaciones: string; clave: string;
  citaId: string; promosUsadas: string[]; nombresPromo: string;
  // Cita pagada en línea por adelantado: la venta se registra al pagar y la cita sigue pendiente de atenderse.
  mantenerCita?: boolean;
  conceptos: (Omit<typeof schema.conceptos.$inferInsert, "ventaId">)[];
};
export type PagoVenta = { metodoPagoId: string | null; nombreMetodo: string; esEfectivo: boolean; monto: number };
export type PropinaVenta = { monto: number; barberoId: string; efectivo: boolean } | null;

/** Guarda la venta con su folio, conceptos, pagos y propina. Si viene de una cita, la deja cobrada. */
export async function insertarVenta(tx: Tx, plan: PlanVenta, pagos: PagoVenta[], propina: PropinaVenta, encuesta: string) {
  const [{ n, prefijo }] = await tx.update(schema.barberias).set({ siguienteFolio: sql`${schema.barberias.siguienteFolio} + 1` })
    .where(eq(schema.barberias.id, plan.barberiaId)).returning({ n: sql<number>`${schema.barberias.siguienteFolio} - 1`, prefijo: schema.barberias.folioPrefijo });
  const folio = `${prefijo}-${String(n).padStart(6, "0")}`;
  const [v] = await tx.insert(schema.ventas).values({
    barberiaId: plan.barberiaId, folio, turnoId: plan.turnoId, registradaPor: plan.usuarioId, total: plan.total, descuentoTotal: plan.descuentoTotal,
    observaciones: plan.observaciones, claveUnica: plan.clave, tokenEncuesta: encuesta,
  }).returning({ id: schema.ventas.id });
  await tx.insert(schema.conceptos).values(plan.conceptos.map((c) => ({ ...c, ventaId: v.id })));
  // Si viene de una cita, queda ligada a la venta y completada (una cita no se cobra dos veces).
  if (plan.citaId) {
    const r = await tx.update(schema.citas).set(plan.mantenerCita ? { ventaId: v.id, estadoPago: "pagada", actualizadoEn: new Date() } : { ventaId: v.id, estado: "completada", estadoPago: "pagada", actualizadoEn: new Date() })
      .where(and(eq(schema.citas.id, plan.citaId), eq(schema.citas.barberiaId, plan.barberiaId), sql`${schema.citas.ventaId} is null`)).returning({ id: schema.citas.id });
    if (!r.length) throw new Error("cita_cobrada");
  }
  // Cada promoción usada cuenta una vez por venta; si tiene límite y ya se agotó, no se cobra.
  for (const pid of plan.promosUsadas) {
    const r = await tx.update(schema.promociones).set({ usos: sql`${schema.promociones.usos} + 1` })
      .where(and(eq(schema.promociones.id, pid), sql`(${schema.promociones.limiteUsos} is null or ${schema.promociones.usos} < ${schema.promociones.limiteUsos})`)).returning({ id: schema.promociones.id });
    if (!r.length) throw new Error("promo_agotada");
  }
  if (pagos.length) await tx.insert(schema.pagos).values(pagos.map((p) => ({ barberiaId: plan.barberiaId, ventaId: v.id, metodoPagoId: p.metodoPagoId, nombreMetodo: p.nombreMetodo, esEfectivo: p.esEfectivo, monto: p.monto })));
  if (propina && propina.monto > 0) await tx.insert(schema.propinas).values({ barberiaId: plan.barberiaId, ventaId: v.id, barberoId: propina.barberoId, monto: propina.monto, esEfectivo: propina.efectivo });
  await registrar(tx, {
    barberiaId: plan.barberiaId, usuarioId: plan.usuarioId, tipo: "venta",
    accion: `${plan.usuarioNombre} cobró la venta ${folio}`,
    detalle: { folio, total: plan.total, descuento: plan.descuento, motivoDescuento: plan.motivoDescuento || undefined, promociones: plan.nombresPromo || undefined },
  });
  return { folio, ventaId: v.id };
}
