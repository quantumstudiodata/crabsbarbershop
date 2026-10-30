import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { diaDeSemana, finDeMes, lunesDe, sumarDias } from "./fechas";
import { MESES } from "./periodo";

// La "libreta" reproduce lo que la contadora llevaba en Excel: por día y por barbero lo cobrado,
// primero quienes ganan por comisión (su suma es el Subtotal), luego quienes tienen pago fijo (todo junto es el Total).

export type Columna = { clave: string; nombre: string; comision: boolean };
export type DiaLibreta = { fecha: string; etiqueta: string; valores: Record<string, number>; subtotal: number; total: number };
export type SemanaLibreta = { numero: number; dias: DiaLibreta[]; valores: Record<string, number>; subtotal: number; total: number };
export type MesLibreta = {
  mes: string; titulo: string; columnas: Columna[]; semanas: SemanaLibreta[];
  egresos: { concepto: string; monto: number }[]; egresosTotal: number;
  subtotal: number; total: number; comisionesGeneradas: number; historico: boolean;
};
export type FilaAnio = { mes: string; nombre: string; subtotal: number; egresos: number; total: number; origen: "historico" | "sistema" | "vacio" };

const DIA_NOMBRE = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ES_COMISION = new Set(["porcentaje", "fijo", "mixto"]);
const suma = (o: Record<string, number>, claves: string[]) => claves.reduce((a, k) => a + (o[k] ?? 0), 0);

/** Lo cobrado por servicio (ya con descuentos, sin propinas) por día y barbero. */
async function cobradoPorDia(barberiaId: string, desde: string, hasta: string, zona: string) {
  const dia = sql<string>`to_char(${s.ventas.creadoEn} at time zone ${zona}, 'YYYY-MM-DD')`;
  return db
    .select({ fecha: dia, barberoId: s.conceptos.barberoId, monto: sql<number>`sum(${s.conceptos.precioCobrado})::int`, comision: sql<number>`sum(${s.conceptos.comision})::int` })
    .from(s.conceptos)
    .innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
    .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.estado, "pagada"),
      sql`(${s.ventas.creadoEn} at time zone ${zona})::date between ${desde}::date and ${hasta}::date`))
    .groupBy(sql`1`, s.conceptos.barberoId);
}

/** Columnas del mes: quienes cobraron algo y quienes siguen activos, primero los de comisión. */
async function columnas(barberiaId: string, conVentas: string[]): Promise<Columna[]> {
  const gente = await db.select({ id: s.usuarios.id, nombre: s.usuarios.nombre, activo: s.usuarios.activo, rol: s.usuarios.rol })
    .from(s.usuarios).where(eq(s.usuarios.barberiaId, barberiaId)).orderBy(asc(s.usuarios.nombre));
  const reglas = await db.select({ barberoId: s.reglasComision.barberoId, tipo: s.reglasComision.tipo }).from(s.reglasComision)
    .where(and(eq(s.reglasComision.barberiaId, barberiaId), isNull(s.reglasComision.vigenteHasta), isNull(s.reglasComision.servicioId)));
  const cols = gente
    .filter((g) => conVentas.includes(g.id) || (g.activo && (g.rol === "barbera" || g.rol === "encargada")))
    .map((g) => ({ clave: g.id, nombre: g.nombre.split(" ")[0], comision: ES_COMISION.has(reglas.find((r) => r.barberoId === g.id)?.tipo ?? "") }));
  // Si dos se llaman igual, se agrega la inicial del apellido.
  for (const c of cols) if (cols.filter((x) => x.nombre === c.nombre).length > 1) {
    const g = gente.find((x) => x.id === c.clave)!;
    c.nombre = `${c.nombre} ${g.nombre.split(" ")[1]?.[0] ?? ""}`.trim();
  }
  return [...cols.filter((c) => c.comision), ...cols.filter((c) => !c.comision)];
}

