import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { fechaCorta, fechaLocal, lunesDe, sumarDias } from "./fechas";
import { formatoDinero } from "./money";

export type ResumenSemana = {
  periodo: string; ventas: number; cambio: number | null; servicios: number;
  transferencias: { n: number; total: number };
  alertas: { texto: string; href: string }[];
};

/**
 * Resumen de la semana pasada para la titular y el personal administrativo: lo vendido, las transferencias
 * por comparar con el banco y lo que se salió de lo normal. Las alertas no llegan una por una: se juntan aquí.
 */
export async function resumenSemana(barberiaId: string, zona: string): Promise<ResumenSemana> {
  const hoy = fechaLocal(new Date(), zona);
  const desde = sumarDias(lunesDe(hoy), -7), hasta = sumarDias(desde, 6);
  const antDesde = sumarDias(desde, -7), antHasta = sumarDias(desde, -1);
  const dia = (col: unknown) => sql`(${col} at time zone ${zona})::date`;
  const entre = (col: unknown, a: string, b: string) => sql`${dia(col)} between ${a}::date and ${b}::date`;
  const vendido = (a: string, b: string) => db.select({ total: sql<number>`coalesce(sum(${s.ventas.total}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(s.ventas).where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"), entre(s.ventas.creadoEn, a, b)));
  const [[sem], [ant], [serv], [transf], noVino, sinCobro, faltantes, canceladas] = await Promise.all([
    vendido(desde, hasta),
    vendido(antDesde, antHasta),
    db.select({ n: sql<number>`count(*)::int` }).from(s.conceptos).innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
      .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"), entre(s.ventas.creadoEn, desde, hasta))),
    db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${s.pagos.monto}), 0)::int` }).from(s.pagos).innerJoin(s.ventas, eq(s.ventas.id, s.pagos.ventaId))
      .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"), sql`${s.pagos.nombreMetodo} ilike '%transfer%'`, entre(s.ventas.creadoEn, desde, hasta))),
    db.select({ id: s.citas.barberoId, nombre: s.usuarios.nombre, n: sql<number>`count(*)::int` }).from(s.citas).innerJoin(s.usuarios, eq(s.usuarios.id, s.citas.barberoId))
      .where(and(eq(s.citas.barberiaId, barberiaId), eq(s.citas.estado, "no_asistio"), entre(s.citas.inicio, desde, hasta))).groupBy(s.citas.barberoId, s.usuarios.nombre),
    db.select({ n: sql<number>`count(*)::int` }).from(s.citas)
      .where(and(eq(s.citas.barberiaId, barberiaId), eq(s.citas.estado, "completada"), isNull(s.citas.ventaId), entre(s.citas.inicio, desde, hasta))),
    db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(-${s.turnosCaja.diferencia}), 0)::int` }).from(s.turnosCaja)
      .where(and(eq(s.turnosCaja.barberiaId, barberiaId), eq(s.turnosCaja.estado, "cerrado"), lt(s.turnosCaja.diferencia, 0), sql`${s.turnosCaja.fechaOperativa} between ${desde}::date and ${hasta}::date`)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ventas)
      .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "cancelada"), entre(s.ventas.canceladaEn, desde, hasta))),
  ]);
  const alertas: ResumenSemana["alertas"] = [];
  // Un barbero con muchos más "No vino" que el resto.
  if (noVino.length) {
    const max = [...noVino].sort((a, b) => b.n - a.n)[0];
    const resto = noVino.filter((x) => x.id !== max.id);
    const prom = resto.length ? resto.reduce((a, x) => a + x.n, 0) / resto.length : 0;
    if (max.n >= 3 && max.n >= Math.max(prom * 2, 2)) alertas.push({ texto: `${max.nombre.split(" ")[0]} tuvo ${max.n} citas marcadas como No vino, más que el resto del equipo`, href: `/citas?vista=lista&persona=${max.id}` });
  }
  if (sinCobro[0]?.n) alertas.push({ texto: sinCobro[0].n === 1 ? "Una cita se cerró como atendida sin cobrarse" : `${sinCobro[0].n} citas se cerraron como atendidas sin cobrarse`, href: "/citas?vista=lista" });
  if (faltantes[0]?.n) alertas.push({ texto: `${faltantes[0].n === 1 ? "Un corte" : `${faltantes[0].n} cortes`} con faltante, ${formatoDinero(faltantes[0].total)} en total`, href: "/analitica/cortes" });
  if ((canceladas[0]?.n ?? 0) >= 3) alertas.push({ texto: `${canceladas[0].n} ventas canceladas en la semana`, href: "/analitica/ventas" });
  return {
    periodo: `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`,
    ventas: sem.total, cambio: ant.total ? Math.round(((sem.total - ant.total) / ant.total) * 100) : null, servicios: serv?.n ?? 0,
    transferencias: { n: transf?.n ?? 0, total: transf?.total ?? 0 },
    alertas,
  };
}
