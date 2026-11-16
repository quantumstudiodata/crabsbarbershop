import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { esPagoAnulado, esPagoEquipo, esPropinaEntregada } from "@/lib/caja";
import { cobradoresDe } from "@/lib/faltantes";
import { ajustesDeTurnos, detalleCortes, metodosActivos, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaCorta, fechaLarga, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import type { Corte } from "./HistorialCortes";

type Turno = Awaited<ReturnType<typeof turnosCerrados>>[number];
type Persona = { id: string; nombre: string; avatar: string; activo: boolean };

/**
 * Arma el comprobante completo de cada corte (cobros, efectivo, movimientos, evidencias y ajustes).
 * Lo usa Movimientos, donde cada corte se abre a un lado sin salir de la página.
 */
export async function armarCortes(barberiaId: string, turnos: Turno[], o: { zona: string; hoy: string; gente: Persona[]; folios: Map<string, string>; verEgresos: boolean }) {
  if (!turnos.length) return [];
  const ids = turnos.map((c) => c.id);
  const [ajustes, det, evid, activos] = await Promise.all([
    ajustesDeTurnos(barberiaId, ids), detalleCortes(barberiaId, ids),
    db.select({ id: schema.evidenciasCorte.id, turnoId: schema.evidenciasCorte.turnoId, etiqueta: schema.evidenciasCorte.etiqueta, nombre: schema.evidenciasCorte.nombre, tipo: schema.evidenciasCorte.tipo })
      .from(schema.evidenciasCorte).where(and(eq(schema.evidenciasCorte.barberiaId, barberiaId), inArray(schema.evidenciasCorte.turnoId, ids))),
    metodosActivos(barberiaId),
  ]);
  // Gastos de esos días pagados con transferencia o tarjeta: no tocan el efectivo, pero se informan junto al corte.
  const fechas = [...new Set(turnos.map((c) => c.fechaOperativa))];
  const otrosEgresos = o.verEgresos ? await db.select({ fecha: schema.gastos.fecha, concepto: schema.gastos.concepto, metodo: schema.gastos.metodo, monto: schema.gastos.monto }).from(schema.gastos)
    .where(and(eq(schema.gastos.barberiaId, barberiaId), inArray(schema.gastos.fecha, fechas), isNull(schema.gastos.turnoId), ne(schema.gastos.metodo, "efectivo"), isNull(schema.gastos.canceladoEn))) : [];
  const { zona, hoy, gente, folios } = o;
  const persona = (id: string | null) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  return turnos.map((c): Corte => {
    const cobros = det.cobros.filter((x) => x.turnoId === c.id);
    const efectivo = cobros.filter((x) => x.esEfectivo).reduce((a, x) => a + x.total, 0);
    const otros = cobros.filter((x) => !x.esEfectivo).map((x) => ({ metodo: x.metodo, total: x.total }));
    for (const m of activos) if (!m.esEfectivo && !otros.some((x) => x.metodo === m.nombre)) otros.push({ metodo: m.nombre, total: 0 });
    const metodos = [{ metodo: "Efectivo", total: efectivo }, ...otros];
    const movs = det.movimientos.filter((x) => x.turnoId === c.id);
    const gastos = det.gastos.filter((x) => x.turnoId === c.id);
    const suma = (t: string) => movs.filter((x) => x.tipo === t).reduce((a, x) => a + x.monto, 0);
    const anulados = movs.filter((x) => x.tipo === "entrada" && esPagoAnulado(x.concepto)).reduce((a, x) => a + x.monto, 0);
    const propinasEnt = movs.filter((x) => x.tipo === "retiro" && esPropinaEntregada(x.concepto)).reduce((a, x) => a + x.monto, 0);
    const pagosEquipo = movs.filter((x) => x.tipo === "retiro" && esPagoEquipo(x.concepto)).reduce((a, x) => a + x.monto, 0) - anulados;
    return {
      id: c.id, folio: folios.get(c.id) ?? "", dia: fechaLarga(c.fechaOperativa), fechaCorta: c.fechaOperativa === hoy ? "Hoy" : fechaCorta(c.fechaOperativa),
      horario: `${horaCorta(c.abiertoEn, zona)} a ${c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}`,
      abrio: persona(c.abiertoPor), cerro: (() => { const x = persona(c.cerradoPorId); return x.nombre ? x : { nombre: c.cerradoPor ?? "", avatar: "iniciales" }; })(),
      metodos, total: metodos.reduce((a, x) => a + x.total, 0), ventas: cobros.reduce((a, x) => Math.max(a, x.ventas), 0),
      fondo: c.fondoInicial, ventasEfectivo: efectivo, propinasEfectivo: det.propinas.find((x) => x.turnoId === c.id)?.efectivo ?? 0,
      entradas: suma("entrada") - anulados, retiros: suma("retiro") + suma("devolucion") - pagosEquipo - anulados - propinasEnt, pagosEquipo, propinasEnt, gastos: gastos.reduce((a, x) => a + x.monto, 0),
      otrosEgresos: otrosEgresos.filter((x) => x.fecha === c.fechaOperativa).map((x) => ({ concepto: x.concepto, metodo: x.metodo === "tarjeta" ? "Tarjeta" : "Transferencia", monto: x.monto })),
      esperado: c.efectivoEsperado ?? 0, contado: c.efectivoContado ?? 0, diferencia: c.diferencia ?? 0, ajustado: ajustes.filter((x) => x.turnoId === c.id).reduce((a, x) => a + x.monto, 0), notas: c.notasCierre,
      movimientos: [
        ...movs.map((m) => ({ t: m.creadoEn.getTime(), hora: horaCorta(m.creadoEn, zona), titulo: m.tipo === "retiro" ? (esPropinaEntregada(m.concepto) ? "Propinas entregadas" : esPagoEquipo(m.concepto) ? "Pago al equipo" : "Dinero que se sacó") : m.tipo === "entrada" ? (esPagoAnulado(m.concepto) ? "Pago anulado, el dinero regresó" : "Dinero que se puso") : "Devolución", detalle: `${m.concepto}, ${m.usuario.split(" ")[0]}`, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
        ...gastos.map((g) => ({ t: g.creadoEn.getTime(), hora: horaCorta(g.creadoEn, zona), titulo: "Gasto pagado con la caja", detalle: `${g.concepto}, ${g.usuario.split(" ")[0]}`, monto: -g.monto })),
      ].sort((a, b) => a.t - b.t),
      evidencias: evid.filter((x) => x.turnoId === c.id).map((x) => ({ id: x.id, etiqueta: x.etiqueta, nombre: x.nombre, tipo: x.tipo })),
      ajustes: ajustes.filter((x) => x.turnoId === c.id).map((x) => `Ajuste de ${formatoDinero(x.monto)} por ${x.usuario.split(" ")[0]}: ${x.motivo}`),
    };
  });
}

/** Cortes con faltante de los últimos 30 días que nadie ha revisado, con lo necesario para decidir. */
export async function cortesPorRevisar(barberiaId: string, todos: Turno[], o: Parameters<typeof armarCortes>[2] & { desde: string }) {
  const revisar = todos.filter((c) => (c.diferencia ?? 0) < 0 && !c.revisadoEn && c.fechaOperativa >= o.desde);
  const armados = await armarCortes(barberiaId, revisar, o);
  const persona = (id: string) => o.gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  return Promise.all(armados.map(async (c, i) => ({
    ...c, abrioId: revisar[i].abiertoPor,
    cobradores: (await cobradoresDe(barberiaId, c.id)).map((x) => ({ ...x, nombre: persona(x.id).nombre, avatar: persona(x.id).avatar })),
    equipo: o.gente.filter((g) => g.activo).map(({ id, nombre, avatar }) => ({ id, nombre, avatar })),
  })));
}