async function egresosDelMes(barberiaId: string, desde: string, hasta: string, zona: string) {
  const [gastos, pagos] = await Promise.all([
    db.select({ categoria: s.gastos.categoria, monto: sql<number>`sum(${s.gastos.monto})::int` }).from(s.gastos)
      .where(and(eq(s.gastos.barberiaId, barberiaId), gte(s.gastos.fecha, desde), lte(s.gastos.fecha, hasta), isNull(s.gastos.canceladoEn)))
      .groupBy(s.gastos.categoria),
    db.select({ monto: sql<number>`coalesce(sum(${s.pagosComision.monto}),0)::int` }).from(s.pagosComision)
      .where(and(eq(s.pagosComision.barberiaId, barberiaId), eq(s.pagosComision.tipo, "pago"),
        sql`(${s.pagosComision.creadoEn} at time zone ${zona})::date between ${desde}::date and ${hasta}::date`)),
  ]);
  const cats = await db.select({ nombre: s.categoriasGasto.nombre, orden: s.categoriasGasto.orden }).from(s.categoriasGasto).where(eq(s.categoriasGasto.barberiaId, barberiaId));
  const orden = (n: string) => cats.find((c) => c.nombre === n)?.orden ?? 98;
  const lista = gastos.sort((a, b) => orden(a.categoria) - orden(b.categoria)).map((g) => ({ concepto: g.categoria, monto: g.monto }));
  if (pagos[0].monto) lista.push({ concepto: "Pagos al equipo", monto: pagos[0].monto });
  return lista;
}

const etiquetaDia = (f: string) => `${DIA_NOMBRE[diaDeSemana(f)]} ${Number(f.slice(8))}-${MES_CORTO[Number(f.slice(5, 7)) - 1]}`;

export async function libretaMes(barberiaId: string, ym: string, zona: string): Promise<MesLibreta> {
  const desde = `${ym}-01`;
  const hasta = finDeMes(desde);
  const [cobros, egresos, [hist]] = await Promise.all([
    cobradoPorDia(barberiaId, desde, hasta, zona),
    egresosDelMes(barberiaId, desde, hasta, zona),
    db.select().from(s.historicoMensual).where(and(eq(s.historicoMensual.barberiaId, barberiaId), eq(s.historicoMensual.mes, ym))),
  ]);
  const cols = await columnas(barberiaId, [...new Set(cobros.map((c) => c.barberoId))]);
  const conComision = cols.filter((c) => c.comision).map((c) => c.clave);
  const todas = cols.map((c) => c.clave);
  const semanas: SemanaLibreta[] = [];
  for (let l = lunesDe(desde), n = 1; l <= hasta; l = sumarDias(l, 7), n++) {
    const dias: DiaLibreta[] = [];
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(l, i);
      if (f < desde || f > hasta) continue;
      const valores: Record<string, number> = {};
      for (const c of cobros.filter((x) => x.fecha === f)) valores[c.barberoId] = (valores[c.barberoId] ?? 0) + c.monto;
      // El domingo solo aparece si hubo cobros.
      if (i === 6 && suma(valores, todas) === 0) continue;
      dias.push({ fecha: f, etiqueta: etiquetaDia(f), valores, subtotal: suma(valores, conComision), total: suma(valores, todas) });
    }
    if (!dias.length) { n--; continue; }
    const valores: Record<string, number> = {};
    for (const d of dias) for (const k of todas) valores[k] = (valores[k] ?? 0) + (d.valores[k] ?? 0);
    semanas.push({ numero: n, dias, valores, subtotal: suma(valores, conComision), total: suma(valores, todas) });
  }
  const subtotal = semanas.reduce((a, x) => a + x.subtotal, 0);
  const total = semanas.reduce((a, x) => a + x.total, 0);
  const usaHistorico = !!hist;
  return {
    mes: ym, titulo: `${MESES[Number(ym.slice(5, 7)) - 1].toUpperCase()} ${ym.slice(0, 4)}`, columnas: cols, semanas,
    egresos: usaHistorico && !egresos.length ? [{ concepto: "Egresos del mes", monto: hist.egresos }] : egresos,
    egresosTotal: usaHistorico && !egresos.length ? hist.egresos : egresos.reduce((a, x) => a + x.monto, 0),
    subtotal: usaHistorico ? hist.subtotal : subtotal, total: usaHistorico ? hist.total : total,
    comisionesGeneradas: cobros.filter((c) => conComision.includes(c.barberoId)).reduce((a, c) => a + c.comision, 0),
    historico: usaHistorico,
  };
}

