import { periodoDia } from "@/lib/periodo";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { registrarGastosAutomaticos } from "@/lib/gastosAuto";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/BarraFiltros";
import { BotonCajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import { Paginacion } from "@/components/Paginacion";
import { SelectorUrl } from "@/components/SelectorUrl";
import { AvisoUrl, } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { faltantesDe } from "@/lib/faltantes";
import { cajaDe, categoriasGasto, diasYTotalVentas, equipoConVentas, foliosCorte, metodosActivos, resumenPeriodo, turnosCerrados, ventasEntre } from "@/lib/datos";
import { armarCortes, cortesPorRevisar } from "../cortes/datos";
import { NecesitaRevision } from "../cortes/HistorialCortes";
import { desdeElDia, diaCortoDe, sumarDias } from "@/lib/fechas";
import { CabeceraVentas } from "@/components/CabeceraPeriodo";
import { db, schema as t } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { condicionVentas, type ConsultaFiltros, leerFiltros, urlDescarga } from "@/lib/filtros";
import { esMovil } from "@/lib/dispositivo";
import { formatoDinero } from "@/lib/money";
import { esAcumulado, esLlevoDuena, esPagoAnulado, esPagoEquipo, esPropinaEntregada, MINUTOS_CORRECCION } from "@/lib/caja";
import { cuentaDuena } from "@/lib/duena";
import { Ayuda } from "@/components/Ayuda";
import { CajaModal } from "../../cobrar/CajaModal";
import { BotonCaja } from "./BotonCaja";
import { esCategoriaComisiones, verificadosDe } from "@/lib/pagos";
import { Movimientos, type DiaHistorial, type ItemHistorial } from "./Movimientos";
import { liquidarAutomaticos } from "@/lib/pagosAuto";
import { asentarCitasPagadas } from "@/lib/pagos";
import { periodoEncabezado } from "@/components/CabeceraPeriodo";
import type { FilaVenta } from "@/components/HistorialVentas";

export const metadata = { title: "Movimientos" };

const $ = formatoDinero;
const SUELDO = new Set(["sueldo", "mixto"]);
const METODO: Record<string, string> = { efectivo: "efectivo", transferencia: "transferencia", tarjeta: "tarjeta" };

type Q = ConsultaFiltros & { tipo?: string; egreso?: string; caja?: string; aviso?: string; error?: string; corte?: string };

/**
 * Movimientos: todo lo que pasa con el dinero en un solo lugar. Arriba, el resultado y las ventas en corto;
 * abajo, el historial con ventas, cortes de caja, egresos, pagos al equipo y lo que entró o salió de la caja.
 * Cada quien ve solo lo que su puesto permite.
 */
export default async function MovimientosPagina({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  await registrarGastosAutomaticos(s.barberia.id);
  await liquidarAutomaticos(s.barberia.id);
  await asentarCitasPagadas(s.barberia.id);
  const verTodo = s.puede("reportes.ver");
  const verTodas = s.puede("ventas.ver_todas");
  const atiende = s.usuario.rol === "barbera" || s.usuario.rol === "encargada";
  const verVentas = verTodas || atiende;
  const verCortes = verVentas || s.puede("cortes.ver");
  const verEgresos = verTodo || s.puede("gastos.ver");
  // Entradas y salidas de caja: quien maneja la caja (cobra, saca o pone dinero) o ve los cortes.
  const verCaja = verTodo || s.puede("caja.retiros") || s.puede("cortes.ver");
  // Pagos al equipo: quien ve reportes ve los de todos. Quien atiende también los ve, para saber de dónde sale el dinero de la caja;
  // solo con caja individual ve únicamente los suyos (entregados y pendientes).
  const verPagos = verTodo || atiende;
  const soloMios = !verTodo && atiende && s.barberia.modeloCaja === "individual";
  if (!verVentas && !verEgresos && !verCortes) redirect("/?aviso=sin-permiso");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const bId = s.barberia.id;
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  // Como en Cobro, la vista previa por puesto también deja registrar movimientos de caja (en un negocio de prueba son reales).
  const movCaja = s.puede("caja.retiros") && !cobra;
  const TIPOS: [string, string][] = [["", "Todos los movimientos"],
    ...(verVentas ? [["ventas", "Ventas"] as [string, string]] : []), ...(verCortes ? [["cortes", "Cortes de caja"] as [string, string]] : []),
    ...(verEgresos ? [["egresos", "Egresos"] as [string, string]] : []), ...(verPagos ? [["equipo", soloMios ? "Mis pagos" : "Pagos al equipo"] as [string, string]] : []),
    ...(verCaja ? [["caja", "Entradas y salidas de caja"] as [string, string]] : [])];
  const tipo = TIPOS.some(([k]) => k === q.tipo) ? q.tipo ?? "" : "";
  const equipo = verTodas || verTodo ? await equipoConVentas(bId) : [];
  const f = leerFiltros(q, hoy, equipo.map((e) => e.id));
  const persona = f.persona;
  const pagosDe = soloMios ? s.usuario.id : persona;
  // Con una persona elegida solo se ve lo suyo: sus ventas y lo que se le pagó. Lo demás no es de nadie en particular.
  const ver = (x: string) => (!tipo || tipo === x) && (!persona || x === "ventas" || x === "equipo");
  const desde = f.periodo?.desde, hasta = f.periodo?.hasta;
  const local = (col: unknown) => sql<string>`to_char((${col} at time zone ${zona})::date, 'YYYY-MM-DD')`;
  const enFechas = (col: unknown): SQL[] => (desde && hasta ? [sql`(${col} at time zone ${zona})::date between ${desde}::date and ${hasta}::date`] : []);
  const texto = f.buscar ? `%${f.buscar}%` : null;
  const condV = condicionVentas(f);

  // Cada fila del historial se cuenta por día, para armar páginas de un largo parecido.
  const porFila = (d: unknown) => ({ d: sql<string>`${d}`, n: sql<number>`count(*)::int` });
  const diaGasto = sql`to_char(${t.gastos.fecha}, 'YYYY-MM-DD')`;
  // Egresos: lo que se pagó fuera de la caja. Lo que se pagó con la caja es un gasto de caja y va con las entradas y salidas de caja.
  // Quien no ve egresos pero maneja la caja ve solo los gastos que se pagaron con la caja.
  const verGastos = (verEgresos && (ver("egresos") || ver("caja"))) || (verCaja && ver("caja"));
  const condGasto: SQL[] = [eq(t.gastos.barberiaId, bId), ...(tipo === "egresos" ? [isNull(t.gastos.turnoId)] : tipo === "caja" || !verEgresos ? [isNotNull(t.gastos.turnoId)] : []),
    ...(desde && hasta ? [gte(t.gastos.fecha, desde), lte(t.gastos.fecha, hasta)] : []), ...(texto ? [or(ilike(t.gastos.concepto, texto), ilike(t.gastos.categoria, texto))!] : [])];
  // Lo que pasó en la caja cuenta en el día de trabajo de esa caja, aunque el corte se haya hecho después de medianoche.
  const diaCaja = sql`to_char(${t.turnosCaja.fechaOperativa}, 'YYYY-MM-DD')`;
  const condMovBase: SQL[] = [eq(t.movimientosCaja.barberiaId, bId), inArray(t.movimientosCaja.tipo, ["retiro", "entrada"]),
    ...(desde && hasta ? [gte(t.turnosCaja.fechaOperativa, desde), lte(t.turnosCaja.fechaOperativa, hasta)] : [])];
  const condMov: SQL[] = [...condMovBase, ...(texto ? [ilike(t.movimientosCaja.concepto, texto)] : [])];
  const [gente, folios] = await Promise.all([
    db.select({ id: t.usuarios.id, nombre: t.usuarios.nombre, avatar: t.usuarios.avatar, activo: t.usuarios.activo }).from(t.usuarios).where(eq(t.usuarios.barberiaId, bId)),
    verCortes ? foliosCorte(bId) : Promise.resolve(new Map<string, string>()),
  ]);
  const verCorte = s.puede("cortes.ver");
  const [diasV, turnos, diasG, diasP, diasM, diasT] = await Promise.all([
    verVentas && ver("ventas") ? diasYTotalVentas(bId, zona, { desde, hasta, persona, condiciones: condV }).then((r) => r.porDia) : [],
    verCortes && ver("cortes") ? turnosCerrados(bId, 100000, f.periodo ?? undefined).then((x) => {
      const b = f.buscar?.toLowerCase();
      return b ? x.filter((c) => (folios.get(c.id) ?? "").toLowerCase().includes(b) || (c.cerradoPor ?? "").toLowerCase().includes(b)) : x;
    }) : [],
    verGastos ? db.select(porFila(diaGasto)).from(t.gastos).where(and(...condGasto)).groupBy(sql`1`) : [],
    verPagos && ver("equipo") ? db.select(porFila(local(t.pagosComision.creadoEn))).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), ...enFechas(t.pagosComision.creadoEn), ...(pagosDe ? [eq(t.pagosComision.barberoId, pagosDe)] : []), ...(texto ? [ilike(t.usuarios.nombre, texto)] : []))).groupBy(sql`1`) : [],
    // Las salidas por pagos al equipo no se cuentan: ya aparecen como pago.
    verCaja && ver("caja") ? db.select(porFila(diaCaja)).from(t.movimientosCaja).innerJoin(t.turnosCaja, eq(t.turnosCaja.id, t.movimientosCaja.turnoId))
      .where(and(...condMov, sql`${t.movimientosCaja.concepto} !~ '^Pago (de comisiones |anulado )?a '`)).groupBy(sql`1`) : [],
    verPagos && ver("equipo") ? db.select(porFila(local(t.historial.creadoEn))).from(t.historial)
      .where(and(eq(t.historial.barberiaId, bId), sql`${t.historial.detalle} ? 'propinaTransferencia'`, ...enFechas(t.historial.creadoEn), ...(pagosDe ? [sql`${t.historial.detalle}->>'barberoId' = ${pagosDe}`] : []))).groupBy(sql`1`) : [],
  ]);
  const porDia = new Map<string, number>();
  const sumar = (d: string, n: number) => { if (d) porDia.set(d, (porDia.get(d) ?? 0) + n); };
  for (const [d, n] of diasV) sumar(d, n);
  for (const c of turnos) sumar(c.fechaOperativa, 1);
  for (const x of [...diasG, ...diasP, ...diasM, ...diasT]) sumar(x.d, x.n);
  const todosDias = [...porDia.keys()].sort().reverse();
  const totalFilas = [...porDia.values()].reduce((a, n) => a + n, 0);
  // Páginas por filas: se juntan días completos hasta llegar a 10 filas en escritorio (15 en el teléfono). Un día muy lleno va solo en su página.
  const movil = await esMovil();
  const LIMITE = movil ? 15 : 10;
  // Un día con más filas que el límite se reparte en varias páginas (parte: desde qué fila y hasta cuál de ese día).
  type Grupo = { dias: string[]; parte?: { desde: number; hasta: number } };
  const grupos: Grupo[] = [];
  for (const d of todosDias) {
    const n = porDia.get(d) ?? 0;
    if (n > LIMITE) {
      for (let i = 0; i < n; i += LIMITE) grupos.push({ dias: [d], parte: { desde: i, hasta: i + LIMITE >= n ? Infinity : i + LIMITE } });
      continue;
    }
    const ultimo = grupos[grupos.length - 1];
    const lleva = ultimo && !ultimo.parte ? ultimo.dias.reduce((a, x) => a + (porDia.get(x) ?? 0), 0) : Infinity;
    if (lleva + n > LIMITE) grupos.push({ dias: [d] }); else ultimo.dias.push(d);
  }
  const paginas = Math.max(1, grupos.length);
  // Al llegar con ?corte=<id> (desde un aviso), se abre la página donde está ese corte.
  const pedido = q.corte ? turnos.find((c) => c.id === q.corte) : undefined;
  const paginaPedida = pedido ? grupos.findIndex((g) => g.dias.includes(pedido.fechaOperativa)) + 1 : 0;
  const pagina = Math.min(paginaPedida || f.pagina, paginas);
  const grupo = grupos[pagina - 1];
  const dias = grupo?.dias ?? [];
  const pd = dias.length ? dias[dias.length - 1] : null, ph = dias.length ? dias[0] : null;
  // Un día más hacia adelante: lo que se entregó al cerrar después de medianoche pertenece al día anterior.
  const phMas = ph ? sumarDias(ph, 1) : null;
  const enPagina = (col: unknown): SQL[] => (pd && phMas ? [sql`(${col} at time zone ${zona})::date between ${pd}::date and ${phMas}::date`] : [sql`false`]);

  const quien = alias(t.usuarios, "quien");
  const cancelo = alias(t.usuarios, "cancelo");
  const turnosPagina = turnos.filter((c) => dias.includes(c.fechaOperativa));
  const [ventas, cortes, gastos, pagos, movsCaja, propTrans, turno, metodos] = await Promise.all([
    diasV.length && pd && ph ? ventasEntre(bId, pd, ph, { zona, condiciones: condV }).then((r) => r.ventas) : [],
    armarCortes(bId, turnosPagina, { zona, hoy, gente, folios, verEgresos, todos: turnos }),
    diasG.length && pd && ph ? db.select({ g: t.gastos, quien: quien.nombre, cancelo: cancelo.nombre }).from(t.gastos)
      .innerJoin(quien, eq(quien.id, t.gastos.usuarioId)).leftJoin(cancelo, eq(cancelo.id, t.gastos.canceladoPor))
      .where(and(...condGasto, gte(t.gastos.fecha, pd), lte(t.gastos.fecha, ph)))
      .orderBy(desc(t.gastos.creadoEn)) : [],
    diasP.length ? db.select({ p: t.pagosComision, nombre: t.usuarios.nombre }).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), ...enPagina(t.pagosComision.creadoEn), ...(pagosDe ? [eq(t.pagosComision.barberoId, pagosDe)] : []), ...(texto ? [ilike(t.usuarios.nombre, texto)] : []))) : [],
    // Los movimientos de caja se traen también para el filtro de pagos: con ellos se sabe en qué corte se entregó cada pago.
    (diasM.length || diasP.length) && pd && ph ? db.select({ id: t.movimientosCaja.id, turnoId: t.movimientosCaja.turnoId, dia: sql<string>`${diaCaja}`, tipo: t.movimientosCaja.tipo, monto: t.movimientosCaja.monto, concepto: t.movimientosCaja.concepto, creadoEn: t.movimientosCaja.creadoEn, quien: t.usuarios.nombre })
      .from(t.movimientosCaja).innerJoin(t.usuarios, eq(t.usuarios.id, t.movimientosCaja.usuarioId)).innerJoin(t.turnosCaja, eq(t.turnosCaja.id, t.movimientosCaja.turnoId))
      .where(and(...condMovBase, gte(t.turnosCaja.fechaOperativa, pd), lte(t.turnosCaja.fechaOperativa, ph))) : [],
    diasT.length ? db.select({ id: t.historial.id, creadoEn: t.historial.creadoEn, accion: t.historial.accion, detalle: t.historial.detalle }).from(t.historial)
      .where(and(eq(t.historial.barberiaId, bId), sql`${t.historial.detalle} ? 'propinaTransferencia'`, ...enPagina(t.historial.creadoEn), ...(pagosDe ? [sql`${t.historial.detalle}->>'barberoId' = ${pagosDe}`] : []))) : [],
    cajaDe(s),
    s.puede("ventas.modificar") ? metodosActivos(bId) : Promise.resolve([]),
  ]);
  // Pagos de días anteriores a la página que se entregaron (o se dejaron pendientes) en un corte que sí está en la página:
  // sin ellos, un corte no mostraría a quién le pagó una comisión vieja.
  const pagosAntes = verCortes && ver("cortes") && verPagos && ver("equipo") && pd && turnosPagina.length
    ? await db.select({ p: t.pagosComision, nombre: t.usuarios.nombre }).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), eq(t.pagosComision.tipo, "pago"), sql`${t.pagosComision.nota} like '%Pago automático%'`, sql`${t.pagosComision.nota} not like 'Por entregar de caja:%'`,
        sql`(${t.pagosComision.creadoEn} at time zone ${zona})::date between ${sumarDias(pd, -45)}::date and ${sumarDias(pd, -1)}::date`,
        ...(pagosDe ? [eq(t.pagosComision.barberoId, pagosDe)] : [])))
    : [];
  // Para saber en qué corte se entregó cada pago se miran también las salidas de caja y los cierres de días anteriores:
  // si no, un pago de ayer tomaría la salida o el renglón del cierre de hoy (mismo nombre y monto) y saldría dos veces aquí.
  const conPagos = pd && ph && (pagos.length > 0 || pagosAntes.length > 0);
  const [salidasAmplias, cierresAmplios] = conPagos ? await Promise.all([
    db.select({ id: t.movimientosCaja.id, turnoId: t.movimientosCaja.turnoId, dia: t.turnosCaja.fechaOperativa, monto: t.movimientosCaja.monto, concepto: t.movimientosCaja.concepto, creadoEn: t.movimientosCaja.creadoEn })
      .from(t.movimientosCaja).innerJoin(t.turnosCaja, eq(t.turnosCaja.id, t.movimientosCaja.turnoId))
      .where(and(eq(t.movimientosCaja.barberiaId, bId), eq(t.movimientosCaja.tipo, "retiro"), like(t.movimientosCaja.concepto, "Pago %"),
        gte(t.turnosCaja.fechaOperativa, sumarDias(pd!, -45)), lte(t.turnosCaja.fechaOperativa, phMas!)))
      .orderBy(asc(t.movimientosCaja.creadoEn)),
    db.select({ creadoEn: t.historial.creadoEn, detalle: t.historial.detalle }).from(t.historial)
      .where(and(eq(t.historial.barberiaId, bId), eq(t.historial.tipo, "caja"), sql`${t.historial.detalle} ? 'comisiones'`,
        sql`(${t.historial.creadoEn} at time zone ${zona})::date between ${sumarDias(pd!, -45)}::date and ${phMas}::date`))
      .orderBy(asc(t.historial.creadoEn)),
  ]) : [[], []];
  // Con un filtro de fechas o de búsqueda solo se ven algunos cortes; para asignar los pagos se usan todos.
  const cortesTodos = conPagos && (f.periodo || f.buscar) ? await turnosCerrados(bId, 100000) : turnos;
  // Pagos que siguen pendientes de entregar: se muestran siempre en la primera página, sean del día que sean,
  // para que nadie pierda de vista de cuándo es ese dinero.
  const pendientesTodos = verPagos && ver("equipo") && pagina === 1 && !f.periodo
    ? await db.select({ p: t.pagosComision, nombre: t.usuarios.nombre }).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), eq(t.pagosComision.tipo, "pago"), sql`${t.pagosComision.nota} like 'Por entregar de caja:%'`, sql`${t.pagosComision.monto} > 0`,
        ...(pagosDe ? [eq(t.pagosComision.barberoId, pagosDe)] : []), ...(texto ? [ilike(t.usuarios.nombre, texto)] : [])))
    : [];
  const comps = gastos.length ? await db.select({ id: t.comprobantes.id, gastoId: t.comprobantes.gastoId, nombre: t.comprobantes.nombre }).from(t.comprobantes)
    .where(and(eq(t.comprobantes.barberiaId, bId), inArray(t.comprobantes.gastoId, gastos.map((x) => x.g.id)))) : [];
  const stripeDe = ventas.length ? await verificadosDe(ventas.map((v) => v.id)) : new Map();

  // Ventas, con lo mismo que tenía la pantalla de Ventas: detalle, pago confirmado, cancelar, anular o modificar.
  const puedeCancelar = s.puede("ventas.cancelar");
  const puedeModificar = s.puede("ventas.modificar");
  const ahora = Date.now();
  const opcionesVenta = puedeModificar ? { equipo: equipo.map((e) => ({ id: e.id, nombre: e.nombre })), metodos: metodos.map((m) => ({ id: m.id, nombre: m.nombre })) } : undefined;
  const monto = (v: (typeof ventas)[number]) => (persona ? v.conceptos.filter((c) => c.barberoId === persona).reduce((a, c) => a + c.precioCobrado, 0) : v.total);
  const propios = (v: (typeof ventas)[number]) => (persona ? v.conceptos.filter((c) => c.barberoId === persona) : v.conceptos);
  const filaVenta = (v: (typeof ventas)[number]): FilaVenta => ({
    id: v.id, folio: v.folio, hora: horaCorta(v.creadoEn, zona), monto: monto(v), cancelada: v.estado === "cancelada",
    servicios: propios(v).map((c) => c.nombre).join(", "),
    quien: [...new Set(propios(v).map((c) => c.barbero.split(" ")[0]))].join(", "),
    stripe: (() => {
      const st = stripeDe.get(v.id);
      return st ? { reembolsado: st.estado === "reembolsado", tarjeta: st.tarjeta, referencia: st.referencia, confirmado: st.pagadoEn ? `${fechaLarga(fechaLocal(st.pagadoEn, zona))}, ${horaCorta(st.pagadoEn, zona)}` : "Sí" } : undefined;
    })(),
    detalle: [
      ["Servicios", propios(v).map((c) => `${c.nombre} con ${c.barbero.split(" ")[0]}, ${$(c.precioCobrado)}`).join("; ")],
      ...(v.conceptos.some((c) => c.descuento) ? [["Descuento", v.conceptos.filter((c) => c.descuento).map((c) => `${$(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
      ...(v.propinas.length ? [["Propina", v.propinas.map((x) => `${$(x.monto)}${x.esEfectivo ? " en efectivo" : " con tarjeta o transferencia"}`).join(" y ")] as [string, string]] : []),
      ["Pago", v.pagos.map((pg) => `${pg.metodo} ${$(pg.monto)}`).join(" y ") || "Sin pago"],
      ["Registró", v.registradaPor.split(" ")[0]],
      ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
    ],
    accion: puedeCancelar && v.estado === "pagada" ? { tipo: "cancelar" }
      : !verTodas && v.estado === "pagada" && v.registradaPorId === s.usuario.id && turno?.id === v.turnoId && ahora < v.creadoEn.getTime() + MINUTOS_CORRECCION * 60000
        ? { tipo: "anular", hasta: horaCorta(new Date(v.creadoEn.getTime() + MINUTOS_CORRECCION * 60000), zona) } : undefined,
    edicion: puedeModificar && v.estado === "pagada" ? {
      conceptos: v.conceptos.map((c) => ({ id: c.id, nombre: c.nombre, barberoId: c.barberoId, precio: c.precioCobrado })),
      pagos: v.pagos.filter((pg) => pg.metodoId).map((pg) => ({ metodoId: pg.metodoId!, monto: pg.monto })),
    } : undefined,
  });

  // Todo lo de la página, cada cosa con su día. Lo que se entregó al cerrar la caja va con su corte.
  const items: (ItemHistorial & { dia: string })[] = [];
  const cortePorTurno = new Map(turnosPagina.map((c) => [c.id, c]));
  for (const v of ventas) items.push({ k: "venta", dia: v.fecha, t: v.creadoEn.getTime(), f: filaVenta(v) });
  for (const c of cortes) {
    const tc = cortePorTurno.get(c.id)!;
    items.push({ k: "corte", dia: tc.fechaOperativa, t: tc.cerradoEn!.getTime(), c, ver: verCorte });
  }
  for (const { g, quien: qn, cancelo: cn } of gastos) {
    const comp = comps.find((c) => c.gastoId === g.id);
    const deCaja = !!g.turnoId;
    const det: [string, string][] = [
      ["Registró", `${qn.split(" ")[0]}, ${horaCorta(g.creadoEn, zona)}`],
      ["Se pagó", g.metodo === "efectivo" ? (deCaja ? "En efectivo, de la caja" : "En efectivo, fuera de la caja") : `Con ${METODO[g.metodo] ?? g.metodo}`],
      ...(g.descripcion ? [["Descripción", g.descripcion] as [string, string]] : []),
      ...(g.canceladoEn ? [["Cancelado", `${cn?.split(" ")[0] ?? ""}: ${g.motivoCancelacion ?? ""}`] as [string, string]] : []),
    ];
    const cerrado = deCaja && g.turnoId !== turno?.id;
    items.push({ k: "mov", dia: g.fecha, t: g.creadoEn.getTime(), m: {
      id: `g${g.id}`, tipo: deCaja ? "gasto" : "egreso", titulo: g.concepto, sub: [g.categoria, deCaja ? "pagado con la caja" : METODO[g.metodo]].filter(Boolean).join(", "), monto: -g.monto, hora: horaCorta(g.creadoEn, zona),
      cancelado: !!g.canceladoEn, detalle: det, comprobante: comp ? { id: comp.id, nombre: comp.nombre } : undefined,
      egreso: { id: g.id, concepto: g.concepto, categoria: g.categoria, metodo: g.metodo, monto: g.monto, cancelado: !!g.canceladoEn, puedeCancelar: s.puede("gastos.cancelar") && !g.canceladoEn && !cerrado, detalle: det },
    } });
  }
  // Cada pago en efectivo dejó una salida en la caja ("Pago a Ana"): con ella se sabe en qué corte se entregó.
  const salidasPago = salidasAmplias.filter((m) => esPagoEquipo(m.concepto));
  const usadas = new Set<string>();
  // Cortes del más viejo al más nuevo: la comisión automática se decide (caja, transferencia o mañana) en el primer corte después de liquidarse.
  const cortesAsc = [...turnos].filter((c) => c.cerradoEn).sort((a, b) => a.cerradoEn!.getTime() - b.cerradoEn!.getTime());
  const corteDespuesDe = (d: Date) => cortesAsc.find((c) => c.cerradoEn!.getTime() > d.getTime());
  const ultimoCorte = cortesAsc[cortesAsc.length - 1];
  const todosAsc = cortesTodos === turnos ? cortesAsc : [...cortesTodos].filter((c) => c.cerradoEn).sort((a, b) => a.cerradoEn!.getTime() - b.cerradoEn!.getTime());
  // El corte de cada cierre anotado y sus renglones ("Ana $1,250 por transferencia"). Cada renglón se usa para un solo pago.
  const renglones = cierresAmplios.flatMap((h, k) => {
    const c = todosAsc.reduce<{ c?: (typeof todosAsc)[number]; d: number }>((m, x) => {
      const d = Math.abs(x.cerradoEn!.getTime() - h.creadoEn.getTime());
      return d < m.d ? { c: x, d } : m;
    }, { d: 5 * 60000 }).c;
    if (!c) return [];
    return [...String((h.detalle as { comisiones?: string }).comisiones ?? "").matchAll(/([^,]+?) \$([\d,]+(?:\.\d{1,2})?) (de la caja|por transferencia)/g)]
      .map((m, n) => ({ k: `${k}-${n}`, corte: c.id, dia: c.fechaOperativa, nombre: m[1].trim(), monto: Math.round(Number(m[2].replace(/,/g, "")) * 100) }));
  });
  const renglonUsado = new Set<string>();
  // Pagos cuyo corte se supo por su salida de caja o por lo anotado en el cierre (no por cercanía de fechas).
  const seguro = new Set<string>();
  // Cada pago se resuelve una sola vez, del más viejo al más nuevo: toma la primera salida (o renglón del cierre) de su día en adelante
  // que nadie más tomó. Así el pago de ayer se queda en el corte de ayer y no se repite en el de hoy.
  const corteDePago = new Map<string, string | undefined>();
  const buscarCorteDePago = (p: (typeof pagos)[number]["p"], nombre: string) => {
    if (p.tipo !== "pago") return undefined;
    const primero = nombre.split(" ")[0], desde = fechaLocal(p.creadoEn, zona);
    if (/^Efectivo de caja/.test(p.nota)) {
      const m = salidasPago.find((x) => !usadas.has(x.id) && x.monto === p.monto && x.concepto.endsWith(` ${primero}`) && x.dia >= desde);
      if (m) { usadas.add(m.id); seguro.add(p.id); return m.turnoId ?? undefined; }
    }
    // Comisión entregada en un corte (por transferencia o en efectivo): el cierre guardó "Ana $1,250 por transferencia".
    if (!p.nota.startsWith("Por entregar de caja")) {
      const r = renglones.find((x) => !renglonUsado.has(x.k) && x.nombre === primero && x.monto === p.monto && x.dia >= desde);
      if (r) { renglonUsado.add(r.k); seguro.add(p.id); return r.corte; }
      if (/Pago automático/.test(p.nota)) return corteDespuesDe(p.creadoEn)?.id;
    }
    return undefined;
  };
  for (const { p, nombre } of [...pagosAntes, ...pagos].sort((a, b) => a.p.creadoEn.getTime() - b.p.creadoEn.getTime()))
    if (!corteDePago.has(p.id)) corteDePago.set(p.id, buscarCorteDePago(p, nombre));
  const turnoDePago = (p: (typeof pagos)[number]["p"], nombre: string) => {
    if (!corteDePago.has(p.id)) corteDePago.set(p.id, buscarCorteDePago(p, nombre));
    return corteDePago.get(p.id);
  };
  const diasCortos = (t: string) => t.replace(/^(de|del)\s+/i, "").replace(/ de ([a-záéíóú]+)/gi, (_, m: string) => ` ${({ enero: "ene", febrero: "feb", marzo: "mar", abril: "abr", mayo: "may", junio: "jun", julio: "jul", agosto: "ago", septiembre: "sep", octubre: "oct", noviembre: "nov", diciembre: "dic" } as Record<string, string>)[m.toLowerCase()] ?? m}`).replace(/(\d+) (\w+) al (\d+) \2\b/, "$1 al $3 $2");
  const DE_QUE = (nota: string) => nota.slice(nota.indexOf(":") + 1).replace(/^\s*Pago automático\s*/, "").replace(/\s*\(entregado en el corte\)\s*$/, "").trim();
  const filaPago = (p: (typeof pagos)[number]["p"], nombre: string, extra: { corte?: string; pend?: boolean } = {}): ItemHistorial & { dia: string } => {
    const renta = p.tipo === "renta";
    const pendiente = !renta && p.monto > 0 && p.nota.startsWith("Por entregar de caja");
    // De dónde viene un pago pendiente: de qué días es la comisión y en qué corte se dejó para después.
    const origen = pendiente ? corteDespuesDe(p.creadoEn) : undefined;
    const deCuando = DE_QUE(p.nota);
    // Corto para que quepa en la fila: "10 al 15 nov", "13 nov".
    const MES: Record<string, string> = { enero: "ene", febrero: "feb", marzo: "mar", abril: "abr", mayo: "may", junio: "jun", julio: "jul", agosto: "ago", septiembre: "sep", octubre: "oct", noviembre: "nov", diciembre: "dic" };
    const corto = deCuando.replace(/^(de|del)\s+/, "").replace(/ de (\w+)/g, (_, m: string) => ` ${MES[m.toLowerCase()] ?? m}`).replace(/^(\d+) (\w+) al (\d+) \2\b/, "$1 al $3 $2");
    const folioOrigen = origen ? folios.get(origen.id) ?? "" : "";
    const subPend = `Comisión ${corto || "de días anteriores"}. ${origen ? `Quedó en el corte ${folioOrigen}` : "Va en el próximo corte"}`;
    return { k: "mov" as const, dia: fechaLocal(p.creadoEn, zona), t: p.creadoEn.getTime(), ...extra, m: {
      id: `p${p.id}`, tipo: (renta ? "renta" : "pago") as "renta" | "pago", titulo: renta ? `Renta de silla de ${nombre.split(" ")[0]}` : `Pago a ${nombre.split(" ")[0]}`,
      pendiente,
      sub: pendiente ? subPend : (p.nota.split(":")[0] || (renta ? "Ingreso" : "Pago al equipo")).replace(/^Efectivo de caja$/, "En efectivo, de la caja").replace(/^Transferencia$/, "Por transferencia"),
      monto: renta ? p.monto : -p.monto, hora: horaCorta(p.creadoEn, zona), cancelado: p.monto === 0,
      detalle: [["Hora", horaCorta(p.creadoEn, zona)] as [string, string], ...(pendiente ? [["Estado", origen ? `Pendiente de entregar. Quedó así en el corte ${folioOrigen} del ${fechaLarga(origen.fechaOperativa).replace(/^./, (x) => x.toLowerCase())}` : "Pendiente de entregar en el próximo corte"] as [string, string]] : []), ...(p.nota ? [["Nota", p.nota] as [string, string]] : [])],
    } };
  };
  // Pendientes: si se dejaron en el último corte, van debajo de ese corte; si no, arriba de todo (o al inicio de hoy si hoy no hay corte).
  const pendIds = new Set(pendientesTodos.map((x) => x.p.id));
  const fijos: (ItemHistorial & { dia: string })[] = [];
  // Con los cortes a la vista, lo pendiente va en el desglose de cada corte (en chico, con su ícono), no como renglón suelto:
  // en el corte donde se quedó ("para el próximo corte") y en cada corte siguiente mientras no se pagó ("desde el corte C-…").
  // Los cierres nuevos lo dejan anotado; para los de antes se reconstruye con la fecha de la comisión y el corte donde se pagó.
  const enCortes = verCortes && ver("cortes");
  const seguirPendiente = (p: (typeof pagos)[number]["p"], nombre: string, pagadoEn?: string) => {
    const origen = corteDespuesDe(p.creadoEn);
    if (!origen) return;
    const iO = cortesAsc.findIndex((x) => x.id === origen.id);
    const iH = pagadoEn ? cortesAsc.findIndex((x) => x.id === pagadoEn) : cortesAsc.length;
    if (iH <= iO) return; // se entregó en el mismo corte: nunca estuvo pendiente
    const nom = nombre.split(" ")[0], dias = diasCortos(DE_QUE(p.nota));
    for (let k = iO; k < iH; k++) {
      const c = cortes.find((x) => x.id === cortesAsc[k].id);
      if (!c) continue;
      const lista = (c.fueraCaja ??= []);
      if (lista.some((y) => y.como === "para el próximo corte" && y.nombre === nom && y.monto === p.monto)) continue;
      lista.push({ nombre: nom, monto: p.monto, como: "para el próximo corte", dias, origen: origen.id });
    }
  };
  if (enCortes) for (const { p, nombre } of [...pagos, ...pagosAntes]) {
    // Comisiones que ya se pagaron: estuvieron pendientes en los cortes entre el día de la comisión y el corte donde se entregaron.
    if (p.tipo !== "pago" || p.monto <= 0 || p.nota.startsWith("Por entregar de caja") || !/Pago automático/.test(p.nota)) continue;
    const pagado = turnoDePago(p, nombre);
    if (pagado && seguro.has(p.id)) seguirPendiente(p, nombre, pagado);
  }
  for (const { p, nombre } of pendientesTodos) {
    const origen = corteDespuesDe(p.creadoEn);
    if (enCortes) { seguirPendiente(p, nombre); continue; }
    if (origen && origen.id === ultimoCorte?.id && turnosPagina.some((c) => c.id === origen.id)) items.push(filaPago(p, nombre, { corte: origen.id, pend: true }));
    else fijos.push(filaPago(p, nombre));
  }
  // El recorrido de cada pendiente: los cortes desde donde se quedó hasta este, con su día y hora. Cada uno abre ese corte.
  const etiquetaCorte = (t: (typeof cortesAsc)[number]) => `${diaCortoDe(t.fechaOperativa, hoy)}, corte ${horaCorta(t.cerradoEn!, zona)}`;
  if (enCortes) for (const c of cortes) {
    const iC = cortesAsc.findIndex((x) => x.id === c.id);
    if (iC < 0) continue;
    for (const e of c.fueraCaja ?? []) {
      if (e.como !== "para el próximo corte") continue;
      const iO = e.origen ? cortesAsc.findIndex((x) => x.id === e.origen) : -1;
      const desde = iO >= 0 && iO <= iC ? iO : iC;
      e.recorrido = cortesAsc.slice(desde, iC + 1).map((t, k) => ({ id: t.id, texto: etiquetaCorte(t), estado: k === 0 ? "quedó pendiente" : "sigue pendiente", monto: e.monto }));
      // En el corte donde se quedó no se desglosa: solo se dice "para el próximo corte". El recorrido sale desde el corte siguiente.
      e.desdeTxt = desde < iC ? desdeElDia(cortesAsc[desde].fechaOperativa, hoy) : undefined;
      if (c.id === ultimoCorte?.id) e.final = "Se le paga en el próximo corte o por transferencia";
    }
  }
  // Lo del negocio para la dueña: en cada corte se ve todo lo que a esa hora seguía sin depositarse, con los cortes de donde viene.
  const duena = (enCortes && cortes.length) || (verCaja && ver("caja")) ? await cuentaDuena(bId) : null;
  const corteDe = (id: string | null) => (id ? cortesAsc.find((x) => x.id === id) : undefined);
  if (enCortes && duena?.partes.length) for (const c of cortes) {
    const tc = corteDe(c.id);
    if (!tc?.cerradoEn) continue;
    const iC = cortesAsc.indexOf(tc), fin = tc.cerradoEn.getTime();
    const hasta = (turnoId: string | null, t: Date) => { const k = turnoId ? cortesAsc.findIndex((x) => x.id === turnoId) : -1; return k >= 0 ? k <= iC : t.getTime() <= fin; };
    const vivas = duena.partes.filter((p) => hasta(p.turnoId, p.creadoEn))
      .map((p) => ({ p, monto: p.monto - p.depositos.filter((d) => d.creadoEn.getTime() <= fin).reduce((a, d) => a + d.monto, 0) })).filter((x) => x.monto > 0);
    if (!vivas.length) continue;
    // En el corte donde se acumuló no se desglosa; desde el corte siguiente, sí ("desde el lunes 16"), con cada corte citado.
    const k0 = cortesAsc.findIndex((x) => x.id === vivas[0].p.turnoId);
    const antes = k0 >= 0 ? k0 < iC : vivas[0].p.creadoEn.getTime() < fin;
    c.negocioRes = [{
      tipo: "pendiente", monto: vivas.reduce((a, x) => a + x.monto, 0),
      desdeTxt: antes ? desdeElDia(k0 >= 0 ? cortesAsc[k0].fechaOperativa : fechaLocal(vivas[0].p.creadoEn, zona), hoy) : "",
      recorrido: vivas.map(({ p, monto }) => { const t = corteDe(p.turnoId); return { id: p.turnoId ?? "", texto: t ? etiquetaCorte(t) : diaCortoDe(fechaLocal(p.creadoEn, zona), hoy), estado: "se acumuló", monto }; }),
    }];
  }
  // Cada depósito a la dueña es un renglón propio con los cortes que cubre.
  if (verCaja && ver("caja") && duena) for (const d of duena.depositos) {
    const dia = fechaLocal(d.creadoEn, zona);
    if (!dias.includes(dia) || f.buscar) continue;
    const cub = d.cubre.map((x) => ({ ...x, t: corteDe(x.turnoId) }));
    const fechas = cub.map((x) => x.t?.fechaOperativa).filter((x): x is string => !!x).sort();
    const largo = (x: string) => fechaLarga(x).split(" de ")[0].toLowerCase();
    const sub = fechas.length ? `${fechas[0] === fechas[fechas.length - 1] ? `Del ${largo(fechas[0])}` : `Del ${largo(fechas[0])} al ${largo(fechas[fechas.length - 1])}`}, ${cub.length} ${cub.length === 1 ? "corte" : "cortes"}` : "Lo acumulado del negocio";
    const quien = gente.find((g) => g.id === d.usuarioId)?.nombre.split(" ")[0] ?? "";
    items.push({ k: "mov", dia, t: d.creadoEn.getTime(), m: {
      id: `d${d.id}`, tipo: "deposito", titulo: "Depósito a la dueña", hora: horaCorta(d.creadoEn, zona), sub, monto: -d.monto,
      detalle: [...cub.map((x) => [x.t ? etiquetaCorte(x.t) : "Corte", formatoDinero(x.monto)] as [string, string]), ["Registró", `${quien}${quien ? ", " : ""}${horaCorta(d.creadoEn, zona)}`]],
      comprobante: d.comprobanteNombre ? { id: d.id, nombre: d.comprobanteNombre, url: `/api/deposito/${d.id}` } : undefined,
    } });
  }
  for (const { p, nombre } of pagos) {
    if (pendIds.has(p.id)) continue;
    // Los pendientes no se repiten en su día: salen arriba, en la primera página.
    if (p.tipo === "pago" && p.monto > 0 && p.nota.startsWith("Por entregar de caja") && (enCortes || (!f.periodo && verPagos && ver("equipo")))) continue;
    items.push(filaPago(p, nombre, { corte: turnoDePago(p, nombre) }));
  }
  // Los de días anteriores solo salen si se entregaron en un corte de esta página, debajo de ese corte.
  for (const { p, nombre } of pagosAntes) {
    const corte = turnoDePago(p, nombre);
    if (corte && seguro.has(p.id) && turnosPagina.some((c) => c.id === corte)) items.push(filaPago(p, nombre, { corte }));
  }
  // Lo que entró o salió de la caja sin ser venta ni gasto. Los pagos al equipo ya aparecen como pago; aquí no se repiten.
  // Lo acumulado para la dueña no sale como renglón: va en el desglose de su corte.
  if (verCaja && ver("caja")) for (const c of movsCaja.filter((x) => !esPagoEquipo(x.concepto) && !esPagoAnulado(x.concepto) && !esAcumulado(x.concepto) && (!f.buscar || x.concepto.toLowerCase().includes(f.buscar.toLowerCase())))) {
    const sale = c.tipo === "retiro", propina = esPropinaEntregada(c.concepto);
    items.push({ k: "mov", dia: c.dia, t: c.creadoEn.getTime(), corte: propina ? c.turnoId : undefined, m: {
      id: `c${c.id}`, tipo: propina ? "propina" : "caja", titulo: c.concepto, hora: horaCorta(c.creadoEn, zona),
      sub: propina ? "Es de quien hizo el servicio" : esLlevoDuena(c.concepto) ? "Cuenta como lo del negocio. No es un gasto" : sale ? "Se sacó de la caja. No es un gasto" : "Se puso en la caja. No es una venta", monto: sale ? -c.monto : c.monto,
      detalle: [["Registró", `${c.quien.split(" ")[0]}, ${horaCorta(c.creadoEn, zona)}`],
        ["Cuenta en la ganancia", propina ? "No. La propina es de quien hizo el servicio" : "No. Solo cambia el efectivo de la caja"]],
    } });
  }
  // Quien atiende y no ve la caja completa ve las propinas que se entregaron en el corte (con caja individual, solo las suyas).
  const mioNombre = s.usuario.nombre.split(" ")[0];
  if (!(verCaja && ver("caja")) && !verTodo && atiende && ver("equipo")) for (const c of movsCaja.filter((x) => esPropinaEntregada(x.concepto) && (!soloMios || x.concepto.endsWith(` ${mioNombre}`)))) {
    items.push({ k: "mov", dia: c.dia, t: c.creadoEn.getTime(), corte: c.turnoId, m: {
      id: `c${c.id}`, tipo: "propina", titulo: c.concepto, hora: horaCorta(c.creadoEn, zona), sub: "Es de quien hizo el servicio", monto: -c.monto,
      detalle: [["Cuenta en la ganancia", "No. La propina es de quien hizo el servicio"]],
    } });
  }
  for (const h of propTrans) {
    const det = h.detalle as { propinaTransferencia?: number; turnoId?: string };
    items.push({ k: "mov", dia: fechaLocal(h.creadoEn, zona), t: h.creadoEn.getTime(), corte: det.turnoId, m: {
      id: `h${h.id}`, tipo: "propina", titulo: h.accion.split(":")[0], sub: "Por transferencia, no tocó la caja", monto: -Number(det.propinaTransferencia ?? 0), hora: horaCorta(h.creadoEn, zona),
      detalle: [["Cuenta en la ganancia", "No. La propina es de quien hizo el servicio"]],
    } });
  }
  // Lo que pertenece a un corte que está en la lista se acomoda justo debajo de él, en su mismo día.
  const filaCorte = new Map(items.filter((x) => x.k === "corte").map((x) => [(x as { c: { id: string } }).c.id, x]));
  for (const it of items) {
    const c = it.corte ? filaCorte.get(it.corte) : undefined;
    if (it.k !== "corte" && c) {
      it.dia = c.dia; it.t = c.t;
      // Un pago al equipo se decidió al cerrar: se muestra con la hora del corte, no con la de la liquidación.
      if (it.k === "mov" && it.m.id.startsWith("p")) {
        const hc = horaCorta(new Date(c.t), zona);
        it.m.hora = hc; it.m.detalle = it.m.detalle?.map(([k, v]) => (k === "Hora" ? [k, hc] : [k, v]) as [string, string]);
      }
    }
  }
  // Orden por hora, del más reciente al más viejo. El corte va a la hora en que se cerró la caja, con lo suyo debajo
  // (lo pendiente que se dejó en ese corte y lo que se entregó al cerrar). Lo que pasó después del corte queda arriba de él.
  const nivel = (x: ItemHistorial) => (x.k === "corte" ? 0 : (x as { pend?: boolean }).pend ? 1 : x.corte ? 2 : 3);
  const orden = (lista: (ItemHistorial & { dia: string })[]) => lista.sort((a, b) => b.t - a.t || nivel(a) - nivel(b));
  // Pendientes que vienen de antes: si hoy ya hubo corte, van en su propio bloque arriba; si no, al inicio de hoy.
  const hoyConCorte = items.some((x) => x.k === "corte" && x.dia === hoy);
  const enHoy = !hoyConCorte && dias.includes(hoy);
  for (const it of fijos) { it.dia = enHoy ? hoy : "pendientes"; it.t = Number.MAX_SAFE_INTEGER; }
  items.push(...fijos);
  const diasConPend = fijos.length && !enHoy ? ["pendientes", ...dias] : dias;
  const historial: DiaHistorial[] = diasConPend.map((d) => {
    if (d === "pendientes") return { fecha: d, titulo: "Pendientes por entregar", total: 0, sinTotal: true, items: items.filter((x) => x.dia === d) };
    const ordenados = orden(items.filter((x) => x.dia === d));
    const delDia = grupo?.parte ? ordenados.slice(grupo.parte.desde, grupo.parte.hasta) : ordenados;
    const total = ventas.filter((v) => v.fecha === d && v.estado === "pagada").reduce((a, v) => a + monto(v), 0);
    const nombre = d === hoy ? "Hoy" : fechaLarga(d);
    return { fecha: d, titulo: grupo?.parte && grupo.parte.desde > 0 ? `${nombre}, continúa` : nombre, total, items: delDia };
  }).filter((d) => d.items.length);

  // Encabezado: el periodo elegido o el mes en curso (el día 1, el mes anterior).
  // Sin filtro, el encabezado muestra el resultado de hoy; la lista de abajo sigue siendo el historial completo.
  const p = f.periodo ?? periodoDia(hoy, hoy), anterior = false;
  const enP = (col: unknown) => sql`(${col} at time zone ${zona})::date between ${p.desde}::date and ${p.hasta}::date`;
  const [rp, pagosP, gastosP, reglas, generadas, cats, frecuentes] = await Promise.all([
    verTodo ? resumenPeriodo(bId, p.desde, p.hasta, zona) : null,
    db.select({ id: t.pagosComision.barberoId, tipo: t.pagosComision.tipo, monto: sql<number>`sum(${t.pagosComision.monto})::int` }).from(t.pagosComision)
      .where(and(eq(t.pagosComision.barberiaId, bId), enP(t.pagosComision.creadoEn))).groupBy(t.pagosComision.barberoId, t.pagosComision.tipo),
    db.select({ categoria: t.gastos.categoria, monto: sql<number>`sum(${t.gastos.monto})::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))).groupBy(t.gastos.categoria),
    db.select({ id: t.reglasComision.barberoId, tipo: t.reglasComision.tipo }).from(t.reglasComision)
      .where(and(eq(t.reglasComision.barberiaId, bId), isNull(t.reglasComision.vigenteHasta), isNull(t.reglasComision.servicioId))),
    db.select({ id: t.conceptos.barberoId, nombre: t.usuarios.nombre, comision: sql<number>`coalesce(sum(${t.conceptos.comision}), 0)::int` })
      .from(t.conceptos).innerJoin(t.ventas, eq(t.ventas.id, t.conceptos.ventaId)).innerJoin(t.usuarios, eq(t.usuarios.id, t.conceptos.barberoId))
      .where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), enP(t.ventas.creadoEn))).groupBy(t.conceptos.barberoId, t.usuarios.nombre),
    categoriasGasto(bId, false),
    db.select().from(t.conceptosFrecuentes).where(eq(t.conceptosFrecuentes.barberiaId, bId)),
  ]);
  // Conceptos ya usados con su categoría (el más reciente manda), para sugerirla al registrar un egreso.
  const sugeridas: [string, string][] = s.puede("gastos.registrar") ? [...new Map((await db.select({ c: t.gastos.concepto, k: t.gastos.categoria }).from(t.gastos)
    .where(and(eq(t.gastos.barberiaId, bId), isNull(t.gastos.canceladoEn))).orderBy(desc(t.gastos.creadoEn)).limit(400)).reverse().map((x) => [x.c.trim().toLowerCase(), [x.c.trim(), x.k] as [string, string]])).values()] : [];
  const retirado = verTodo ? (await db.select({ concepto: t.movimientosCaja.concepto, monto: t.movimientosCaja.monto }).from(t.movimientosCaja)
    .where(and(eq(t.movimientosCaja.barberiaId, bId), eq(t.movimientosCaja.tipo, "retiro"), enP(t.movimientosCaja.creadoEn)))).filter((x) => !esPagoEquipo(x.concepto) && !esPropinaEntregada(x.concepto)).reduce((a, x) => a + x.monto, 0) : 0;
  const ventasP = rp?.netas ?? 0;
  const rentas = pagosP.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const pagadoEquipo = pagosP.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const egresos = gastosP.reduce((a, x) => a + x.monto, 0);
  const entro = ventasP + rentas, salio = egresos + pagadoEquipo, quedo = entro - salio;
  const esSueldo = (id: string) => SUELDO.has(reglas.find((x) => x.id === id)?.tipo ?? "");
  const comisionesMes = generadas.filter((g) => !esSueldo(g.id));
  const falt = await faltantesDe(bId, p.desde, p.hasta);
  const porPagar = comisionesMes.reduce((a, g) => a + Math.max(g.comision - pagosP.filter((x) => x.id === g.id && x.tipo === "pago").reduce((b, x) => b + x.monto, 0) - (falt.find((x) => x.usuarioId === g.id)?.monto ?? 0), 0), 0);
  // Resultado: lo vendido menos lo gastado y menos lo que le corresponde al equipo, ya pagado o todavía por pagar.
  const resultado = quedo - porPagar;
  const nombreP = p.tipo === "dia" && p.desde === hoy ? "hoy" : p.tipo === "mes" ? p.etiqueta.split(" ")[0].toLowerCase() : p.etiqueta.toLowerCase();
  const maxB = Math.max(entro, salio, 1);
  const firma = (c: number) => (c < 0 ? `−${$(-c)}` : $(c));

  const cuenta = (
    <div className="cuenta-c">
      <div className="paso-c"><span><b>Entró por ventas</b><small>lo que pagaron los clientes</small></span><b className="num">{$(ventasP)}</b></div>
      {rp?.porMetodo.map(([m, v]) => <div key={m} className="sub-c"><span>{m}</span><span className="num">{$(v)}</span></div>)}
      {rentas > 0 && <div className="paso-c"><span><b>Rentas de silla</b><small>lo que pagaron los barberos</small></span><b className="num">+{$(rentas)}</b></div>}
      <div className="paso-c resta"><span><b>Pagos al equipo</b><small>lo que ya se registró como pagado</small></span><b className="num">{pagadoEquipo ? `−${$(pagadoEquipo)}` : $(0)}</b></div>
      {comisionesMes.length > 0 && <div className="sub-c"><span>Comisiones generadas en el periodo</span><span className="num">{$(comisionesMes.reduce((a, g) => a + g.comision, 0))}</span></div>}
      {porPagar > 0 && <div className="paso-c resta"><span><b>Falta por pagar al equipo</b><small>ya lo ganaron y todavía no se les paga</small></span><b className="num">−{$(porPagar)}</b></div>}
      <div className="paso-c resta"><span><b>Gastos del negocio</b><small>egresos registrados</small></span><b className="num">{egresos ? `−${$(egresos)}` : $(0)}</b></div>
      {[...gastosP].sort((a, b) => b.monto - a.monto).map((g) => <div key={g.categoria} className="sub-c"><span>{g.categoria}</span><span className="num">{$(g.monto)}</span></div>)}
      <div className="paso-c total"><span><b>Ganancia</b></span><b className="num">{firma(resultado)}</b></div>
      <p className="ayuda-txt">La ganancia es lo que le quedó al negocio en estas fechas: lo que se vendió, menos lo que se gastó y menos lo que le toca al equipo. No es el dinero que hay en la caja ni en el banco.</p>
      {retirado > 0 && <p className="ayuda-txt">En estas fechas salieron {$(retirado)} de la caja para la dueña o para guardarlos. No es un gasto, por eso no se resta aquí.</p>}
    </div>
  );

  // Cortes con faltante de los últimos 30 días sin revisar: se avisan arriba del historial.
  const revision = verCorte && (!tipo || tipo === "cortes")
    ? await cortesPorRevisar(bId, await turnosCerrados(bId, 1000, { desde: sumarDias(hoy, -30), hasta: hoy }), { zona, hoy, gente, folios: folios.size ? folios : await foliosCorte(bId), verEgresos, desde: sumarDias(hoy, -30) })
    : [];
  const descarga = s.puede("reportes.exportar") ? (tipo === "egresos" ? urlDescarga("gastos", f) : urlDescarga("ventas", f)) : undefined;

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      {verTodo && (
        <section className="cab-v cab-fin glass subir">
          <div className="cv-num">
            <span className="lab lab-ay">Ganancia {nombreP === "hoy" ? "de hoy" : `de ${nombreP}`}<Ayuda titulo="Ganancia">Lo que le quedó al negocio: lo vendido, menos los gastos y menos lo que le toca al equipo, aunque todavía no se le pague. No es el dinero que hay en la caja.</Ayuda></span>
            <b className="num">{firma(resultado)}</b>
            <BotonCajon texto={<>Cómo se llega<Icono n="derecha" /></>} titulo="Cómo se llega a la ganancia">{cuenta}</BotonCajon>
          </div>
          <div className="es-c">
            <div><span className="muted">Entró</span><span className="barra-m"><i style={{ width: `${(entro / maxB) * 100}%` }} /></span><b className="num">{$(entro)}</b></div>
            <div><span className="muted">Salió</span><span className="barra-m sal"><i style={{ width: `${(salio / maxB) * 100}%` }} /></span><b className="num">{$(salio)}</b></div>
          </div>
        </section>
      )}
      {verVentas && <CabeceraVentas barberiaId={bId} zona={zona} hoy={hoy} persona={verTodas ? persona || undefined : s.usuario.id} propias={!verTodas} {...periodoEncabezado(f.periodo, hoy)} />}
      {revision.length > 0 && <NecesitaRevision cortes={revision} puede={s.puede("caja.corregir")} />}
      {anterior && <p className="aviso-sutil">Mostrando {nombreP} hasta que empiece el mes.</p>}
      {movCaja && <CajaModal titular={s.usuario.rol === "duena"} inicial={q.caja === "movimiento" ? "movimiento" : null} turno={null} abierta={!!turno} limiteDiferencia={0}
        categorias={cats.filter((c) => c.activo && !esCategoriaComisiones(c.nombre)).map((c) => c.nombre)} configurar={s.puede("configuracion.egresos") && !s.vista} />}
      <Movimientos corregir={s.puede("caja.corregir")} abrirCorte={q.corte} botonCaja={movCaja ? <BotonCaja abierta={!!turno} /> : undefined} abrirEgreso={q.egreso === "1"} dias={historial} registrar={s.puede("gastos.registrar")} hoy={hoy} cajaAbierta={!!turno} categorias={cats}
        regreso={`/analitica/finanzas${new URLSearchParams(Object.entries(q).filter(([k, v]) => v && !["aviso", "error", "egreso", "caja"].includes(k)) as [string, string][]).toString() ? `?${new URLSearchParams(Object.entries(q).filter(([k, v]) => v && !["aviso", "error", "egreso", "caja"].includes(k)) as [string, string][])}` : ""}`}
        opcionesVenta={opcionesVenta}
        opciones={{ cajaHref: cobra && s.puede("caja.retiros") ? "/cobrar?caja=movimiento" : movCaja ? "/analitica/finanzas?caja=movimiento" : null, metodos: s.barberia.metodosEgreso, periodicidad: false, comprobantes: s.barberia.usaComprobantes, obligatorio: s.barberia.comprobanteObligatorio, frecuentes: frecuentes.map(({ id, concepto, categoria, monto, metodo, periodicidad }) => ({ id, concepto, categoria, monto, metodo, periodicidad })), sugeridas }}
        filtros={<BarraFiltros p={f.periodo} hoy={hoy} personas={equipo} persona={persona} buscar={f.buscar} sinPeriodo="Todas las fechas" textoBuscar="Buscar folio, servicio, persona o concepto"
          descarga={descarga}
          extra={TIPOS.length > 2 ? <SelectorUrl nombre="tipo" valor={tipo} opciones={TIPOS.map(([valor, texto]) => ({ valor, texto }))} etiqueta="Tipo de movimiento" /> : undefined} />} />
      <Paginacion ruta="/analitica/finanzas" params={q as Record<string, string | undefined>} pagina={pagina} paginas={paginas}
        texto={todosDias.length ? `${totalFilas} ${totalFilas === 1 ? "movimiento" : "movimientos"}${paginas > 1 ? `, página ${pagina} de ${paginas}` : ""}` : ""} />
    </>
  );
}
