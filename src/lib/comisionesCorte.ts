import "server-only";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { elegirRegla } from "./comisiones";
import { reglasDe, ventasEntre } from "./datos";
import { db, schema as s } from "./db";
import { cuentaDe, periodoDePago } from "./equipo";
import { fechaCorta, fechaLocal } from "./fechas";
import { POR_ENTREGAR } from "./pagosAuto";

export type ComisionCorte = { id: string; nombre: string; avatar: string; servicios: number; monto: number };
export type EntregaCorte = { id: string; nombre: string; avatar: string; monto: number; detalle: string };

/** Lo que generó cada persona con las ventas de un turno de caja: servicios y comisión. */
export async function comisionesDeTurno(barberiaId: string, turnoId: string): Promise<ComisionCorte[]> {
  const filas = await db
    .select({ id: s.conceptos.barberoId, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar, servicios: sql<number>`count(*)::int`, monto: sql<number>`coalesce(sum(${s.conceptos.comision}), 0)::int` })
    .from(s.conceptos)
    .innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.conceptos.barberoId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada")))
    .groupBy(s.conceptos.barberoId, s.usuarios.nombre, s.usuarios.avatar)
    .orderBy(asc(s.usuarios.nombre));
  return filas.filter((x): x is ComisionCorte => !!x.id);
}

/** Comisiones ya liquidadas que esperan entregarse en efectivo, más las que se liquidan hoy al hacer el corte. */
export async function entregasDeCorte(barberiaId: string, zona: string, desdePago: string | null): Promise<EntregaCorte[]> {
  const hoy = fechaLocal(new Date(), zona);
  const pendientes = await db
    .select({ id: s.pagosComision.barberoId, monto: s.pagosComision.monto, nota: s.pagosComision.nota, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
    .from(s.pagosComision).innerJoin(s.usuarios, eq(s.usuarios.id, s.pagosComision.barberoId))
    .where(and(eq(s.pagosComision.barberiaId, barberiaId), eq(s.pagosComision.tipo, "pago"), like(s.pagosComision.nota, `${POR_ENTREGAR}:%`), sql`${s.pagosComision.monto} > 0`));
  const mapa = new Map<string, EntregaCorte>();
  const sumar = (id: string, nombre: string, avatar: string, monto: number, detalle: string) => {
    const x = mapa.get(id) ?? { id, nombre, avatar, monto: 0, detalle: "" };
    x.monto += monto; x.detalle = [x.detalle, detalle].filter(Boolean).join(" y ");
    mapa.set(id, x);
  };
  for (const p of pendientes) sumar(p.id, p.nombre, p.avatar, p.monto, p.nota.slice(POR_ENTREGAR.length + 2).replace(/^Pago automático\s*/, "").replace(/^del /, "del "));
  // Periodos que se pagan hoy y terminan hoy: se liquidan al cerrar la caja con lo vendido en el día.
  if (desdePago) {
    const reglas = await reglasDe(barberiaId);
    const gente = await db.select({ id: s.usuarios.id, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar, rol: s.usuarios.rol }).from(s.usuarios)
      .where(and(eq(s.usuarios.barberiaId, barberiaId), eq(s.usuarios.activo, true)));
    for (const g of gente.filter((x) => x.rol === "barbera" || x.rol === "encargada")) {
      const r = elegirRegla(reglas, g.id, null, new Date());
      if (!r || r.tipo === "renta" || (r.formaPago ?? "efectivo") !== "efectivo") continue;
      const per = periodoDePago(r, hoy);
      if (per.hasta !== hoy || per.pago !== hoy) continue;
      const desde = per.desde < desdePago ? desdePago : per.desde;
      const { ventas } = await ventasEntre(barberiaId, desde, hoy, { zona, barberoId: g.id });
      const c = await cuentaDe(barberiaId, g.id, desde, hoy, ventas.filter((v) => v.estado === "pagada"));
      const monto = Math.round(c.saldo / 100) * 100;
      if (monto > 0) sumar(g.id, g.nombre, g.avatar, monto, desde === hoy ? "de hoy" : `del ${fechaCorta(desde)} al ${fechaCorta(hoy)}`);
    }
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
