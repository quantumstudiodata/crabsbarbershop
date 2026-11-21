import { and, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { esAcumulado, esLlevoDuena, esPagoAnulado, esPagoEquipo, esPropinaEntregada } from "@/lib/caja";
import { cobradoresDe } from "@/lib/faltantes";
import { ajustesDeTurnos, detalleCortes, metodosActivos, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { cuentaDuena } from "@/lib/duena";
import { fechaCorta, fechaLarga, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import type { Corte } from "./HistorialCortes";

type Turno = Awaited<ReturnType<typeof turnosCerrados>>[number];
type Persona = { id: string; nombre: string; avatar: string; activo: boolean };

/**
 * Arma el comprobante completo de cada corte (cobros, efectivo, movimientos, evidencias y ajustes).
 * Lo usa Movimientos, donde cada corte se abre a un lado sin salir de la página.
 */
export async function armarCortes(barberiaId: string, turnos: Turno[], o: { zona: string; hoy: string; gente: Persona[]; folios: Map<string, string>; verEgresos: boolean; /** Todos los cortes, para saber de qué corte viene un pendiente. */ todos?: Turno[] }) {
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
  // Lo que se decidió en cada cierre y no salió de la caja (por transferencia o para el próximo corte): se informa en el detalle,
  // y lo que quedó pendiente se muestra en el desglose del corte. Si un pendiente sigue sin pagarse, vuelve a salir en el corte siguiente
  // y dice desde qué corte viene.
  const cerrados = turnos.map((c) => c.cerradoEn).filter((x): x is Date => !!x).map((x) => x.getTime());
  const cierres = cerrados.length ? await db.select({ creadoEn: schema.historial.creadoEn, detalle: schema.historial.detalle }).from(schema.historial)
    .where(and(eq(schema.historial.barberiaId, barberiaId), eq(schema.historial.tipo, "caja"), sql`${schema.historial.detalle} ? 'comisiones'`,
      lte(schema.historial.creadoEn, new Date(Math.max(...cerrados) + 5 * 60000))))
    .orderBy(desc(schema.historial.creadoEn)).limit(Math.max(60, turnos.length + 30)) : [];
  const todos = o.todos ?? turnos;
  const leer = (h: (typeof cierres)[number] | undefined) => [...String((h?.detalle as { comisiones?: string } | undefined)?.comisiones ?? "")
    .matchAll(/([^,]+?) \$([\d,]+(?:\.\d{1,2})?) (por transferencia|para el próximo corte)(?: \(([^)]*)\))?/g)]
    .map((m) => ({ nombre: m[1].trim(), monto: Math.round(Number(m[2].replace(/,/g, "")) * 100), como: m[3], dias: m[4] ?? "" }));
  // El cierre se anota en el historial justo al cerrar la caja: se toma el más cercano (dos cortes pueden cerrarse con minutos de diferencia).
  const cercano = <T,>(lista: T[], hora: (x: T) => number, t: number) => {
    let mejor = -1, dif = 5 * 60000;
    lista.forEach((x, i) => { const d = Math.abs(hora(x) - t); if (d < dif) { dif = d; mejor = i; } });
    return mejor;
  };
  const turnoDe = (h: (typeof cierres)[number]) => {
    const conCierre = todos.filter((x) => x.cerradoEn);
    const k = cercano(conCierre, (x) => x.cerradoEn!.getTime(), h.creadoEn.getTime());
    return k >= 0 ? conCierre[k].id : undefined;
  };
  const fueraDe = (cerradoEn: Date | null) => {
    if (!cerradoEn) return [];
    const i = cercano(cierres, (x) => x.creadoEn.getTime(), cerradoEn.getTime());
    if (i < 0) return [];
    return leer(cierres[i]).map((x) => {
      if (x.como !== "para el próximo corte") return x;
      // Se busca hacia atrás mientras el mismo pendiente (persona, monto y días) siga apareciendo: el más viejo es donde se quedó.
      let origen = turnoDe(cierres[i]);
      for (let k = i + 1; k < cierres.length; k++) {
        // La misma comisión (persona y días); si se pagó una parte, el monto que sigue pendiente baja, pero es la misma.
        if (!leer(cierres[k]).some((y) => y.como === x.como && y.nombre === x.nombre && y.dias === x.dias && (x.dias ? y.monto >= x.monto : y.monto === x.monto))) break;
        origen = turnoDe(cierres[k]) ?? origen;
      }
      return { ...x, origen };
    });
  };
  // Lo que vendió y le tocó a cada quien en cada turno, y lo que quedó pendiente para la dueña.
  const [porPersona, acumulados, cuentaNeg] = await Promise.all([
    db.select({ turnoId: schema.ventas.turnoId, barberoId: schema.conceptos.barberoId, vendio: sql<number>`coalesce(sum(${schema.conceptos.precioCobrado}),0)::int`, toca: sql<number>`coalesce(sum(${schema.conceptos.comision}),0)::int` })
      .from(schema.conceptos).innerJoin(schema.ventas, eq(schema.ventas.id, schema.conceptos.ventaId))
      .where(and(eq(schema.ventas.barberiaId, barberiaId), inArray(schema.ventas.turnoId, ids), eq(schema.ventas.estado, "pagada")))
      .groupBy(schema.ventas.turnoId, schema.conceptos.barberoId),
    db.select({ turnoId: schema.negocioDuena.turnoId, monto: schema.negocioDuena.monto }).from(schema.negocioDuena)
      .where(and(eq(schema.negocioDuena.barberiaId, barberiaId), eq(schema.negocioDuena.tipo, "acumulado"), inArray(schema.negocioDuena.turnoId, ids), isNull(schema.negocioDuena.anuladoEn))),
    cuentaDuena(barberiaId),
  ]);
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
    const negocio = movs.filter((x) => x.tipo === "retiro" && (esAcumulado(x.concepto) || esLlevoDuena(x.concepto))).reduce((a, x) => a + x.monto, 0);
    return {
      id: c.id, folio: folios.get(c.id) ?? "", dia: fechaLarga(c.fechaOperativa), fechaCorta: c.fechaOperativa === hoy ? "Hoy" : fechaCorta(c.fechaOperativa),
      horario: `${horaCorta(c.abiertoEn, zona)} a ${c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}`,
      abrio: persona(c.abiertoPor), cerro: (() => { const x = persona(c.cerradoPorId); return x.nombre ? x : { nombre: c.cerradoPor ?? "", avatar: "iniciales" }; })(),
      metodos, total: metodos.reduce((a, x) => a + x.total, 0), ventas: cobros.reduce((a, x) => Math.max(a, x.ventas), 0),
      fondo: c.fondoInicial, ventasEfectivo: efectivo, propinasEfectivo: det.propinas.find((x) => x.turnoId === c.id)?.efectivo ?? 0,
      entradas: suma("entrada") - anulados, retiros: suma("retiro") + suma("devolucion") - pagosEquipo - anulados - propinasEnt - negocio, negocio, pagosEquipo, propinasEnt, gastos: gastos.reduce((a, x) => a + x.monto, 0),
      otrosEgresos: otrosEgresos.filter((x) => x.fecha === c.fechaOperativa).map((x) => ({ concepto: x.concepto, metodo: x.metodo === "tarjeta" ? "Tarjeta" : "Transferencia", monto: x.monto })),
      esperado: c.efectivoEsperado ?? 0, contado: c.efectivoContado ?? 0, diferencia: c.diferencia ?? 0, ajustado: ajustes.filter((x) => x.turnoId === c.id).reduce((a, x) => a + x.monto, 0), notas: c.notasCierre,
      movimientos: [
        ...movs.map((m) => ({ t: m.creadoEn.getTime(), tipo: m.tipo, hora: horaCorta(m.creadoEn, zona), titulo: m.tipo === "retiro" ? (esPropinaEntregada(m.concepto) ? "Propinas entregadas" : esPagoEquipo(m.concepto) ? "Pago al equipo" : esAcumulado(m.concepto) ? "Negocio, pendiente de depositar a la dueña" : esLlevoDuena(m.concepto) ? "La dueña se llevó efectivo" : "Dinero que se sacó") : m.tipo === "entrada" ? (esPagoAnulado(m.concepto) ? "Pago anulado, el dinero regresó" : "Dinero que se puso") : "Devolución", detalle: esPagoEquipo(m.concepto) ? m.concepto.replace(/^Pago (de comisiones )?a /, "Comisión de ") : m.concepto, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
        ...gastos.map((g) => ({ t: g.creadoEn.getTime(), tipo: "gasto", hora: horaCorta(g.creadoEn, zona), titulo: "Gasto pagado con la caja", detalle: g.concepto, monto: -g.monto })),
      ].sort((a, b) => a.t - b.t),
      fueraCaja: fueraDe(c.cerradoEn),
      reparto: (() => {
        const fuera = fueraDe(c.cerradoEn);
        // Quien vendió en el turno, y quien no vendió pero recibió algo en el corte (comisiones de días anteriores).
        const vendieron = porPersona.filter((x) => x.turnoId === c.id && x.barberoId);
        const nombres = new Set(vendieron.map((x) => persona(x.barberoId).nombre.split(" ")[0]));
        const sinVenta = [...new Set([...movs.filter((m) => m.tipo === "retiro" && esPagoEquipo(m.concepto)).map((m) => m.concepto.replace(/^Pago (de comisiones )?a /, "")), ...fuera.map((y) => y.nombre)])]
          .filter((n) => n && !nombres.has(n)).map((n) => ({ nombre: n, vendio: 0, toca: 0 }));
        const personas = [...vendieron.map((x) => ({ nombre: persona(x.barberoId).nombre.split(" ")[0], vendio: x.vendio, toca: x.toca })), ...sinVenta].map((x) => {
          const nombre = x.nombre;
          const pagos = movs.filter((m) => m.tipo === "retiro" && esPagoEquipo(m.concepto) && m.concepto.endsWith(` ${nombre}`));
          // Lo que se entregó al cerrar es lo que se decidió en el corte; lo que se pagó antes, durante el turno, va aparte.
          // Las salidas del cierre se guardan justo después de la hora de cierre (con margen por la diferencia de relojes).
          const alCerrar = (m: (typeof pagos)[number]) => !!c.cerradoEn && m.creadoEn.getTime() >= c.cerradoEn.getTime() - 5_000;
          const caja = pagos.filter(alCerrar).reduce((a, m) => a + m.monto, 0);
          const enTurno = pagos.filter((m) => !alCerrar(m)).reduce((a, m) => a + m.monto, 0);
          const de = (como: string) => fuera.filter((y) => y.nombre === nombre && y.como === como).reduce((a, y) => a + y.monto, 0);
          const transf = de("por transferencia"), pendiente = de("para el próximo corte");
          // En el corte se entrega primero lo más viejo: lo que pasa de lo que le toca hoy es de días anteriores.
          const anteriores = Math.max(0, caja + transf + pendiente - x.toca);
          let resta = anteriores;
          const quita = (v: number) => { const q = Math.min(v, resta); resta -= q; return v - q; };
          const hoyCaja = quita(caja), hoyTransf = quita(transf), hoyPend = quita(pendiente);
          // Lo que no se decidió en este corte (con pagos por semana, se paga en su fecha).
          const despues = Math.max(0, x.toca - hoyCaja - hoyTransf - hoyPend);
          return { nombre, vendio: x.vendio, toca: x.toca, caja: hoyCaja, transf: hoyTransf, pendiente: hoyPend, despues, anteriores, enTurno };
        });
        const total = metodos.reduce((a, x) => a + x.total, 0);
        const toca = Math.max(0, total - personas.reduce((a, x) => a + x.toca, 0));
        const recibido = total - efectivo;
        const llevo = movs.filter((m) => m.tipo === "retiro" && esLlevoDuena(m.concepto)).reduce((a, m) => a + m.monto, 0);
        const gastosCaja = gastos.reduce((a, g) => a + g.monto, 0);
        const pendiente = acumulados.filter((x) => x.turnoId === c.id).reduce((a, x) => a + x.monto, 0);
        // De lo que quedó pendiente en este corte, cuánto ya se le depositó después.
        const depositado = cuentaNeg.partes.filter((x) => x.turnoId === c.id).reduce((a, x) => a + x.monto - x.queda, 0);
        // Lo que le llegó de más (por transferencia o tarjeta) sobre lo que le tocaba: es del equipo.
        const deMas = Math.max(0, recibido + gastosCaja + llevo - toca);
        return { personas, negocio: { vendio: total, toca, recibido, gastos: gastosCaja, llevo, pendiente, depositado, deMas } };
      })(),
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
