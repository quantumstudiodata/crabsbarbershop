// Consultas de lectura. Todas reciben barberiaId desde la sesión: nunca desde la URL ni el formulario.

import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { efectivoEsperado, type MovimientosTurno } from "./caja";
import type { Regla, ReglaCopia } from "./comisiones";
import { db, schema } from "./db";
import { fechaLocal, horaLocal } from "./fechas";

const s = schema;

export async function turnoAbierto(barberiaId: string) {
  const [t] = await db
    .select()
    .from(s.turnosCaja)
    .where(and(eq(s.turnosCaja.barberiaId, barberiaId), eq(s.turnosCaja.estado, "abierto")))
    .limit(1);
  return t ?? null;
}

export async function movimientosDeTurno(barberiaId: string, turnoId: string, fondoInicial: number) {
  const [cobros] = await db
    .select({ total: sql<number>`coalesce(sum(${s.pagos.monto}),0)::int` })
    .from(s.pagos)
    .innerJoin(s.ventas, eq(s.ventas.id, s.pagos.ventaId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada"), eq(s.pagos.esEfectivo, true)));
  const [otrosCobros] = await db
    .select({ total: sql<number>`coalesce(sum(${s.pagos.monto}),0)::int`, ventas: sql<number>`count(distinct ${s.ventas.id})::int` })
    .from(s.pagos)
    .innerJoin(s.ventas, eq(s.ventas.id, s.pagos.ventaId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada"), eq(s.pagos.esEfectivo, false)));
  const [propinas] = await db
    .select({
      efectivo: sql<number>`coalesce(sum(case when ${s.propinas.esEfectivo} then ${s.propinas.monto} else 0 end),0)::int`,
      total: sql<number>`coalesce(sum(${s.propinas.monto}),0)::int`,
    })
    .from(s.propinas)
    .innerJoin(s.ventas, eq(s.ventas.id, s.propinas.ventaId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada")));
  const [conteoVentas] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.ventas)
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada")));
  const movs = await db
    .select({
      id: s.movimientosCaja.id, tipo: s.movimientosCaja.tipo, monto: s.movimientosCaja.monto, concepto: s.movimientosCaja.concepto,
      creadoEn: s.movimientosCaja.creadoEn, usuario: s.usuarios.nombre,
    })
    .from(s.movimientosCaja)
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.movimientosCaja.usuarioId))
    .where(and(eq(s.movimientosCaja.barberiaId, barberiaId), eq(s.movimientosCaja.turnoId, turnoId)))
    .orderBy(desc(s.movimientosCaja.creadoEn));
  const gastosCaja = await db
    .select({ id: s.gastos.id, monto: s.gastos.monto, concepto: s.gastos.concepto, categoria: s.gastos.categoria, creadoEn: s.gastos.creadoEn, usuario: s.usuarios.nombre })
    .from(s.gastos)
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.gastos.usuarioId))
    .where(and(eq(s.gastos.barberiaId, barberiaId), eq(s.gastos.turnoId, turnoId)))
    .orderBy(desc(s.gastos.creadoEn));

  const totalTipo = (t: string) => movs.filter((m) => m.tipo === t).reduce((a, m) => a + m.monto, 0);
  const m: MovimientosTurno = {
    fondoInicial,
    cobrosEfectivo: cobros.total,
    propinasEfectivo: propinas.efectivo,
    entradas: totalTipo("entrada"),
    retiros: totalTipo("retiro"),
    gastosDeCaja: gastosCaja.reduce((a, g) => a + g.monto, 0),
    devolucionesEfectivo: totalTipo("devolucion"),
  };
  return {
    m,
    esperado: efectivoEsperado(m),
    otrosCobros: otrosCobros.total,
    ventas: conteoVentas.n,
    propinasTotal: propinas.total,
    movimientos: movs,
    gastos: gastosCaja,
  };
}

export type VentaFila = {
  id: string;
  folio: string;
  creadoEn: Date;
  estado: "pagada" | "cancelada";
  total: number;
  fechaOperativa: string;
  turnoId: string;
  turnoEstado: "abierto" | "cerrado";
  motivoCancelacion: string | null;
  registradaPor: string;
};

/** Ventas por fecha operativa (el día del turno), de la más reciente a la más antigua. */
export async function ventasEntre(barberiaId: string, desde: string, hasta: string, opciones: { barberoId?: string } = {}) {
  const filas = await db
    .select({
      id: s.ventas.id, folio: s.ventas.folio, creadoEn: s.ventas.creadoEn, estado: s.ventas.estado, total: s.ventas.total,
      fechaOperativa: s.turnosCaja.fechaOperativa, turnoId: s.ventas.turnoId, turnoEstado: s.turnosCaja.estado,
      motivoCancelacion: s.ventas.motivoCancelacion, registradaPor: s.usuarios.nombre,
    })
    .from(s.ventas)
    .innerJoin(s.turnosCaja, eq(s.turnosCaja.id, s.ventas.turnoId))
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.ventas.registradaPor))
    .where(and(eq(s.ventas.barberiaId, barberiaId), gte(s.turnosCaja.fechaOperativa, desde), lte(s.turnosCaja.fechaOperativa, hasta)))
    .orderBy(desc(s.ventas.creadoEn));
  if (filas.length === 0) return { ventas: [] as (VentaFila & { conceptos: ConceptoFila[]; pagos: PagoFila[]; propinas: PropinaFila[] })[] };
  const ids = filas.map((f) => f.id);
  const [cs, ps, prs] = await Promise.all([
    db
      .select({
        ventaId: s.conceptos.ventaId, nombre: s.conceptos.nombreServicio, barberoId: s.conceptos.barberoId, barbero: s.usuarios.nombre,
        precioLista: s.conceptos.precioLista, descuento: s.conceptos.descuento, precioCobrado: s.conceptos.precioCobrado,
        comision: s.conceptos.comision, servicioId: s.conceptos.servicioId,
      })
      .from(s.conceptos)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.conceptos.barberoId))
      .where(and(eq(s.conceptos.barberiaId, barberiaId), inArray(s.conceptos.ventaId, ids))),
    db
      .select({ ventaId: s.pagos.ventaId, metodo: s.pagos.nombreMetodo, esEfectivo: s.pagos.esEfectivo, monto: s.pagos.monto })
      .from(s.pagos)
      .where(and(eq(s.pagos.barberiaId, barberiaId), inArray(s.pagos.ventaId, ids))),
    db
      .select({ ventaId: s.propinas.ventaId, barberoId: s.propinas.barberoId, monto: s.propinas.monto, esEfectivo: s.propinas.esEfectivo })
      .from(s.propinas)
      .where(and(eq(s.propinas.barberiaId, barberiaId), inArray(s.propinas.ventaId, ids))),
  ]);
  let ventas = filas.map((f) => ({
    ...f,
    conceptos: cs.filter((c) => c.ventaId === f.id),
    pagos: ps.filter((p) => p.ventaId === f.id),
    propinas: prs.filter((p) => p.ventaId === f.id),
  }));
  if (opciones.barberoId) {
    const b = opciones.barberoId;
    ventas = ventas.filter((v) => v.conceptos.some((c) => c.barberoId === b));
  }
  return { ventas };
}
type ConceptoFila = { ventaId: string; nombre: string; barberoId: string; barbero: string; precioLista: number; descuento: number; precioCobrado: number; comision: number; servicioId: string | null };
type PagoFila = { ventaId: string; metodo: string; esEfectivo: boolean; monto: number };
type PropinaFila = { ventaId: string; barberoId: string; monto: number; esEfectivo: boolean };

