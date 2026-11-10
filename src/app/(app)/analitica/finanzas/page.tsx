import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/BarraFiltros";
import { periodoEncabezado } from "@/components/CabeceraPeriodo";
import { BotonCajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import { Paginacion } from "@/components/Paginacion";
import { SelectorUrl } from "@/components/SelectorUrl";
import { requerirSesion } from "@/lib/auth";
import { faltantesDe } from "@/lib/faltantes";
import { cajaDe, categoriasGasto, resumenPeriodo } from "@/lib/datos";
import { db, schema as t } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { type ConsultaFiltros, leerFiltros, paginaDeRegistros, rangoDePagina } from "@/lib/filtros";
import { esMovil } from "@/lib/dispositivo";
import { formatoDinero } from "@/lib/money";
import { Movimientos, type DiaMovimientos, type Movimiento } from "./Movimientos";

export const metadata = { title: "Finanzas" };

const $ = formatoDinero;
const SUELDO = new Set(["sueldo", "mixto"]);
const TIPOS = [["", "Todos los movimientos"], ["ingresos", "Ingresos"], ["egresos", "Egresos"], ["equipo", "Pagos al equipo"]] as const;
const METODO: Record<string, string> = { efectivo: "efectivo", transferencia: "transferencia", tarjeta: "tarjeta" };

type Q = ConsultaFiltros & { tipo?: string; egreso?: string };

/** Finanzas y egresos en una sola pantalla: lo que quedó del periodo y todos los movimientos del negocio. */
export default async function Finanzas({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  const verTodo = s.puede("reportes.ver");
  if (!verTodo && !s.puede("gastos.ver")) redirect("/?aviso=sin-permiso");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const bId = s.barberia.id;
  const f = leerFiltros(q, hoy, []);
  // Quien solo ve egresos, solo ve egresos.
  const tipo = verTodo ? (TIPOS.some(([k]) => k === q.tipo) ? q.tipo ?? "" : "") : "egresos";
  const ver = (x: string) => !tipo || tipo === x;
  const desde = f.periodo?.desde, hasta = f.periodo?.hasta;
  const local = (col: unknown) => sql<string>`to_char((${col} at time zone ${zona})::date, 'YYYY-MM-DD')`;
  const enFechas = (col: unknown): SQL[] => (desde && hasta ? [sql`(${col} at time zone ${zona})::date between ${desde}::date and ${hasta}::date`] : []);
  const texto = f.buscar ? `%${f.buscar}%` : null;

  // Días que tienen algún movimiento, para paginar por días.
  const [diasV, diasG, diasP] = await Promise.all([
    ver("ingresos") && !texto ? db.selectDistinct({ d: local(t.ventas.creadoEn) }).from(t.ventas).where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), ...enFechas(t.ventas.creadoEn))) : [],
    ver("egresos") ? db.selectDistinct({ d: sql<string>`to_char(${t.gastos.fecha}, 'YYYY-MM-DD')` }).from(t.gastos).where(and(eq(t.gastos.barberiaId, bId), ...(desde && hasta ? [gte(t.gastos.fecha, desde), lte(t.gastos.fecha, hasta)] : []), ...(texto ? [or(ilike(t.gastos.concepto, texto), ilike(t.gastos.categoria, texto))!] : []))) : [],
    ver("equipo") || ver("ingresos") ? db.selectDistinct({ d: local(t.pagosComision.creadoEn) }).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), ...(tipo === "equipo" ? [eq(t.pagosComision.tipo, "pago")] : tipo === "ingresos" ? [eq(t.pagosComision.tipo, "renta")] : []), ...enFechas(t.pagosComision.creadoEn), ...(texto ? [ilike(t.usuarios.nombre, texto)] : []))) : [],
  ]);
  const todosDias = [...new Set([...diasV, ...diasG, ...diasP].map((x) => x.d))].sort().reverse();
  // En el teléfono se pagina por movimientos (7 por página); en escritorio, siete días por página.
  const movil = await esMovil();
  const r = movil ? { pagina: 1, paginas: 1, dias: todosDias, desde: todosDias[todosDias.length - 1] ?? hoy, hasta: todosDias[0] ?? hoy } : rangoDePagina(todosDias, f.pagina);
  const pd = r.dias.length ? r.desde : null, ph = r.dias.length ? r.hasta : null;
  const enPagina = (col: unknown): SQL[] => (pd && ph ? [sql`(${col} at time zone ${zona})::date between ${pd}::date and ${ph}::date`] : [sql`false`]);

  const quien = alias(t.usuarios, "quien");
  const cancelo = alias(t.usuarios, "cancelo");
  const [ventasDia, metodosDia, gastos, pagos, turno] = await Promise.all([
    ver("ingresos") && !texto ? db.select({ d: local(t.ventas.creadoEn), n: sql<number>`count(*)::int`, total: sql<number>`sum(${t.ventas.total})::int`, ultima: sql<Date>`max(${t.ventas.creadoEn})` })
      .from(t.ventas).where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), ...enPagina(t.ventas.creadoEn))).groupBy(sql`1`) : [],
    ver("ingresos") && !texto ? db.select({ d: local(t.ventas.creadoEn), metodo: t.pagos.nombreMetodo, total: sql<number>`sum(${t.pagos.monto})::int` })
      .from(t.pagos).innerJoin(t.ventas, eq(t.ventas.id, t.pagos.ventaId)).where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), ...enPagina(t.ventas.creadoEn))).groupBy(sql`1`, t.pagos.nombreMetodo) : [],
    ver("egresos") && pd && ph ? db.select({ g: t.gastos, quien: quien.nombre, cancelo: cancelo.nombre }).from(t.gastos)
      .innerJoin(quien, eq(quien.id, t.gastos.usuarioId)).leftJoin(cancelo, eq(cancelo.id, t.gastos.canceladoPor))
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, pd), lte(t.gastos.fecha, ph), ...(texto ? [or(ilike(t.gastos.concepto, texto), ilike(t.gastos.categoria, texto))!] : [])))
      .orderBy(desc(t.gastos.creadoEn)) : [],
    (ver("equipo") || ver("ingresos")) ? db.select({ p: t.pagosComision, nombre: t.usuarios.nombre }).from(t.pagosComision).innerJoin(t.usuarios, eq(t.usuarios.id, t.pagosComision.barberoId))
      .where(and(eq(t.pagosComision.barberiaId, bId), ...(tipo === "equipo" ? [eq(t.pagosComision.tipo, "pago")] : tipo === "ingresos" ? [eq(t.pagosComision.tipo, "renta")] : []), ...enPagina(t.pagosComision.creadoEn), ...(texto ? [ilike(t.usuarios.nombre, texto)] : [])))
      .orderBy(desc(t.pagosComision.creadoEn)) : [],
    cajaDe(s),
  ]);
  const comps = gastos.length ? await db.select({ id: t.comprobantes.id, gastoId: t.comprobantes.gastoId, nombre: t.comprobantes.nombre }).from(t.comprobantes)
    .where(and(eq(t.comprobantes.barberiaId, bId), inArray(t.comprobantes.gastoId, gastos.map((x) => x.g.id)))) : [];

  const PER: Record<string, string> = { semanal: "semanal", quincenal: "quincenal", mensual: "mensual" };
  const todosLosDias: DiaMovimientos[] = r.dias.map((d) => {
    const movs: (Movimiento & { t: number })[] = [];
    const v = ventasDia.find((x) => x.d === d);
    if (v) movs.push({
      id: `v${d}`, tipo: "venta", titulo: "Ventas del día", sub: `${v.n} ${v.n === 1 ? "cobro" : "cobros"}`, monto: v.total, t: new Date(v.ultima).getTime(),
      detalle: metodosDia.filter((m) => m.d === d).map((m) => [m.metodo, $(m.total)] as [string, string]),
    });
    for (const { g, quien: qn, cancelo: cn } of gastos.filter((x) => x.g.fecha === d)) {
      const comp = comps.find((c) => c.gastoId === g.id);
      const det: [string, string][] = [
        ["Registró", `${qn.split(" ")[0]}, ${horaCorta(g.creadoEn, zona)}`],
        ["Se pagó", g.metodo === "efectivo" ? (g.turnoId ? "En efectivo, de la caja" : "En efectivo, fuera de la caja") : `Con ${METODO[g.metodo] ?? g.metodo}`],
        ...(g.descripcion ? [["Descripción", g.descripcion] as [string, string]] : []),
        ...(g.canceladoEn ? [["Cancelado", `${cn?.split(" ")[0] ?? ""}: ${g.motivoCancelacion ?? ""}`] as [string, string]] : []),
      ];
      const cerrado = !!g.turnoId && g.turnoId !== turno?.id;
      movs.push({
        id: `g${g.id}`, tipo: "egreso", titulo: g.concepto, sub: [g.categoria, PER[g.periodicidad], METODO[g.metodo]].filter(Boolean).join(", "), monto: -g.monto,
        cancelado: !!g.canceladoEn, t: g.creadoEn.getTime(), detalle: det, comprobante: comp ? { id: comp.id, nombre: comp.nombre } : undefined,
        egreso: { id: g.id, concepto: g.concepto, categoria: g.categoria, metodo: g.metodo, monto: g.monto, cancelado: !!g.canceladoEn, puedeCancelar: s.puede("gastos.cancelar") && !g.canceladoEn && !cerrado, detalle: det },
      });
    }
    for (const { p, nombre } of pagos.filter((x) => fechaLocal(x.p.creadoEn, zona) === d)) {
      const renta = p.tipo === "renta";
      movs.push({
        id: `p${p.id}`, tipo: renta ? "renta" : "pago", titulo: renta ? `Renta de silla de ${nombre.split(" ")[0]}` : `Pago a ${nombre.split(" ")[0]}`,
        sub: renta ? "Ingreso" : "Pago al equipo", monto: renta ? p.monto : -p.monto, t: p.creadoEn.getTime(),
        detalle: [["Hora", horaCorta(p.creadoEn, zona)], ...(p.nota ? [["Nota", p.nota] as [string, string]] : [])],
      });
    }
    movs.sort((a, b) => b.t - a.t);
    return { fecha: d, titulo: d === hoy ? "Hoy" : fechaLarga(d), neto: movs.filter((m) => !m.cancelado).reduce((a, m) => a + m.monto, 0), movs };
  });
  let paginaMov = r.pagina, paginasMov = r.paginas, dias = todosLosDias;
  if (movil) {
    const pg = paginaDeRegistros(todosLosDias.flatMap((d) => d.movs.map((m) => ({ d, m }))), f.pagina, 7);
    paginaMov = pg.pagina; paginasMov = pg.paginas;
    dias = [...new Set(pg.items.map((x) => x.d))].map((d) => ({ ...d, movs: pg.items.filter((x) => x.d === d).map((x) => x.m) }));
  }

  // Encabezado: el periodo elegido o el mes en curso (el día 1, el mes anterior).
  const { p, anterior } = periodoEncabezado(f.periodo, hoy);
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
  const ventasP = rp?.netas ?? 0;
  const rentas = pagosP.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const pagadoEquipo = pagosP.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const egresos = gastosP.reduce((a, x) => a + x.monto, 0);
  const entro = ventasP + rentas, salio = egresos + pagadoEquipo, quedo = entro - salio;
  const esSueldo = (id: string) => SUELDO.has(reglas.find((x) => x.id === id)?.tipo ?? "");
  const comisionesMes = generadas.filter((g) => !esSueldo(g.id));
  const falt = await faltantesDe(bId, p.desde, p.hasta);
  const porPagar = comisionesMes.reduce((a, g) => a + Math.max(g.comision - pagosP.filter((x) => x.id === g.id && x.tipo === "pago").reduce((b, x) => b + x.monto, 0) - (falt.find((x) => x.usuarioId === g.id)?.monto ?? 0), 0), 0);
  const nombreP = p.tipo === "mes" ? p.etiqueta.split(" ")[0].toLowerCase() : p.etiqueta.toLowerCase();
  const maxB = Math.max(entro, salio, 1);
  const firma = (c: number) => (c < 0 ? `−${$(-c)}` : $(c));

  const cuenta = (
    <div className="cuenta-c">
      <div className="paso-c"><span><b>Entró por ventas</b><small>lo que pagaron los clientes</small></span><b className="num">{$(ventasP)}</b></div>
      {rp?.porMetodo.map(([m, v]) => <div key={m} className="sub-c"><span>{m}</span><span className="num">{$(v)}</span></div>)}
      {rentas > 0 && <div className="paso-c"><span><b>Rentas de silla</b><small>lo que pagaron los barberos</small></span><b className="num">+{$(rentas)}</b></div>}
      <div className="paso-c resta"><span><b>Pagos al equipo</b><small>lo que ya se registró como pagado</small></span><b className="num">{pagadoEquipo ? `−${$(pagadoEquipo)}` : $(0)}</b></div>
      {comisionesMes.length > 0 && <div className="sub-c"><span>Comisiones generadas en el periodo</span><span className="num">{$(comisionesMes.reduce((a, g) => a + g.comision, 0))}</span></div>}
      {porPagar > 0 && <div className="sub-c"><span>Falta por pagar</span><span className="num">{$(porPagar)}</span></div>}
      <div className="paso-c resta"><span><b>Gastos del negocio</b><small>egresos registrados</small></span><b className="num">{egresos ? `−${$(egresos)}` : $(0)}</b></div>
      {[...gastosP].sort((a, b) => b.monto - a.monto).map((g) => <div key={g.categoria} className="sub-c"><span>{g.categoria}</span><span className="num">{$(g.monto)}</span></div>)}
      <div className="paso-c total"><span><b>Lo que quedó</b></span><b className="num">{firma(quedo)}</b></div>
      <p className="ayuda-txt">Los pagos al equipo se suman cuando alguien los registra con el botón Pagar en Ventas, eligiendo al barbero.</p>
    </div>
  );

  return (
    <>
      {verTodo && (
        <>
          <section className="cab-v cab-fin glass subir">
            <div className="cv-num">
              <span className="lab">Lo que quedó en {nombreP}</span>
              <b className="num">{firma(quedo)}</b>
              <BotonCajon texto={<>Cómo se llega<Icono n="derecha" /></>} titulo="Cómo se llega al resultado">{cuenta}</BotonCajon>
            </div>
            <div className="es-c">
              <div><span className="muted">Entró</span><span className="barra-m"><i style={{ width: `${(entro / maxB) * 100}%` }} /></span><b className="num">{$(entro)}</b></div>
              <div><span className="muted">Salió</span><span className="barra-m sal"><i style={{ width: `${(salio / maxB) * 100}%` }} /></span><b className="num">{$(salio)}</b></div>
            </div>
          </section>
          {anterior && <p className="aviso-sutil">Mostrando {nombreP} hasta que empiece el mes.</p>}
        </>
      )}
      <Movimientos abrirEgreso={q.egreso === "1"} dias={dias} registrar={s.puede("gastos.registrar")} hoy={hoy} cajaAbierta={!!turno} categorias={cats}
        opciones={{ metodos: s.barberia.metodosEgreso, periodicidad: s.barberia.usaPeriodicidad, comprobantes: s.barberia.usaComprobantes, frecuentes: frecuentes.map(({ id, concepto, categoria, monto, metodo, periodicidad }) => ({ id, concepto, categoria, monto, metodo, periodicidad })) }}
        filtros={<BarraFiltros p={f.periodo} hoy={hoy} personas={[]} persona="" buscar={f.buscar} sinPeriodo="Todas las fechas" textoBuscar="Buscar"
          descarga={s.puede("reportes.exportar") ? `/api/exportar?tipo=gastos${f.periodo ? `&desde=${f.periodo.desde}&hasta=${f.periodo.hasta}` : ""}` : undefined}
          extra={verTodo ? <SelectorUrl nombre="tipo" valor={tipo} opciones={TIPOS.map(([valor, texto]) => ({ valor, texto }))} etiqueta="Tipo de movimiento" /> : undefined} />} />
      <Paginacion ruta="/analitica/finanzas" params={q as Record<string, string | undefined>} pagina={paginaMov} paginas={paginasMov}
        texto={todosDias.length ? (movil ? `Página ${paginaMov} de ${paginasMov}` : `${todosDias.length} ${todosDias.length === 1 ? "día" : "días"} con movimientos${r.paginas > 1 ? `, página ${r.pagina} de ${r.paginas}` : ""}`) : ""} />
    </>
  );
}
