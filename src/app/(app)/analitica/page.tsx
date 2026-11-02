import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { db, schema as t } from "@/lib/db";
import { Grafica } from "@/components/Grafica";
import { BarraFiltros } from "@/components/BarraFiltros";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { equipoConVentas, resumenPeriodo, turnosCerrados, ventasEntre } from "@/lib/datos";
import { diasEntre, fechaCorta, fechaLocal, inicioDeMes, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { type ConsultaFiltros, urlDescarga } from "@/lib/filtros";
import { leerPeriodo } from "@/lib/periodo";
import { serieHoy } from "@/lib/series";

export const metadata = { title: "Analítica" };

const SUELDO = new Set(["sueldo", "mixto"]);

/** Línea suave y sin ejes para la tarjeta principal. */
function Trazo({ valores }: { valores: number[] }) {
  const W = 520, H = 70, n = Math.max(valores.length - 1, 1), max = Math.max(...valores, 1), min = Math.min(...valores, 0);
  const pt = valores.map((v, i) => [(i / n) * W, H - 6 - ((v - min) / (max - min || 1)) * (H - 12)]);
  const d = pt.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `C${pt[i - 1][0] + (x - pt[i - 1][0]) / 2},${pt[i - 1][1]} ${pt[i - 1][0] + (x - pt[i - 1][0]) / 2},${y} ${x},${y}`)).join(" ");
  return <svg className="trazo-r" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden><path d={d} /></svg>;
}
const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default async function Resumen({ searchParams }: { searchParams: Promise<ConsultaFiltros> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.ver")) redirect(s.puede("ventas.ver_todas") ? "/analitica/ventas" : s.puede("gastos.ver") || s.puede("gastos.registrar") ? "/analitica/gastos" : s.puede("cortes.ver") ? "/analitica/cortes" : "/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const q = await searchParams;
  const p = leerPeriodo(q, hoy, "mes");
  const equipo = await equipoConVentas(s.barberia.id);
  const persona = equipo.some((e) => e.id === q.persona) ? q.persona! : undefined;
  // Con una persona elegida, cada venta cuenta solo lo que atendió esa persona.
  const soloDe = <T extends { total: number; conceptos: { barberoId: string; precioCobrado: number }[] }>(vs: T[]) =>
    persona ? vs.map((v) => ({ ...v, total: v.conceptos.filter((c) => c.barberoId === persona).reduce((a, c) => a + c.precioCobrado, 0) })) : vs;
  const largo = diasEntre(p.desde, p.hasta) + 1;
  const anual = p.tipo === "anio" || largo > 62;
  const dia = p.tipo === "dia";
  // Periodo anterior: para un día, el mismo día de la semana pasada; para el año, el año pasado.
  const anioAnt = String(Number(p.desde.slice(0, 4)) - 1);
  const prev = dia ? { desde: sumarDias(p.desde, -7), hasta: sumarDias(p.desde, -7) }
    : p.tipo === "anio" ? { desde: `${anioAnt}-01-01`, hasta: `${anioAnt}-12-31` }
    : p.tipo === "mes" ? { desde: inicioDeMes(sumarDias(p.desde, -1)), hasta: sumarDias(p.desde, -1) }
    : { desde: sumarDias(p.desde, -largo), hasta: sumarDias(p.desde, -1) };
  // El porcentaje compara el mismo tramo transcurrido, para que sea justo con un periodo que no ha terminado.
  const tramo = diasEntre(p.desde, p.hasta > hoy ? hoy : p.hasta) + 1;
  const prevJusto = dia ? prev : p.tipo === "anio" ? { desde: prev.desde, hasta: p.hasta > hoy ? `${anioAnt}${hoy.slice(4)}` : prev.hasta } : tramo >= largo ? prev : { desde: prev.desde, hasta: (sumarDias(prev.desde, tramo - 1) < prev.hasta ? sumarDias(prev.desde, tramo - 1) : prev.hasta) };
  const [r, completo, justo] = await Promise.all([
    resumenPeriodo(s.barberia.id, p.desde, p.hasta, zona, persona),
    resumenPeriodo(s.barberia.id, prev.desde, prev.hasta, zona, persona),
    resumenPeriodo(s.barberia.id, prevJusto.desde, prevJusto.hasta, zona, persona),
  ]);
  let previoNetas = justo.netas;
  if (dia && p.desde === hoy) {
    // Hoy: contra lo vendido el mismo día de la semana pasada hasta esta misma hora.
    const { ventas } = await ventasEntre(s.barberia.id, prev.desde, prev.desde, { zona, barberoId: persona });
    previoNetas = soloDe(ventas).filter((v) => v.estado === "pagada" && v.creadoEn.getTime() <= Date.now() - 7 * 86400000).reduce((a, v) => a + v.total, 0);
  }
  const v = cambio(r.netas, previoNetas);
  const comparacion = dia ? `que el ${DIA_CORTO[new Date(`${prev.desde}T12:00:00Z`).getUTCDay()].toLowerCase()} pasado${p.desde === hoy ? " a esta hora" : ""}` : p.tipo === "anio" ? "que el año pasado a estas alturas" : tramo < largo ? `que los primeros ${tramo} días del periodo anterior` : "que el periodo anterior";

  const dias = Array.from({ length: largo }, (_, i) => sumarDias(p.desde, i));
  const porMes = (mapa: Map<string, number>, anio: string) => Array.from({ length: 12 }, (_, i) => [...mapa.entries()].filter(([d]) => d.startsWith(`${anio}-${String(i + 1).padStart(2, "0")}`)).reduce((a, [, x]) => a + x, 0));
  let serie: { actual: (number | null)[]; previo: number[]; etiquetas: string[]; cada: number; enCurso?: number };
  if (dia) {
    const { ventas } = await ventasEntre(s.barberia.id, prev.desde, p.desde, { zona, barberoId: persona });
    const movs = soloDe(ventas).filter((x) => x.estado === "pagada" && (x.fecha === p.desde || x.fecha === prev.desde)).map((x) => ({ creadoEn: x.creadoEn, fecha: x.fecha, monto: x.total }));
    serie = serieHoy(movs, p.desde, zona, p.desde === hoy);
  } else if (anual) {
    const y = p.desde.slice(0, 4);
    const mesActual = Number(hoy.slice(5, 7)) - 1;
    serie = { actual: porMes(r.porDia, y).map((x, i) => (`${y}-${String(i + 1).padStart(2, "0")}-01` <= hoy ? x : null)), previo: porMes(completo.porDia, anioAnt), etiquetas: MES_CORTO, cada: 1, enCurso: y === hoy.slice(0, 4) ? mesActual : undefined };
  } else {
    serie = {
      actual: dias.map((d) => (d <= hoy ? r.porDia.get(d) ?? 0 : null)),
      previo: dias.map((_, i) => completo.porDia.get(sumarDias(prev.desde, i)) ?? 0),
      etiquetas: dias.map((d) => (largo <= 7 ? DIA_CORTO[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8))))),
      cada: largo <= 7 ? 1 : 5,
      enCurso: dias.indexOf(hoy) >= 0 ? dias.indexOf(hoy) : undefined,
    };
  }
  const bId = s.barberia.id;
  const enRango = (col: unknown) => sql`(${col} at time zone ${zona})::date between ${p.desde}::date and ${p.hasta}::date`;
  const [pagos, reglas, gastos, cortes] = await Promise.all([
    db.select({ id: t.pagosComision.barberoId, tipo: t.pagosComision.tipo, monto: sql<number>`sum(${t.pagosComision.monto})::int` })
      .from(t.pagosComision).where(and(eq(t.pagosComision.barberiaId, bId), enRango(t.pagosComision.creadoEn))).groupBy(t.pagosComision.barberoId, t.pagosComision.tipo),
    db.select({ id: t.reglasComision.barberoId, tipo: t.reglasComision.tipo }).from(t.reglasComision)
      .where(and(eq(t.reglasComision.barberiaId, bId), isNull(t.reglasComision.vigenteHasta), isNull(t.reglasComision.servicioId))),
    db.select({ monto: sql<number>`coalesce(sum(${t.gastos.monto}), 0)::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))),
    turnosCerrados(bId, 1000, { desde: p.desde, hasta: p.hasta }),
  ]);
  const esSueldo = (id: string) => SUELDO.has(reglas.find((x) => x.id === id)?.tipo ?? "");
  const sueldos = pagos.filter((x) => x.tipo === "pago" && esSueldo(x.id)).reduce((a, x) => a + x.monto, 0);
  const comisiones = pagos.filter((x) => x.tipo === "pago" && !esSueldo(x.id)).reduce((a, x) => a + x.monto, 0);
  const rentas = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const egresos = gastos[0]?.monto ?? 0;
  const resultado = r.netas + rentas - egresos - sueldos - comisiones;
  const firma = (c: number) => (c < 0 ? `−${formatoDinero(-c)}` : formatoDinero(c));
  // Lo vendido acumulado, para la línea de la tarjeta principal.
  let acum = 0;
  const trazo = (serie.actual.filter((x) => x !== null) as number[]).map((x) => (acum += x));
  const conDif = cortes.filter((c) => (c.diferencia ?? 0) !== 0);
  const neta = cortes.reduce((a, c) => a + (c.diferencia ?? 0), 0);
  const diasCorridos = dia ? 1 : Math.max(1, diasEntre(p.desde, p.hasta > hoy ? hoy : p.hasta) + 1);
  const metaMes = s.barberia.usaMetas && s.barberia.metaMensual > 0 && p.tipo === "mes" && !persona ? s.barberia.metaMensual : 0;
  const totalEquipo = Math.max(1, r.porBarbero.reduce((a, x) => a + x.monto, 0));
  const masPedidos = [...r.porServicio].sort((a, b) => b[1].veces - a[1].veces).slice(0, 5);
  const nombreP = p.tipo === "mes" ? p.etiqueta.split(" ")[0].toLowerCase() : p.etiqueta.toLowerCase();
  const diasSinVentas = !dia && !anual ? dias.filter((d) => d <= hoy && !(r.porDia.get(d) ?? 0)).length : 0;
  const mejor = !dia && !anual ? dias.reduce((m, d) => ((r.porDia.get(d) ?? 0) > (r.porDia.get(m) ?? 0) ? d : m), dias[0]) : null;
  


  return (
    <>
      <BarraFiltros p={p} hoy={hoy} personas={equipo} persona={persona ?? ""} buscar="" conBuscar={false}
        descarga={s.puede("reportes.exportar") ? urlDescarga("ventas", { periodo: p, persona: persona ?? "", buscar: "", pagina: 1 }) : undefined} />

      {!persona && (
        <section className="glass hero-r subir">
          <div className="hero-r-izq">
            <span className="lab">Resultado del negocio, {nombreP}</span>
            <b className="big-mv num">{firma(resultado)}</b>
            <small className="muted">Lo que queda después de egresos y pagos al equipo.</small>
            {trazo.length > 2 && <Trazo valores={trazo} />}
          </div>
          <div className="lista-r">
            <div><span>Ventas{rentas ? " y rentas" : ""}</span><b className="num">{formatoDinero(r.netas + rentas)}</b></div>
            <div><span>Egresos</span><b className="num">{egresos ? `−${formatoDinero(egresos)}` : formatoDinero(0)}</b></div>
            <div><span>Comisiones pagadas</span><b className="num">{comisiones ? `−${formatoDinero(comisiones)}` : formatoDinero(0)}</b></div>
            <div><span>Sueldos pagados</span><b className="num">{sueldos ? `−${formatoDinero(sueldos)}` : formatoDinero(0)}</b></div>
          </div>
        </section>
      )}

      <section className={`kpis-r subir d1${metaMes ? "" : " tres"}`}>
        <div className="glass kpi-r"><span className="lab">Ventas</span><b className="num">{formatoDinero(r.netas)}</b>
          <small>{v === null ? "Sin ventas para comparar" : `${v >= 0 ? "↗" : "↘"} ${Math.abs(v)}% ${v >= 0 ? "más" : "menos"} ${comparacion}`}</small></div>
        <div className="glass kpi-r"><span className="lab">Clientes</span><b className="num"><Cuenta valor={r.clientes} formato="entero" /></b>
          <small>{dia ? `${r.servicios} servicios` : `${Math.round((r.clientes / diasCorridos) * 10) / 10} por día`}</small></div>
        <div className="glass kpi-r"><span className="lab">Promedio por cliente</span><b className="num">{r.clientes ? formatoDinero(r.ticket) : "Sin datos"}</b>
          <small>{completo.clientes ? `Antes ${formatoDinero(completo.ticket)}` : "\u00a0"}</small></div>
        {metaMes > 0 && <div className="glass kpi-r"><span className="lab">Meta del mes</span><b className="num">{porcentaje(r.netas, metaMes)}%</b>
          <small>{formatoDinero(r.netas)} de {formatoDinero(metaMes)}</small></div>}
      </section>

      <section className="dos-r subir d2">
        <div className="glass panel" style={{ padding: 22 }}>
          <div className="entre">
            <span className="lab">{dia ? "Ventas por hora" : anual ? "Ventas por mes" : "Ventas por día"}</span>
            <span className="leyenda-mv"><span><i className="l-act" />Este periodo</span><span><i className="l-prev" />{dia ? "Semana pasada" : anual ? "Año pasado" : "Periodo anterior"}</span></span>
          </div>
          <Grafica id="resumen" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={210}
            puntos={!dia} enCurso={serie.enCurso} descripcion="Ventas del periodo comparadas con el periodo anterior" vacio="Sin ventas en estas fechas" />
          {mejor && r.netas > 0 && (
            <span className="ctx">El mejor día fue el {fechaCorta(mejor)}, con {formatoDinero(r.porDia.get(mejor) ?? 0)}.{diasSinVentas ? ` ${diasSinVentas} ${diasSinVentas === 1 ? "día" : "días"} sin ventas.` : ""}</span>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Ventas por barbero</span>
          {r.porBarbero.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
            <div className="barberos-r">
              {r.porBarbero.map((b) => {
                const e = equipo.find((x) => x.id === b.id);
                const pct = Math.round((b.monto / totalEquipo) * 100);
                return (
                  <div key={b.id}>
                    <Avatar avatar={e?.avatar ?? "iniciales"} nombre={b.nombre} t={36} />
                    <span className="nom-fin"><b>{b.nombre.split(" ").slice(0, 2).join(" ")}</b><small>{b.servicios} {b.servicios === 1 ? "servicio" : "servicios"}</small></span>
                    <b className="num">{formatoDinero(b.monto)}</b>
                    <span className="anillo-fin chico" style={{ ["--p" as string]: `${pct}` }}><span>{pct}%</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="dos-r b subir d3">
        <div className="glass panel">
          <span className="lab">Servicios más solicitados</span>
          {masPedidos.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
            <div className="pedidos-r">
              {masPedidos.map(([n, x]) => (
                <div key={n}><span className="cuenta-r num">{x.veces}</span><span>{n}</span><b className="num">{formatoDinero(x.monto)}</b></div>
              ))}
            </div>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Caja</span>
          <div className="datos">
            <div><span>Cortes realizados</span><b className="num">{cortes.length}</b></div>
            <div><span>Con diferencia</span><b className="num">{conDif.length}</b></div>
            <div><span>Diferencia neta</span><b className="num">{neta === 0 ? "Sin diferencias" : `${neta < 0 ? "−" : "+"}${formatoDinero(Math.abs(neta))}`}</b></div>
          </div>
        </div>
      </section>
    </>
  );
}