/** Los 12 meses del año. Los meses que se llevaron en Excel salen de ahí; los demás, del sistema. */
export async function libretaAnio(barberiaId: string, y: string, zona: string): Promise<FilaAnio[]> {
  const [hist, cobros] = await Promise.all([
    db.select().from(s.historicoMensual).where(and(eq(s.historicoMensual.barberiaId, barberiaId), sql`${s.historicoMensual.mes} like ${`${y}-%`}`)),
    cobradoPorDia(barberiaId, `${y}-01-01`, `${y}-12-31`, zona),
  ]);
  const cols = await columnas(barberiaId, [...new Set(cobros.map((c) => c.barberoId))]);
  const conComision = new Set(cols.filter((c) => c.comision).map((c) => c.clave));
  const filas: FilaAnio[] = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const delMes = cobros.filter((c) => c.fecha.startsWith(ym));
    const total = delMes.reduce((a, c) => a + c.monto, 0);
    const h = hist.find((x) => x.mes === ym);
    const nombre = MESES[m - 1].toUpperCase();
    if (h) { filas.push({ mes: ym, nombre, subtotal: h.subtotal, egresos: h.egresos, total: h.total, origen: "historico" }); continue; }
    const egresos = total ? (await egresosDelMes(barberiaId, `${ym}-01`, finDeMes(`${ym}-01`), zona)).reduce((a, x) => a + x.monto, 0) : 0;
    filas.push({ mes: ym, nombre, subtotal: delMes.filter((c) => conComision.has(c.barberoId)).reduce((a, c) => a + c.monto, 0), egresos, total, origen: total ? "sistema" : "vacio" });
  }
  return filas;
}

/** Lo de cada barbero por mes en un año (la hoja "A y B"). */
export async function libretaBarberos(barberiaId: string, y: string, zona: string) {
  const [hist, cobros] = await Promise.all([
    db.select().from(s.historicoMensual).where(and(eq(s.historicoMensual.barberiaId, barberiaId), sql`${s.historicoMensual.mes} like ${`${y}-%`}`)),
    cobradoPorDia(barberiaId, `${y}-01-01`, `${y}-12-31`, zona),
  ]);
  const cols = await columnas(barberiaId, [...new Set(cobros.map((c) => c.barberoId))]);
  const conVentas = new Set(cobros.map((c) => c.barberoId));
  const usadas: Columna[] = cols.filter((c) => conVentas.has(c.clave));
  // Columnas del Excel (A, B...) para los meses que se llevaron a mano.
  const claves = [...new Set(hist.flatMap((h) => Object.keys(h.porColumna as Record<string, number>)))].sort();
  const historicas: Columna[] = claves.map((k) => ({ clave: `hist:${k}`, nombre: k, comision: true }));
  const columnasTodas = [...historicas, ...usadas];
  const meses = Array.from({ length: 12 }, (_, i) => {
    const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
    const valores: Record<string, number> = {};
    for (const c of cobros.filter((x) => x.fecha.startsWith(ym))) valores[c.barberoId] = (valores[c.barberoId] ?? 0) + c.monto;
    const h = hist.find((x) => x.mes === ym);
    if (h) for (const k of Object.keys(valores)) delete valores[k];
    if (h) for (const [k, v] of Object.entries(h.porColumna as Record<string, number>)) valores[`hist:${k}`] = v;
    return { mes: ym, nombre: `${MESES[i].toUpperCase()} ${y.slice(2)}`, valores, total: Object.values(valores).reduce((a, x) => a + x, 0) };
  });
  return { columnas: columnasTodas, meses };
}

/** Años con datos, del más reciente al más viejo, para los selectores. */
export async function aniosConDatos(barberiaId: string, hoy: string) {
  const h = await db.select({ mes: s.historicoMensual.mes }).from(s.historicoMensual).where(eq(s.historicoMensual.barberiaId, barberiaId));
  const anios = new Set([hoy.slice(0, 4), ...h.map((x) => x.mes.slice(0, 4))]);
  return [...anios].sort().reverse();
}

