import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { SelectorPeriodo } from "@/components/Periodo";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { equipoQueAtiende, metasDelMes, cajaDe, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { META_INICIAL } from "@/lib/metas";
import { and, eq, sql } from "drizzle-orm";
import { Alternar } from "./Alternar";
import { diasEntre, fechaLarga, fechaLocal, horaCorta, horaLocal, inicioDeMes, lunesDe, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";
import { serieHoy } from "@/lib/series";
import { HistorialVentas, type DiaVentas } from "@/components/HistorialVentas";

export const metadata = { title: "Mis ventas" };

const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default async function MisVentas({ searchParams }: { searchParams: Promise<ConsultaPeriodo & { aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (s.usuario.rol !== "barbera" && s.usuario.rol !== "encargada") redirect("/analitica");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const yo = s.usuario.id;
  // Sin periodo elegido: hoy si ya hay ventas hoy; si no, la semana; si tampoco, el mes.
  const elegido = q.periodo || q.fecha || q.mes || q.anio || q.desde;
  let porDefecto: "dia" | "semana" | "mes" = "dia";
  if (!elegido) {
    const [{ d }] = await db.select({ d: sql<string>`max(to_char(${schema.ventas.creadoEn} at time zone ${zona}, 'YYYY-MM-DD'))` }).from(schema.ventas)
      .where(and(eq(schema.ventas.barberiaId, s.barberia.id), sql`exists (select 1 from ${schema.conceptos} c where c.venta_id = ${schema.ventas.id} and c.barbero_id = ${yo})`));
    porDefecto = d === hoy ? "dia" : d && d >= lunesDe(hoy) ? "semana" : "mes";
  }
  const p = leerPeriodo(q, hoy, porDefecto);
  const largo = diasEntre(p.desde, p.hasta) + 1;
  const anual = p.tipo === "anio" || largo > 62;
  const prevDesde = p.tipo === "dia" ? sumarDias(p.desde, -7) : p.tipo === "anio" ? `${Number(p.desde.slice(0, 4)) - 1}-01-01` : p.tipo === "mes" ? inicioDeMes(sumarDias(p.desde, -1)) : sumarDias(p.desde, -largo);
  const prevHasta = p.tipo === "dia" ? sumarDias(p.desde, -7) : p.tipo === "anio" ? `${Number(p.desde.slice(0, 4)) - 1}-12-31` : sumarDias(p.desde, -1);
  const [{ ventas }, previo, equipo, turno] = await Promise.all([
    ventasEntre(s.barberia.id, p.desde, p.hasta, { zona }),
    ventasEntre(s.barberia.id, prevDesde, prevHasta, { zona, barberoId: yo }),
    equipoQueAtiende(s.barberia.id),
    cajaDe(s),
  ]);
  const pagadasTodas = ventas.filter((v) => v.estado === "pagada");
  const mias = ventas.filter((v) => v.conceptos.some((c) => c.barberoId === yo));
  const pagadas = mias.filter((v) => v.estado === "pagada");
  const montoMio = (v: (typeof ventas)[number]) => v.conceptos.filter((c) => c.barberoId === yo).reduce((a, c) => a + c.precioCobrado, 0);
  const vendido = pagadas.reduce((a, v) => a + montoMio(v), 0);
  const servicios = pagadas.reduce((a, v) => a + v.conceptos.filter((c) => c.barberoId === yo).length, 0);
  const vendidoPrevio = previo.ventas.filter((v) => v.estado === "pagada").reduce((a, v) => a + montoMio(v), 0);
  const variacion = cambio(vendido, vendidoPrevio);

  // Lo cobrado de mis servicios, repartido por método de pago en proporción a mi parte de cada venta.
  const porMetodo = new Map<string, number>();
  for (const v of pagadas) {
    const parte = v.total ? montoMio(v) / v.total : 0;
    for (const pg of v.pagos) porMetodo.set(pg.esEfectivo ? "Efectivo" : pg.metodo, (porMetodo.get(pg.esEfectivo ? "Efectivo" : pg.metodo) ?? 0) + Math.round(pg.monto * parte));
  }
  const efectivo = porMetodo.get("Efectivo") ?? 0;
  const otros = [...porMetodo.entries()].filter(([m]) => m !== "Efectivo");

  const conteo = new Map<string, { veces: number; monto: number }>();
  for (const v of pagadas) for (const c of v.conceptos) if (c.barberoId === yo) {
    const x = conteo.get(c.nombre) ?? { veces: 0, monto: 0 };
    conteo.set(c.nombre, { veces: x.veces + 1, monto: x.monto + c.precioCobrado });
  }
  const porVeces = [...conteo.entries()].sort((a, b) => b[1].veces - a[1].veces || b[1].monto - a[1].monto).slice(0, 3);
  const porIngreso = [...conteo.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 3);
  const metodosLista = [["Efectivo", efectivo] as [string, number], ...otros].filter(([m, v]) => v > 0 || m === "Efectivo");
  const TONOS = ["#2b3a47", "#6c8597", "#b5c2cd", "#8ea5b8"];

  // Meta del periodo: su meta diaria (de la meta mensual del negocio, o la suya) por los días de trabajo del periodo.
  let meta = 0;
  if (s.barberia.usaMetas) {
    const [delMes, [u]] = await Promise.all([
      metasDelMes(s.barberia.id, s.barberia.metaMensual, zona, hoy),
      db.select({ meta: schema.usuarios.metaSemanal }).from(schema.usuarios).where(eq(schema.usuarios.id, yo)),
    ]);
    const mia = delMes?.porBarbero.find((x) => x.id === yo);
    const diaria = u?.meta ? Math.round(u.meta / 6) : mia?.aplica ? mia.diaria : Math.round(META_INICIAL / 6);
    let habiles = 0;
    for (let d = p.desde; d <= p.hasta; d = sumarDias(d, 1)) if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) habiles++;
    meta = diaria * Math.max(habiles, 1);
  }

  const rendimiento = equipo.map((e) => {
    const cs = pagadasTodas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === e.id));
    return { ...e, servicios: cs.length, monto: cs.reduce((a, c) => a + c.precioCobrado, 0) };
  }).sort((a, b) => b.monto - a.monto);
  const maxRend = Math.max(...rendimiento.map((r) => r.monto), 1);

  // Gráfica del periodo contra el anterior.
  const dias = Array.from({ length: largo }, (_, i) => sumarDias(p.desde, i));
  const porDia = (lista: typeof ventas, f: string) => lista.filter((v) => v.estado === "pagada" && v.fecha === f).reduce((a, v) => a + montoMio(v), 0);
  const porMes = (lista: typeof ventas, anio: string, m: number) => lista.filter((v) => v.estado === "pagada" && v.fecha.startsWith(`${anio}-${String(m + 1).padStart(2, "0")}`)).reduce((a, v) => a + montoMio(v), 0);
  const porHoras = p.tipo === "dia";
  const horas = porHoras ? serieHoy([...mias, ...previo.ventas].filter((v) => v.estado === "pagada").map((v) => ({ creadoEn: v.creadoEn, fecha: v.fecha, monto: montoMio(v) })), p.desde, zona, p.desde === hoy) : null;
  // Para un día, la comparación es contra el mismo día de la semana anterior.
  const serie = horas ? { actual: horas.actual, previo: horas.previo, etiquetas: horas.etiquetas, cada: horas.cada } : anual
    ? { actual: MES_CORTO.map((_, m) => (`${p.desde.slice(0, 4)}-${String(m + 1).padStart(2, "0")}-01` <= hoy ? porMes(mias, p.desde.slice(0, 4), m) : null)), previo: MES_CORTO.map((_, m) => porMes(previo.ventas, prevDesde.slice(0, 4), m)), etiquetas: MES_CORTO, cada: 1 }
    : {
      actual: dias.map((d) => (d <= hoy ? porDia(mias, d) : null)),
      previo: dias.map((_, i) => porDia(previo.ventas, sumarDias(prevDesde, i))),
      etiquetas: dias.map((d) => (largo <= 7 ? DIA_CORTO[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8))))),
      cada: largo <= 7 ? 1 : 5,
    };

  // El mejor momento del periodo: la hora, el día o el mes con más ventas.
  // Por hora la gráfica es acumulada; para el mejor momento se usa lo de cada hora.
  const deCada = porHoras ? serie.actual.map((v, i) => (v === null ? null : v - (i ? serie.actual[i - 1] ?? 0 : 0))) : serie.actual;
  const mejorI = deCada.reduce<number>((m, v, i) => ((v ?? 0) > (deCada[m] ?? 0) ? i : m), 0);
  const mejorV = deCada[mejorI] ?? 0;
  const horaInicio = porHoras ? Number(serie.etiquetas[0].split(":")[0]) : 0;
  const mejorTitulo = porHoras ? "Mejor hora" : anual ? "Mejor mes" : "Mejor día";
  const nombreMomento = (i: number) => porHoras ? serie.etiquetas[i] : anual ? MES_LARGO[i] : largo <= 7 ? DIA_LARGO[new Date(`${dias[i]}T12:00:00Z`).getUTCDay()] : `${Number(dias[i].slice(8))} ${MES_LARGO[Number(dias[i].slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`;
  // Servicios por momento, para el globo y la vista por servicios.
  const momento = (v: (typeof ventas)[number]) => porHoras ? horaLocal(v.creadoEn, zona) - horaInicio : anual ? Number(v.fecha.slice(5, 7)) - 1 : dias.indexOf(v.fecha);
  const servDeCada = serie.actual.map((_, i) => pagadas.filter((v) => v.fecha === p.desde || !porHoras).filter((v) => momento(v) === i).reduce((a, v) => a + v.conceptos.filter((c) => c.barberoId === yo).length, 0));
  // Por hora, también acumulado, igual que la gráfica de importe.
  const servPorMomento = porHoras ? servDeCada.map((_, i) => servDeCada.slice(0, i + 1).reduce((a, x) => a + x, 0)) : servDeCada;
  const globos = serie.actual.map((v, i) => (v === null ? null : porHoras
    ? [`A las ${serie.etiquetas[i]}`, formatoDinero(v), `${formatoDinero(deCada[i] ?? 0)} en esa hora`]
    : [nombreMomento(i), formatoDinero(v), `${servPorMomento[i]} ${servPorMomento[i] === 1 ? "servicio" : "servicios"}`]) as [string, string, string]);
  const diasConVenta = !porHoras && !anual ? dias.filter((d) => d <= hoy).length : 0;

  const ahora = Date.now();
  const historial: DiaVentas[] = [...new Set(mias.map((v) => v.fecha))].map((f) => {
    const delDia = mias.filter((v) => v.fecha === f);
    return {
      fecha: f, titulo: fechaLarga(f), total: delDia.filter((v) => v.estado === "pagada").reduce((a, v) => a + montoMio(v), 0),
      filas: delDia.map((v) => {
        const mios = v.conceptos.filter((c) => c.barberoId === yo);
        const nombres = new Map<string, number>();
        for (const c of mios) nombres.set(c.nombre, (nombres.get(c.nombre) ?? 0) + 1);
        const limite = v.creadoEn.getTime() + MINUTOS_CORRECCION * 60000;
        const anulable = v.estado === "pagada" && v.registradaPorId === yo && turno?.id === v.turnoId && ahora < limite;
        const propina = v.propinas.filter((x) => x.barberoId === yo).reduce((a, x) => a + x.monto, 0);
        return {
          id: v.id, folio: v.folio, hora: horaCorta(v.creadoEn, zona), monto: montoMio(v), cancelada: v.estado === "cancelada",
          servicios: [...nombres.entries()].map(([n, k]) => (k > 1 ? `${n} x${k}` : n)).join(", "),
          // Solo la parte de este barbero.
          detalle: [
            ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(Math.round(pg.monto * (v.total ? montoMio(v) / v.total : 0)))}`).join(" y ") || "Sin pago"],
            ...(propina ? [["Propina", formatoDinero(propina)] as [string, string]] : []),
            ["Registró", v.registradaPor.split(" ")[0]],
            ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
          ] as [string, string][],
          accion: anulable ? { tipo: "anular" as const, hasta: horaCorta(new Date(limite), zona) } : undefined,
        };
      }),
    };
  });

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <SelectorPeriodo p={p} hoy={hoy} conSemana />
      <section className="glass hero-mv subir">
        <div className="hero-izq">
          <span className="lab">Total de ventas</span>
          <div className="big-mv"><Cuenta valor={vendido} /></div>
          {variacion === null
            ? <span className="pill gris">Sin registros en el periodo anterior</span>
            : <span className={`pill ${variacion >= 0 ? "ok" : "warn"}`}>{variacion >= 0 ? "↗" : "↘"} {Math.abs(variacion)}% {variacion >= 0 ? "más" : "menos"} que {porHoras ? "el mismo día de la semana pasada" : p.tipo === "semana" ? "la semana pasada" : p.tipo === "mes" ? "el mes pasado" : p.tipo === "anio" ? "el año pasado" : "el periodo anterior"}</span>}
          {meta > 0 && (
            <div className="meta-mv">
              <span>Meta</span>
              <span className="barra-mv"><i style={{ width: `${Math.min(porcentaje(vendido, meta), 100)}%` }} /></span>
              <b>{porcentaje(vendido, meta)}%</b>
              <small>de {formatoDinero(meta)}</small>
            </div>
          )}
        </div>
        <div className="hero-der">
          <div className="stats-mv">
            <div><span className="lab">Servicios</span><b><Cuenta valor={servicios} formato="entero" /></b><small>{diasConVenta > 1 ? `${Math.round((servicios / diasConVenta) * 10) / 10} por día` : "realizados"}</small></div>
            <div><span className="lab">Promedio</span><b>{servicios ? formatoDinero(Math.round(vendido / servicios / 100) * 100) : "Sin datos"}</b><small>por servicio</small></div>
            <div><span className="lab">{mejorTitulo}</span><b>{mejorV > 0 ? (porHoras ? `${serie.etiquetas[mejorI]}` : nombreMomento(mejorI)) : "Sin datos"}</b><small>{mejorV > 0 ? formatoDinero(mejorV) : "todavía"}</small></div>
          </div>
          <div className="pagos-mv">
            <span className="lab">Cómo te pagaron</span>
            <div className="apil-mv">{vendido > 0 ? metodosLista.map(([m, v], i) => v > 0 && <i key={m} style={{ flex: v, background: TONOS[i % TONOS.length], animationDelay: `${0.3 + i * 0.12}s` }} />) : <i style={{ flex: 1, background: "rgba(20,35,50,.08)" }} />}</div>
            <div className="pm-mv">
              {metodosLista.map(([m, v], i) => (
                <div key={m}><i style={{ background: TONOS[i % TONOS.length] }} /><span>{m}<b>{formatoDinero(v)}<small>{porcentaje(v, vendido)}%</small></b></span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="cuerpo-mv subir d1">
        <div className="glass panel graf-mv">
          <Alternar titulo={porHoras ? "Ventas por hora" : anual ? "Ventas por mes" : "Ventas por día"} opciones={["Importe", "Servicios"]} vistas={[
            <Grafica key="i" id="mv-importe" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={290}
              puntos={!porHoras} enCurso={horas?.enCurso ?? (dias.indexOf(hoy) >= 0 && !anual ? dias.indexOf(hoy) : undefined)} globos={globos}
              descripcion="Tus ventas del periodo comparadas con el periodo anterior" vacio="Sin ventas en estas fechas" />,
            <Grafica key="s" id="mv-servicios" actual={serie.actual.map((v, i) => (v === null ? null : servPorMomento[i]))} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={290}
              puntos={!porHoras} globos={serie.actual.map((v, i) => (v === null ? null : [nombreMomento(i), `${servPorMomento[i]} ${servPorMomento[i] === 1 ? "servicio" : "servicios"}`, formatoDinero(v)] as [string, string, string]))}
              descripcion="Tus servicios del periodo" vacio="Sin servicios en estas fechas" />,
          ]} />
          <div className="leyenda-mv"><span><i className="l-act" />{p.nombre}</span><span><i className="l-prev" />Periodo anterior</span></div>
        </div>
        <div className="pila">
          <div className="glass panel">
            <span className="lab">Ventas por barbero</span>
            <div className="rend">
              {rendimiento.map((r, i) => (
                <div key={r.id} className={r.id === yo ? "yo" : ""}>
                  <Avatar avatar={r.avatar} nombre={r.nombre} t={30} />
                  <span>
                    <span className="entre"><b>{r.nombre.split(" ")[0]}{r.id === yo ? " (tú)" : ""}</b><span className="num">{formatoDinero(r.monto)} <small className="muted">{porcentaje(r.monto, rendimiento.reduce((a, x) => a + x.monto, 0))}%</small></span></span>
                    <span className="barra-r"><i style={{ width: `${Math.max((r.monto / maxRend) * 100, 2)}%`, animationDelay: `${0.4 + i * 0.12}s` }} /></span>
                    <small className="muted">{r.servicios} {r.servicios === 1 ? "servicio" : "servicios"}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass panel">
            {porVeces.length === 0 ? <><span className="lab">Tus servicios más solicitados</span><p className="muted">Todavía no hay servicios en estas fechas.</p></> : (
              <Alternar titulo="Tus servicios más solicitados" opciones={["Cantidad", "Ingreso"]} vistas={[porVeces, porIngreso].map((lista, k) => (
                <div key={k} className="serv-mv">
                  {lista.map(([n, x]) => (
                    <div key={n}><span className="cant-mv">{k === 0 ? x.veces : <small>{x.veces}</small>}</span><span>{n}<small>{x.veces === 1 ? "vez" : "veces"}</small></span><b>{formatoDinero(x.monto)}</b></div>
                  ))}
                </div>
              )) as [React.ReactNode, React.ReactNode]} />
            )}
          </div>
        </div>
      </section>
      <HistorialVentas dias={historial} regreso="/mis-ventas" />
    </>
  );
}
