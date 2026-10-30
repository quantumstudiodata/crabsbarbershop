import { redirect } from "next/navigation";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo, ventasEntre } from "@/lib/datos";
import { diasEntre, fechaCorta, fechaLocal, inicioDeMes, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { serieHoy } from "@/lib/series";

export const metadata = { title: "Analítica" };

const TONOS = ["#2b3a47", "#6d8597", "#a9b8c5", "#c58a3e", "#8ea5b8"];
const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default async function Resumen({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.ver")) redirect(s.puede("ventas.ver_todas") ? "/analitica/ventas" : "/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy, "mes");
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
    resumenPeriodo(s.barberia.id, p.desde, p.hasta, zona),
    resumenPeriodo(s.barberia.id, prev.desde, prev.hasta, zona),
    resumenPeriodo(s.barberia.id, prevJusto.desde, prevJusto.hasta, zona),
  ]);
  let previoNetas = justo.netas;
  if (dia && p.desde === hoy) {
    // Hoy: contra lo vendido el mismo día de la semana pasada hasta esta misma hora.
    const { ventas } = await ventasEntre(s.barberia.id, prev.desde, prev.desde, { zona });
    previoNetas = ventas.filter((v) => v.estado === "pagada" && v.creadoEn.getTime() <= Date.now() - 7 * 86400000).reduce((a, v) => a + v.total, 0);
  }
  const v = cambio(r.netas, previoNetas);
  const comparacion = dia ? `que el ${DIA_CORTO[new Date(`${prev.desde}T12:00:00Z`).getUTCDay()].toLowerCase()} pasado${p.desde === hoy ? " a esta hora" : ""}` : p.tipo === "anio" ? "que el año pasado a estas alturas" : tramo < largo ? `que los primeros ${tramo} días del periodo anterior` : "que el periodo anterior";

  const dias = Array.from({ length: largo }, (_, i) => sumarDias(p.desde, i));
  const porMes = (mapa: Map<string, number>, anio: string) => Array.from({ length: 12 }, (_, i) => [...mapa.entries()].filter(([d]) => d.startsWith(`${anio}-${String(i + 1).padStart(2, "0")}`)).reduce((a, [, x]) => a + x, 0));
  let serie: { actual: (number | null)[]; previo: number[]; etiquetas: string[]; cada: number; enCurso?: number };
  if (dia) {
    const { ventas } = await ventasEntre(s.barberia.id, prev.desde, p.desde, { zona });
    const movs = ventas.filter((x) => x.estado === "pagada" && (x.fecha === p.desde || x.fecha === prev.desde)).map((x) => ({ creadoEn: x.creadoEn, fecha: x.fecha, monto: x.total }));
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
  const diasSinVentas = !dia && !anual ? dias.filter((d) => d <= hoy && !(r.porDia.get(d) ?? 0)).length : 0;
  const mejor = !dia && !anual ? dias.reduce((m, d) => ((r.porDia.get(d) ?? 0) > (r.porDia.get(m) ?? 0) ? d : m), dias[0]) : null;
  const totalMetodos = r.porMetodo.reduce((a, [, x]) => a + x, 0);
  const maxServ = Math.max(...r.porServicio.map(([, x]) => x.monto), 1);

  return (
    <>
      <div className="entre">
        <SelectorPeriodo ruta="/analitica" p={p} hoy={hoy} conDia conAnio />
        {s.puede("reportes.exportar") && <a className="bt sec solo chico" href={`/api/exportar?tipo=ventas&desde=${p.desde}&hasta=${p.hasta}`}><Icono n="descargar" />Descargar</a>}
      </div>

      <section className="kpis subir">
        <div className="kpi principal">
          <span className="lab">Ventas totales</span>
          <div className="big"><Cuenta valor={r.netas} /></div>
          {v === null ? <span className="pill gris">Sin ventas para comparar</span>
            : <span className={`pill ${v >= 0 ? "ok" : "warn"}`}>{v >= 0 ? "↗" : "↘"} {Math.abs(v)}% {v >= 0 ? "más" : "menos"} {comparacion}</span>}
        </div>
        <div className="kpi"><span className="lab">Clientes</span><b><Cuenta valor={r.clientes} formato="entero" /></b><small>{r.servicios} servicios</small></div>
        <div className="kpi"><span className="lab">Promedio por cliente</span><b>{r.clientes ? formatoDinero(r.ticket) : "Sin datos"}</b><small>{completo.clientes ? `Antes ${formatoDinero(completo.ticket)}` : "\u00a0"}</small></div>
      </section>

      <section className="glass panel subir d1" style={{ padding: 22 }}>
        <div className="entre">
          <span className="lab">{dia ? "Hora por hora" : anual ? "Mes por mes" : "Día por día"}</span>
          <span className="fila" style={{ gap: 14, fontSize: 12 }}>
            <span className="fila" style={{ gap: 6 }}><i className="ley-l" />Este periodo</span>
            <span className="fila muted" style={{ gap: 6 }}><i className="ley-p" />{dia ? "Semana pasada" : anual ? "Año pasado" : "Periodo anterior"}</span>
            {!dia && <span className="fila muted" style={{ gap: 6 }}><i className="ley-cero" />Sin ventas</span>}
          </span>
        </div>
        <Grafica id="resumen" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={230}
          puntos={!dia} enCurso={serie.enCurso} descripcion="Ventas del periodo comparadas con el periodo anterior" vacio="Sin ventas en estas fechas" />
        {mejor && r.netas > 0 && (
          <span className="ctx">El mejor día fue el {fechaCorta(mejor)}, con {formatoDinero(r.porDia.get(mejor) ?? 0)}.{diasSinVentas ? ` ${diasSinVentas} ${diasSinVentas === 1 ? "día" : "días"} sin ventas.` : ""}</span>
        )}
      </section>

      <section className="dos subir d2">
        <div className="glass panel">
          <span className="lab">Servicios más vendidos</span>
          {r.porServicio.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
            <div className="ranking">
              {r.porServicio.slice(0, 5).map(([n, x], i) => (
                <div key={n}>
                  <span className="rank">{i + 1}</span>
                  <span><span className="entre"><b>{n}</b><span className="num">{formatoDinero(x.monto)}</span></span>
                    <span className="barra-s"><i style={{ width: `${(x.monto / maxServ) * 100}%`, animationDelay: `${0.4 + i * 0.1}s` }} /></span>
                    <small className="muted">{x.veces} {x.veces === 1 ? "vez" : "veces"}</small></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Métodos de pago</span>
          {totalMetodos === 0 ? <p className="muted">Sin cobros en estas fechas.</p> : (
            <>
              <div className="reparto grande">{r.porMetodo.map(([n, x], i) => <span key={n} style={{ width: `${porcentaje(x, totalMetodos)}%`, background: TONOS[i % TONOS.length], animationDelay: `${0.3 + i * 0.15}s` }} />)}</div>
              <div className="lista">
                {r.porMetodo.map(([n, x], i) => (
                  <div key={n}><span className="fila" style={{ gap: 10 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: TONOS[i % TONOS.length] }} />{n}</span><span className="fila" style={{ gap: 12 }}><b className="num">{porcentaje(x, totalMetodos)}%</b><span className="num muted" style={{ minWidth: 80, textAlign: "right" }}>{formatoDinero(x)}</span></span></div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
