// Consultas de lectura. Todas reciben barberiaId desde la sesión: nunca desde la URL ni el formulario.

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { efectivoEsperado, type MovimientosTurno } from "./caja";
import { porSemana, type Regla, type ReglaCopia } from "./comisiones";
import { db, schema } from "./db";
import { fechaLocal, horaLocal, sumarDias, ZONA } from "./fechas";
import { type BarberoMeta, diasHabilesDelMes, metaDelNegocio } from "./metas";

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
  const otrosPorMetodo = await db
    .select({ metodo: s.pagos.nombreMetodo, total: sql<number>`coalesce(sum(${s.pagos.monto}),0)::int`, ventas: sql<number>`count(distinct ${s.ventas.id})::int` })
    .from(s.pagos)
    .innerJoin(s.ventas, eq(s.ventas.id, s.pagos.ventaId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada"), eq(s.pagos.esEfectivo, false)))
    .groupBy(s.pagos.nombreMetodo);
  // Las formas de pago activas aparecen siempre en el corte, aunque sea en $0.
  for (const m of await metodosActivos(barberiaId)) {
    if (!m.esEfectivo && !otrosPorMetodo.some((x) => x.metodo === m.nombre)) otrosPorMetodo.push({ metodo: m.nombre, total: 0, ventas: 0 });
  }
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
    .where(and(eq(s.gastos.barberiaId, barberiaId), eq(s.gastos.turnoId, turnoId), isNull(s.gastos.canceladoEn)))
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
    otrosCobros: otrosPorMetodo.reduce((a, x) => a + x.total, 0),
    otrosPorMetodo,
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
  /** Día real de la venta en la zona de la barbería (no el día en que se abrió la caja). */
  fecha: string;
  fechaOperativa: string;
  turnoId: string;
  turnoEstado: "abierto" | "cerrado";
  motivoCancelacion: string | null;
  registradaPor: string;
  registradaPorId: string;
};

/** Ventas por su fecha y hora reales en la zona de la barbería, de la más reciente a la más antigua. */
export async function ventasEntre(barberiaId: string, desde: string, hasta: string, opciones: { barberoId?: string; zona?: string; condiciones?: SQL[] } = {}) {
  const dia = sql<string>`to_char(${s.ventas.creadoEn} at time zone ${opciones.zona ?? ZONA}, 'YYYY-MM-DD')`;
  const filas = await db
    .select({
      id: s.ventas.id, folio: s.ventas.folio, creadoEn: s.ventas.creadoEn, estado: s.ventas.estado, total: s.ventas.total,
      fechaOperativa: s.turnosCaja.fechaOperativa, turnoId: s.ventas.turnoId, turnoEstado: s.turnosCaja.estado,
      motivoCancelacion: s.ventas.motivoCancelacion, registradaPor: s.usuarios.nombre, registradaPorId: s.ventas.registradaPor, fecha: dia,
    })
    .from(s.ventas)
    .innerJoin(s.turnosCaja, eq(s.turnosCaja.id, s.ventas.turnoId))
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.ventas.registradaPor))
    .where(and(eq(s.ventas.barberiaId, barberiaId), sql`${dia} between ${desde} and ${hasta}`, ...(opciones.condiciones ?? [])))
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
export async function resumenPeriodo(barberiaId: string, desde: string, hasta: string, zona = ZONA, barberoId?: string) {
  let { ventas } = await ventasEntre(barberiaId, desde, hasta, { zona, barberoId });
  if (barberoId) {
    // Solo lo de esa persona: sus servicios, y los pagos en proporción a lo que le toca de cada venta.
    ventas = ventas.map((v) => {
      const suyos = v.conceptos.filter((c) => c.barberoId === barberoId);
      const total = suyos.reduce((a, c) => a + c.precioCobrado, 0);
      const parte = v.total ? total / v.total : 0;
      return { ...v, conceptos: suyos, total, pagos: v.pagos.map((p) => ({ ...p, monto: Math.round(p.monto * parte) })), propinas: v.propinas.filter((p) => p.barberoId === barberoId) };
    });
  }
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
  const porHora = new Map<number, number>();
  for (const v of pagadas) {
    porDia.set(v.fecha, (porDia.get(v.fecha) ?? 0) + v.total);
    const h = horaLocal(v.creadoEn, zona);
    porHora.set(h, (porHora.get(h) ?? 0) + v.total);
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
    .where(and(eq(s.gastos.barberiaId, barberiaId), gte(s.gastos.fecha, desde), lte(s.gastos.fecha, hasta), isNull(s.gastos.canceladoEn)));

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
    porHora,
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

/** Personas que atienden clientes: barberos y encargado activos. El propietario no corta en el local. */
export async function equipoQueAtiende(barberiaId: string) {
  return db
    .select({ id: s.usuarios.id, nombre: s.usuarios.nombre, rol: s.usuarios.rol, avatar: s.usuarios.avatar, metaSemanal: s.usuarios.metaSemanal })
    .from(s.usuarios)
    .where(and(eq(s.usuarios.barberiaId, barberiaId), eq(s.usuarios.activo, true), inArray(s.usuarios.rol, ["barbera", "encargada"])))
    .orderBy(asc(s.usuarios.nombre));
}

export async function reglasDe(barberiaId: string): Promise<Regla[]> {
  const filas = await db.select().from(s.reglasComision).where(eq(s.reglasComision.barberiaId, barberiaId));
  return filas.map((r) => ({ ...r }));
}

export function copiaRegla(r: Regla | null): ReglaCopia | null {
  return r ? { tipo: r.tipo, porcentaje: r.porcentaje, montoFijo: r.montoFijo, montoSemanal: r.montoSemanal, periodo: r.periodo } : null;
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

export async function turnosCerrados(barberiaId: string, limite = 30, rango?: { desde: string; hasta: string }) {
  return db
    .select({
      id: s.turnosCaja.id, fechaOperativa: s.turnosCaja.fechaOperativa, abiertoEn: s.turnosCaja.abiertoEn, cerradoEn: s.turnosCaja.cerradoEn,
      fondoInicial: s.turnosCaja.fondoInicial, efectivoEsperado: s.turnosCaja.efectivoEsperado, efectivoContado: s.turnosCaja.efectivoContado,
      diferencia: s.turnosCaja.diferencia, notasCierre: s.turnosCaja.notasCierre, cerradoPor: s.usuarios.nombre,
      verificacion: s.turnosCaja.verificacion, abiertoPor: s.turnosCaja.abiertoPor, cerradoPorId: s.turnosCaja.cerradoPor,
    })
    .from(s.turnosCaja)
    .leftJoin(s.usuarios, eq(s.usuarios.id, s.turnosCaja.cerradoPor))
    .where(and(eq(s.turnosCaja.barberiaId, barberiaId), eq(s.turnosCaja.estado, "cerrado"), isNotNull(s.turnosCaja.cerradoEn),
      ...(rango ? [gte(s.turnosCaja.fechaOperativa, rango.desde), lte(s.turnosCaja.fechaOperativa, rango.hasta)] : [])))
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

/** Cuántos días distintos tienen ventas (hasta 2 basta para saber si ya hay historia). */
export async function diasConVentas(barberiaId: string, zona: string, barberoId?: string) {
  const dia = sql<string>`to_char(${s.ventas.creadoEn} at time zone ${zona}, 'YYYY-MM-DD')`;
  const q = db.selectDistinct({ d: dia }).from(s.ventas);
  const filas = barberoId
    ? await q.innerJoin(s.conceptos, eq(s.conceptos.ventaId, s.ventas.id)).where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"), eq(s.conceptos.barberoId, barberoId))).limit(2)
    : await q.where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"))).limit(2);
  return filas.length;
}

/** Folio del corte: el número de turno de caja en orden de apertura (C-000012). Nunca se repite. */
export async function folioCorte(barberiaId: string, abiertoEn: Date) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.turnosCaja)
    .where(and(eq(s.turnosCaja.barberiaId, barberiaId), lte(s.turnosCaja.abiertoEn, abiertoEn)));
  return `C-${String(n).padStart(6, "0")}`;
}

/** Folios de corte para varios turnos a la vez. */
export async function foliosCorte(barberiaId: string) {
  const filas = await db.select({ id: s.turnosCaja.id }).from(s.turnosCaja).where(eq(s.turnosCaja.barberiaId, barberiaId)).orderBy(asc(s.turnosCaja.abiertoEn));
  return new Map(filas.map((f, i) => [f.id, `C-${String(i + 1).padStart(6, "0")}`]));
}

/** Para el historial de cortes: cobros por método, propinas y movimientos de cada turno. */
export async function detalleCortes(barberiaId: string, turnoIds: string[]) {
  if (turnoIds.length === 0) return { cobros: [], propinas: [], movimientos: [], gastos: [] };
  const [cobros, props, movimientos, gastos] = await Promise.all([
    db.select({ turnoId: s.ventas.turnoId, metodo: s.pagos.nombreMetodo, esEfectivo: s.pagos.esEfectivo, total: sql<number>`coalesce(sum(${s.pagos.monto}),0)::int`, ventas: sql<number>`count(distinct ${s.ventas.id})::int` })
      .from(s.pagos).innerJoin(s.ventas, eq(s.ventas.id, s.pagos.ventaId))
      .where(and(eq(s.ventas.barberiaId, barberiaId), inArray(s.ventas.turnoId, turnoIds), eq(s.ventas.estado, "pagada")))
      .groupBy(s.ventas.turnoId, s.pagos.nombreMetodo, s.pagos.esEfectivo),
    db.select({ turnoId: s.ventas.turnoId, efectivo: sql<number>`coalesce(sum(case when ${s.propinas.esEfectivo} then ${s.propinas.monto} else 0 end),0)::int` })
      .from(s.propinas).innerJoin(s.ventas, eq(s.ventas.id, s.propinas.ventaId))
      .where(and(eq(s.ventas.barberiaId, barberiaId), inArray(s.ventas.turnoId, turnoIds), eq(s.ventas.estado, "pagada")))
      .groupBy(s.ventas.turnoId),
    db.select({ turnoId: s.movimientosCaja.turnoId, tipo: s.movimientosCaja.tipo, monto: s.movimientosCaja.monto, concepto: s.movimientosCaja.concepto, creadoEn: s.movimientosCaja.creadoEn, usuario: s.usuarios.nombre })
      .from(s.movimientosCaja).innerJoin(s.usuarios, eq(s.usuarios.id, s.movimientosCaja.usuarioId))
      .where(and(eq(s.movimientosCaja.barberiaId, barberiaId), inArray(s.movimientosCaja.turnoId, turnoIds))),
    db.select({ turnoId: s.gastos.turnoId, monto: s.gastos.monto, concepto: s.gastos.concepto, creadoEn: s.gastos.creadoEn, usuario: s.usuarios.nombre })
      .from(s.gastos).innerJoin(s.usuarios, eq(s.usuarios.id, s.gastos.usuarioId))
      .where(and(eq(s.gastos.barberiaId, barberiaId), inArray(s.gastos.turnoId, turnoIds), isNull(s.gastos.canceladoEn))),
  ]);
  return { cobros, propinas: props, movimientos, gastos };
}

/** Categorías de egresos de la barbería, en su orden. */
export async function categoriasGasto(barberiaId: string, soloActivas = true) {
  return db.select({ id: s.categoriasGasto.id, nombre: s.categoriasGasto.nombre, activo: s.categoriasGasto.activo })
    .from(s.categoriasGasto)
    .where(and(eq(s.categoriasGasto.barberiaId, barberiaId), ...(soloActivas ? [eq(s.categoriasGasto.activo, true)] : [])))
    .orderBy(asc(s.categoriasGasto.orden), asc(s.categoriasGasto.nombre));
}

/** Días con ventas (del más reciente al más viejo) y totales, con las mismas condiciones que la lista. */
export async function diasYTotalVentas(barberiaId: string, zona: string, f: { desde?: string; hasta?: string; persona: string; condiciones: SQL[] }) {
  const dia = sql<string>`to_char(${s.ventas.creadoEn} at time zone ${zona}, 'YYYY-MM-DD')`;
  const cond = and(
    eq(s.ventas.barberiaId, barberiaId),
    ...(f.desde && f.hasta ? [sql`(${s.ventas.creadoEn} at time zone ${zona})::date between ${f.desde}::date and ${f.hasta}::date`] : []),
    ...f.condiciones,
  );
  const monto = f.persona
    ? sql<number>`coalesce(sum(case when ${s.ventas.estado} = 'pagada' then (select coalesce(sum(c.precio_cobrado),0) from ${s.conceptos} c where c.venta_id = ${s.ventas.id} and c.barbero_id = ${f.persona}) else 0 end),0)::int`
    : sql<number>`coalesce(sum(case when ${s.ventas.estado} = 'pagada' then ${s.ventas.total} else 0 end),0)::int`;
  const [dias, [t]] = await Promise.all([
    db.select({ d: dia }).from(s.ventas).where(cond).groupBy(sql`1`).orderBy(sql`1 desc`),
    db.select({ n: sql<number>`count(*) filter (where ${s.ventas.estado} = 'pagada')::int`, monto }).from(s.ventas).where(cond),
  ]);
  return { dias: dias.map((x) => x.d), ventas: t.n, monto: t.monto };
}

/** Para filtrar historiales: el equipo activo más quien ya no está pero tiene ventas registradas. */
export async function equipoConVentas(barberiaId: string) {
  return db
    .select({ id: s.usuarios.id, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
    .from(s.usuarios)
    .where(and(eq(s.usuarios.barberiaId, barberiaId), sql`(
      (${s.usuarios.activo} and ${s.usuarios.rol} in ('barbera', 'encargada'))
      or exists (select 1 from ${s.conceptos} c where c.barbero_id = ${s.usuarios.id}))`))
    .orderBy(asc(s.usuarios.nombre));
}

/** La meta diaria de cada barbero y del negocio, a partir de la meta mensual. Null si no hay meta mensual. */
export async function metasDelMes(barberiaId: string, metaMensual: number, zona: string, hoy: string) {
  if (!metaMensual) return null;
  const d = await datosParaMeta(barberiaId, zona, hoy);
  return metaDelNegocio(metaMensual, d.egresos, d.barberos, d.dias);
}

/** Lo que se necesita para calcular la meta: egresos de un mes normal, cómo se le paga a cada quien y cuánto trabaja. */
export async function datosParaMeta(barberiaId: string, zona: string, hoy: string) {
  const desde60 = sumarDias(hoy, -60);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const hace3 = `${sumarDias(inicioMes, -85).slice(0, 7)}-01`;
  const [equipo, reglas, ventas, [g], hist] = await Promise.all([
    equipoQueAtiende(barberiaId),
    db.select().from(s.reglasComision).where(and(eq(s.reglasComision.barberiaId, barberiaId), isNull(s.reglasComision.vigenteHasta), isNull(s.reglasComision.servicioId))),
    db.select({ id: s.conceptos.barberoId, monto: sql<number>`sum(${s.conceptos.precioCobrado})::int`, n: sql<number>`count(*)::int` })
      .from(s.conceptos).innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
      .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"), sql`(${s.ventas.creadoEn} at time zone ${zona})::date >= ${desde60}::date`))
      .groupBy(s.conceptos.barberoId),
    db.select({ total: sql<number>`coalesce(sum(${s.gastos.monto}),0)::int`, meses: sql<number>`count(distinct to_char(${s.gastos.fecha}, 'YYYY-MM'))::int` })
      .from(s.gastos).where(and(eq(s.gastos.barberiaId, barberiaId), gte(s.gastos.fecha, hace3), lte(s.gastos.fecha, sumarDias(inicioMes, -1)), isNull(s.gastos.canceladoEn))),
    db.select({ egresos: s.historicoMensual.egresos }).from(s.historicoMensual).where(eq(s.historicoMensual.barberiaId, barberiaId)).orderBy(desc(s.historicoMensual.mes)).limit(3),
  ]);
  // Egresos de un mes normal: el promedio de los últimos meses registrados; si aún no hay, lo del Excel.
  const egresos = g.meses > 0 ? Math.round(g.total / g.meses) : hist.length ? Math.round(hist.reduce((a, h) => a + h.egresos, 0) / hist.length) : 0;
  const barberos: BarberoMeta[] = equipo.map((e) => {
    const r = reglas.find((x) => x.barberoId === e.id);
    const v = ventas.find((x) => x.id === e.id);
    return {
      id: e.id, nombre: e.nombre, tipo: r?.tipo ?? null, porcentaje: r?.porcentaje ?? 0, montoFijo: r?.montoFijo ?? 0,
      mensual: r ? Math.round((porSemana(r.montoSemanal, r.periodo) * 52) / 12) : 0,
      peso: v?.monto ?? 0, ticket: v && v.n ? Math.round(v.monto / v.n) : 0,
    };
  });
  return { egresos, barberos, dias: diasHabilesDelMes(hoy.slice(0, 7)) };
}