/** Resumen de un periodo. Ventas = lo cobrado por servicios ya con descuento; sin propinas ni ventas canceladas. */
export async function resumenPeriodo(barberiaId: string, desde: string, hasta: string) {
  const { ventas } = await ventasEntre(barberiaId, desde, hasta);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const brutas = pagadas.reduce((a, v) => a + v.conceptos.reduce((b, c) => b + c.precioLista, 0), 0);
  const descuentos = pagadas.reduce((a, v) => a + v.conceptos.reduce((b, c) => b + c.descuento, 0), 0);
  const netas = pagadas.reduce((a, v) => a + v.total, 0);
  const servicios = pagadas.reduce((a, v) => a + v.conceptos.length, 0);
  const comisiones = pagadas.reduce((a, v) => a + v.conceptos.reduce((b, c) => b + c.comision, 0), 0);
  const propinas = pagadas.reduce((a, v) => a + v.propinas.reduce((b, p) => b + p.monto, 0), 0);
  const canceladas = ventas.filter((v) => v.estado === "cancelada");

  const porDia = new Map<string, number>();
  const porMetodo = new Map<string, number>();
  const porServicio = new Map<string, { veces: number; monto: number }>();
  const porBarbero = new Map<string, { nombre: string; servicios: number; monto: number }>();
  for (const v of pagadas) {
    porDia.set(v.fechaOperativa, (porDia.get(v.fechaOperativa) ?? 0) + v.total);
    for (const p of v.pagos) porMetodo.set(p.metodo, (porMetodo.get(p.metodo) ?? 0) + p.monto);
    for (const c of v.conceptos) {
      const x = porServicio.get(c.nombre) ?? { veces: 0, monto: 0 };
      porServicio.set(c.nombre, { veces: x.veces + 1, monto: x.monto + c.precioCobrado });
      const b = porBarbero.get(c.barberoId) ?? { nombre: c.barbero, servicios: 0, monto: 0 };
      porBarbero.set(c.barberoId, { nombre: b.nombre, servicios: b.servicios + 1, monto: b.monto + c.precioCobrado });
    }
  }
  const [g] = await db
    .select({ total: sql<number>`coalesce(sum(${s.gastos.monto}),0)::int` })
    .from(s.gastos)
    .where(and(eq(s.gastos.barberiaId, barberiaId), gte(s.gastos.fecha, desde), lte(s.gastos.fecha, hasta)));

  return {
    clientes: pagadas.length,
    brutas,
    descuentos,
    netas,
    servicios,
    comisiones,
    propinas,
    gastos: g.total,
    canceladas: canceladas.length,
    ticket: pagadas.length ? Math.round(netas / pagadas.length) : 0,
    porDia,
    porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
    porServicio: [...porServicio.entries()].sort((a, b) => b[1].monto - a[1].monto),
    porBarbero: [...porBarbero.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.monto - a.monto),
  };
}

