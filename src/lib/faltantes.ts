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

/** Faltantes asignados a una persona en un rango de fechas (para restarlos de lo que se le paga). */
export async function faltantesDe(barberiaId: string, desde: string, hasta: string) {
  return db.select({ usuarioId: schema.faltantesCaja.usuarioId, monto: sql<number>`sum(${schema.faltantesCaja.monto})::int` }).from(schema.faltantesCaja)
    .where(and(eq(schema.faltantesCaja.barberiaId, barberiaId), sql`${schema.faltantesCaja.fecha} between ${desde}::date and ${hasta}::date`))
    .groupBy(schema.faltantesCaja.usuarioId);
}
