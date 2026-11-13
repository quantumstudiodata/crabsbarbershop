import "server-only";
import { cache } from "react";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { fechaLocal, sumarDias } from "./fechas";
import { registrar } from "./historial";
import { formatoDinero } from "./money";

/** ¿A este gasto fijo le toca registrarse en esta fecha? */
function tocaEl(f: string, periodicidad: string, dia: number) {
  const d = Number(f.slice(8, 10));
  if (periodicidad === "mensual") return d === dia;
  if (periodicidad === "quincenal") return d === 1 || d === 16;
  if (periodicidad === "semanal") return new Date(`${f}T12:00:00Z`).getUTCDay() === dia;
  return false;
}

/**
 * Gastos frecuentes marcados como "se registra solo": cada periodo se registra el egreso con su importe fijo,
 * en su día, sin que nadie lo capture. Los que cambian de monto (como la luz) se siguen registrando a mano.
 * Es idempotente: cada fecha se registra una sola vez aunque varias pantallas lo pidan a la vez.
 */
export const registrarGastosAutomaticos = cache(async (barberiaId: string) => {
  try {
    const [b] = await db.select({ zona: s.barberias.zonaHoraria }).from(s.barberias).where(eq(s.barberias.id, barberiaId)).limit(1);
    if (!b) return;
    const hoy = fechaLocal(new Date(), b.zona);
    const fijos = await db.select().from(s.conceptosFrecuentes)
      .where(and(eq(s.conceptosFrecuentes.barberiaId, barberiaId), eq(s.conceptosFrecuentes.automatico, true), sql`${s.conceptosFrecuentes.monto} > 0`, sql`coalesce(${s.conceptosFrecuentes.ultimo}, '1900-01-01') < ${hoy}::date`));
    if (!fijos.length) return;
    const [titular] = await db.select({ id: s.usuarios.id }).from(s.usuarios)
      .where(and(eq(s.usuarios.barberiaId, barberiaId), eq(s.usuarios.rol, "duena"))).orderBy(asc(s.usuarios.creadoEn)).limit(1);
    if (!titular) return;
    for (const c of fijos) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gasto-auto-${c.id}`}))`);
        const [actual] = await tx.select({ ultimo: s.conceptosFrecuentes.ultimo }).from(s.conceptosFrecuentes).where(eq(s.conceptosFrecuentes.id, c.id)).limit(1);
        let f = actual?.ultimo ? sumarDias(actual.ultimo, 1) : hoy;
        for (let i = 0; i < 400 && f <= hoy; i++, f = sumarDias(f, 1)) {
          if (!tocaEl(f, c.periodicidad, c.dia)) continue;
          await tx.insert(s.gastos).values({
            barberiaId, categoria: c.categoria, concepto: c.concepto, descripcion: "Registro automático", monto: c.monto, fecha: f,
            metodo: c.metodo, periodicidad: c.periodicidad, usuarioId: titular.id,
          });
          await registrar(tx, { barberiaId, usuarioId: null, tipo: "gasto", accion: `Se registró automáticamente el egreso ${c.concepto} de ${formatoDinero(c.monto)}`, detalle: { fecha: f, categoria: c.categoria } });
        }
        await tx.update(s.conceptosFrecuentes).set({ ultimo: hoy }).where(eq(s.conceptosFrecuentes.id, c.id));
      });
    }
  } catch (err) {
    console.error("gastos_auto", err);
  }
});
