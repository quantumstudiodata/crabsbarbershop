// Faltantes de caja: cómo se reparten y cuánto le toca a cada quien.

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
export { repartir } from "./reparto";

export type Cobrador = { id: string; efectivo: number };


/** Quiénes cobraron en un turno y cuánto efectivo recibió cada quien. */
export async function cobradoresDe(barberiaId: string, turnoId: string): Promise<Cobrador[]> {
  const filas = await db.select({ id: schema.ventas.registradaPor, efectivo: sql<number>`coalesce(sum(case when ${schema.pagos.esEfectivo} then ${schema.pagos.monto} else 0 end),0)::int` })
    .from(schema.ventas).leftJoin(schema.pagos, eq(schema.pagos.ventaId, schema.ventas.id))
    .where(and(eq(schema.ventas.barberiaId, barberiaId), eq(schema.ventas.turnoId, turnoId), eq(schema.ventas.estado, "pagada")))
    .groupBy(schema.ventas.registradaPor);
  return filas;
}

/**
 * Faltantes autorizados de cada persona en un rango de fechas. Solo estos se restan de lo que se le paga:
 * los que están en revisión o descartados no afectan su saldo (LFT art. 110).
 */
export async function faltantesDe(barberiaId: string, desde: string, hasta: string) {
  return db.select({ usuarioId: schema.faltantesCaja.usuarioId, monto: sql<number>`sum(${schema.faltantesCaja.monto})::int` }).from(schema.faltantesCaja)
    .where(and(eq(schema.faltantesCaja.barberiaId, barberiaId), eq(schema.faltantesCaja.estado, "autorizado"), sql`${schema.faltantesCaja.fecha} between ${desde}::date and ${hasta}::date`))
    .groupBy(schema.faltantesCaja.usuarioId);
}

/** Faltantes que esperan autorización, con la persona y el corte. */
export async function faltantesEnRevision(barberiaId: string) {
  return db.select({ id: schema.faltantesCaja.id, usuarioId: schema.faltantesCaja.usuarioId, nombre: schema.usuarios.nombre, monto: schema.faltantesCaja.monto, fecha: schema.faltantesCaja.fecha, regla: schema.faltantesCaja.regla })
    .from(schema.faltantesCaja).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.faltantesCaja.usuarioId))
    .where(and(eq(schema.faltantesCaja.barberiaId, barberiaId), eq(schema.faltantesCaja.estado, "revision")))
    .orderBy(schema.faltantesCaja.fecha);
}