export async function serviciosActivos(barberiaId: string) {
  return db
    .select()
    .from(s.servicios)
    .where(and(eq(s.servicios.barberiaId, barberiaId), eq(s.servicios.activo, true)))
    .orderBy(asc(s.servicios.orden), asc(s.servicios.nombre));
}

export async function metodosActivos(barberiaId: string) {
  return db
    .select()
    .from(s.metodosPago)
    .where(and(eq(s.metodosPago.barberiaId, barberiaId), eq(s.metodosPago.activo, true)))
    .orderBy(asc(s.metodosPago.orden));
}

/** Personas que atienden clientes: barberas y encargada activas. La dueña vive fuera y no corta en el local. */
export async function equipoQueAtiende(barberiaId: string) {
  return db
    .select({ id: s.usuarios.id, nombre: s.usuarios.nombre, rol: s.usuarios.rol })
    .from(s.usuarios)
    .where(and(eq(s.usuarios.barberiaId, barberiaId), eq(s.usuarios.activo, true), inArray(s.usuarios.rol, ["barbera", "encargada"])))
    .orderBy(asc(s.usuarios.nombre));
}

export async function reglasDe(barberiaId: string): Promise<Regla[]> {
  const filas = await db.select().from(s.reglasComision).where(eq(s.reglasComision.barberiaId, barberiaId));
  return filas.map((r) => ({ ...r }));
}

export function copiaRegla(r: Regla | null): ReglaCopia | null {
  return r ? { tipo: r.tipo, porcentaje: r.porcentaje, montoFijo: r.montoFijo, montoSemanal: r.montoSemanal } : null;
}

export async function pagosComisionSemana(barberiaId: string, semana: string) {
  return db
    .select()
    .from(s.pagosComision)
    .where(and(eq(s.pagosComision.barberiaId, barberiaId), eq(s.pagosComision.semana, semana)));
}

/** Servicios cobrados con su día y hora local, para detectar horarios tranquilos. */
export async function serviciosParaIdeas(barberiaId: string, zona: string) {
  const filas = await db
    .select({ creadoEn: s.ventas.creadoEn, n: sql<number>`count(${s.conceptos.id})::int` })
    .from(s.ventas)
    .innerJoin(s.conceptos, eq(s.conceptos.ventaId, s.ventas.id))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada")))
    .groupBy(s.ventas.id, s.ventas.creadoEn);
  const res: { fecha: string; hora: number }[] = [];
  for (const f of filas) for (let i = 0; i < f.n; i++) res.push({ fecha: fechaLocal(f.creadoEn, zona), hora: horaLocal(f.creadoEn, zona) });
  return res;
}

export async function turnosCerrados(barberiaId: string, limite = 30) {
  return db
    .select({
      id: s.turnosCaja.id, fechaOperativa: s.turnosCaja.fechaOperativa, abiertoEn: s.turnosCaja.abiertoEn, cerradoEn: s.turnosCaja.cerradoEn,
      fondoInicial: s.turnosCaja.fondoInicial, efectivoEsperado: s.turnosCaja.efectivoEsperado, efectivoContado: s.turnosCaja.efectivoContado,
      diferencia: s.turnosCaja.diferencia, notasCierre: s.turnosCaja.notasCierre, cerradoPor: s.usuarios.nombre,
    })
    .from(s.turnosCaja)
    .leftJoin(s.usuarios, eq(s.usuarios.id, s.turnosCaja.cerradoPor))
    .where(and(eq(s.turnosCaja.barberiaId, barberiaId), eq(s.turnosCaja.estado, "cerrado"), isNotNull(s.turnosCaja.cerradoEn)))
    .orderBy(desc(s.turnosCaja.cerradoEn))
    .limit(limite);
}

export async function ajustesDeTurnos(barberiaId: string, turnoIds: string[]) {
  if (turnoIds.length === 0) return [];
  return db
    .select({ turnoId: s.ajustesCierre.turnoId, monto: s.ajustesCierre.monto, motivo: s.ajustesCierre.motivo, usuario: s.usuarios.nombre, creadoEn: s.ajustesCierre.creadoEn })
    .from(s.ajustesCierre)
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.ajustesCierre.usuarioId))
    .where(and(eq(s.ajustesCierre.barberiaId, barberiaId), inArray(s.ajustesCierre.turnoId, turnoIds)));
}
