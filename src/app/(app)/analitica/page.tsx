import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CalendarioFiltro } from "@/components/CalendarioFiltro";
import { periodoEncabezado } from "@/components/CabeceraPeriodo";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { equipoConVentas, resumenPeriodo, turnosCerrados, ventasEntre } from "@/lib/datos";
import { cuentaDe } from "@/lib/equipo";
import { db, schema as t } from "@/lib/db";
import { diasEntre, fechaCorta, fechaLocal, inicioDeMes, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Resumen" };

const $ = formatoDinero;

/** Botón de acción de un bloque: siempre en su esquina superior derecha. */
function Ir({ href, titulo }: { href: string; titulo: string }) {
  return <Link href={href} className="acc-b" title={titulo} aria-label={titulo}><Icono n="flechaDiag" /></Link>;
}

export default async function Resumen({ searchParams }: { searchParams: Promise<ConsultaPeriodo> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.ver")) redirect(s.puede("ventas.ver_todas") ? "/analitica/ventas" : s.puede("cortes.ver") ? "/analitica/cortes" : s.puede("gastos.ver") ? "/analitica/finanzas" : "/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const elegido = q.periodo || q.fecha || q.mes || q.anio || (q.desde && q.hasta) ? leerPeriodo(q, hoy, "mes") : null;
  const { p, anterior } = periodoEncabezado(elegido, hoy);
  const bId = s.barberia.id;
  const largo = diasEntre(p.desde, p.hasta) + 1;
  const tramo = diasEntre(p.desde, p.hasta > hoy ? hoy : p.hasta) + 1;
  const prevDesde = p.tipo === "mes" ? inicioDeMes(sumarDias(p.desde, -1)) : sumarDias(p.desde, -largo);
  const enRango = (col: unknown) => sql`(${col} at time zone ${zona})::date between ${p.desde}::date and ${p.hasta}::date`;
  const [r, prev, prevCompleto, equipo, pagos, gastos, cortes, cats, cal] = await Promise.all([
    resumenPeriodo(bId, p.desde, p.hasta, zona),
    resumenPeriodo(bId, prevDesde, sumarDias(prevDesde, tramo - 1), zona),
    resumenPeriodo(bId, prevDesde, sumarDias(prevDesde, largo - 1), zona),
    equipoConVentas(bId),
    db.select({ id: t.pagosComision.barberoId, tipo: t.pagosComision.tipo, monto: sql<number>`sum(${t.pagosComision.monto})::int` })
      .from(t.pagosComision).where(and(eq(t.pagosComision.barberiaId, bId), enRango(t.pagosComision.creadoEn))).groupBy(t.pagosComision.barberoId, t.pagosComision.tipo),
    db.select({ monto: sql<number>`coalesce(sum(${t.gastos.monto}), 0)::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))),
    turnosCerrados(bId, 1000, { desde: p.desde, hasta: p.hasta }),
    db.select({ categoria: t.gastos.categoria, monto: sql<number>`sum(${t.gastos.monto})::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))).groupBy(t.gastos.categoria),
    db.select({ id: t.resenas.barberoId, n: sql<number>`count(*)::int`, prom: sql<number>`avg(${t.resenas.calificacion})::float` }).from(t.resenas)
      .where(and(eq(t.resenas.barberiaId, bId), enRango(t.resenas.creadoEn))).groupBy(t.resenas.barberoId),
  ]);
  const pagadoEquipo = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentas = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const egresos = gastos[0]?.monto ?? 0;
  const conDif = cortes.filter((c) => (c.diferencia ?? 0) !== 0);
  const v = cambio(r.netas, prev.netas);

  // Meta del mes: solo con metas activas y viendo un mes.
  const meta = s.barberia.usaMetas && s.barberia.metaMensual > 0 && p.tipo === "mes" ? s.barberia.metaMensual : 0;
  const diasRestantes = Array.from({ length: diasEntre(hoy, p.hasta) }, (_, i) => sumarDias(hoy, i + 1)).filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0).length;
  const pct = meta ? porcentaje(r.netas, meta) : 0;

  const dias = Array.from({ length: Math.min(largo, 62) }, (_, i) => sumarDias(p.desde, i));
  const DIA = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const DIA_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const nombreP = p.tipo === "mes" ? p.etiqueta.split(" ")[0] : p.etiqueta;
  const nombrePrev = p.tipo === "mes" ? new Date(`${prevDesde}T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" }).replace(/^./, (x) => x.toUpperCase()) : "Periodo anterior";
  const hastaV = p.hasta > hoy ? hoy : p.hasta;
  const mejor = [...r.porDia.entries()].filter(([d]) => d >= p.desde && d <= hastaV).sort((a, b) => b[1] - a[1])[0];
  const ingresos = r.netas + rentas;
  const resultado = ingresos - egresos - pagadoEquipo;
  // Lo pendiente con la misma cuenta que Equipo: comisión y sueldo del periodo, menos pagos y faltantes autorizados.
  const { ventas: delPeriodo } = await ventasEntre(bId, p.desde, hastaV, { zona });
  const pagadasP = delPeriodo.filter((x) => x.estado === "pagada");
  const cuentas = await Promise.all(equipo.map(async (e) => ({ id: e.id, c: await cuentaDe(bId, e.id, p.desde, hastaV, pagadasP) })));
  const conPend = cuentas.filter((x) => x.c.regla && x.c.regla.tipo !== "renta" && x.c.saldo > 0);
  const pendEquipo = conPend.reduce((a, x) => a + x.c.saldo, 0);
  const nombreDe = (id: string) => (equipo.find((x) => x.id === id)?.nombre ?? r.porBarbero.find((x) => x.id === id)?.nombre ?? "").split(" ")[0];
  const topCats = [...cats].sort((a, b) => b.monto - a.monto).slice(0, 3).map((c) => c.categoria);
  const signo = (n: number) => (n < 0 ? `−${$(-n)}` : $(n));
  const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  const pendientes = [
    ...(pendEquipo > 0 && s.puede("equipo.pagar") ? [{ titulo: "Pagos pendientes al equipo", detalle: `${lista(conPend.map((g) => nombreDe(g.id)))}, ${$(pendEquipo)}`, href: "/equipo" }] : []),
    ...(conDif.length ? [{ titulo: conDif.length === 1 ? "Un corte con diferencia" : `${conDif.length} cortes con diferencia`, detalle: conDif.length === 1 ? `${(conDif[0].diferencia ?? 0) < 0 ? "Faltaron" : "Sobraron"} ${$(Math.abs(conDif[0].diferencia ?? 0))} el ${fechaCorta(conDif[0].fechaOperativa)}` : "Revisa qué pasó en cada uno", href: "/analitica/cortes" }] : []),
  ];
  const totalVentas = Math.max(1, ...r.porBarbero.map((x) => x.monto));
  const calDe = (id: string) => cal.find((x) => x.id === id);

  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <CalendarioFiltro p={elegido} hoy={hoy} todas={`${nombreP}${anterior ? " (mes anterior)" : ""}`} />
        {anterior && <span className="aviso-sutil" style={{ margin: 0 }}>Mostrando {nombreP.toLowerCase()} hasta que empiece el mes.</span>}
      </div>

      <div className="rs-esc solo-escritorio">
      <section className={`rs-com subir ${meta > 0 ? "" : "sin-meta"}`} aria-label="Resultado comercial">
        <div className="rs-ventas">
          <span className="lab">{p.tipo === "mes" ? `Ventas de ${nombreP.toLowerCase()}, del 1 al ${Number(hastaV.slice(8))}` : `Ventas, ${p.etiqueta}`}</span>
          <b className="rs-big">{$(r.netas)}</b>
          {v !== null && <span className="rs-chip">{v === 0 ? "Igual" : `${Math.abs(v)}% ${v > 0 ? "más" : "menos"}`} que {p.tipo === "mes" ? "el mes anterior a esta fecha" : "el periodo anterior"}</span>}
          <div className="rs-mini">
            <div><b>{r.clientes}</b><small>{r.clientes === 1 ? "Cliente" : "Clientes"}</small></div>
            <div><b>{r.clientes ? $(Math.round(r.ticket / 100) * 100) : "$0"}</b><small>Venta promedio por cliente</small></div>
          </div>
        </div>
        {meta > 0 && (
          <div className="rs-meta">
            <div className="anillo-m" role="img" aria-label={`${pct}% de la meta`} style={{ ["--p" as string]: Math.min(pct, 100) }}><div><b>{pct}%</b><small>de la meta</small></div></div>
            <div className="rs-meta-t">
              <span className="lab">Meta de {nombreP.toLowerCase()}</span>
              <b>{$(r.netas)} <span>de {$(meta)}</span></b>
              {r.netas >= meta ? <small>Meta alcanzada</small> : <div><b>Faltan {$(meta - r.netas)}</b><small>{diasRestantes > 0 ? `en ${diasRestantes} ${diasRestantes === 1 ? "día" : "días"} de trabajo, unos ${$(Math.ceil((meta - r.netas) / diasRestantes / 100) * 100)} por día` : "Ya no quedan días de trabajo en el mes"}</small></div>}
            </div>
          </div>
        )}
      </section>

      <div className="rs-b">
        <section className="glass rs-card subir d1" aria-label="Actividad de ventas">
          <div className="rs-cab"><b>Actividad de ventas</b><span className="fila" style={{ gap: 12 }}><span className="leyenda-mv"><span><i className="l-act" />{nombreP}</span><span><i className="l-prev" />{nombrePrev}</span></span>{s.puede("ventas.ver_todas") && <Ir href="/analitica/ventas" titulo="Ir a Ventas" />}</span></div>
          {largo > 1 && largo <= 62
            ? <Grafica id="resumen" actual={dias.map((d) => (d <= hoy ? r.porDia.get(d) ?? 0 : null))} previo={dias.map((_, i) => prevCompleto.porDia.get(sumarDias(prevDesde, i)) ?? 0)}
                etiquetas={dias.map((d) => (largo <= 7 ? DIA[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8)))))} cadaEtiqueta={largo <= 7 ? 1 : 5} alto={210} descripcion={`Ventas por día de ${nombreP} y ${nombrePrev}`} vacio="Sin ventas en estas fechas" />
            : <p className="muted">Elige un mes o una semana para ver la gráfica.</p>}
          <div className="rs-pie">
            {mejor && mejor[1] > 0 && <span>Mejor día: <b>{DIA_L[new Date(`${mejor[0]}T12:00:00Z`).getUTCDay()]} {Number(mejor[0].slice(8))}, {$(mejor[1])}</b></span>}
            <span>Promedio diario: <b>{$(Math.round(r.netas / Math.max(tramo, 1)))}</b></span>
            {p.tipo === "mes" && <span>{nombrePrev} a esta fecha: <b>{$(prev.netas)}</b></span>}
          </div>
        </section>
        <section className="glass rs-card subir d1" aria-label="Resultado financiero">
          <div className="rs-cab"><b>Resultado financiero</b>{s.puede("reportes.ver") && <Ir href="/analitica/finanzas" titulo="Ir a Finanzas" />}</div>
          <div className="rs-f"><span><span>Ingresos</span><small>Ventas netas {$(r.netas)}{rentas ? ` y rentas ${$(rentas)}` : ""}</small></span><b>{$(ingresos)}</b></div>
          <div className="rs-f"><span><span>Egresos del negocio</span><small>{topCats.length ? lista(topCats) : "Sin egresos registrados"}</small></span><b>{egresos ? `−${$(egresos)}` : "$0"}</b></div>
          <div className="rs-f"><span><span>Pagos al equipo realizados</span><small>Comisiones y sueldos ya pagados</small></span><b>{pagadoEquipo ? `−${$(pagadoEquipo)}` : "$0"}</b></div>
          <div className="rs-f tot"><span>Resultado después de pagos realizados</span><b>{signo(resultado)}</b></div>
          <div className="rs-f porpagar"><span><span>Pendiente de pagar al equipo</span><small>Comisiones y sueldos que aún no se pagan</small></span><b>{$(pendEquipo)}</b></div>
          {pendEquipo > 0 && <small className="rs-nota">Si se pagan hoy, el resultado sería {signo(resultado - pendEquipo)}.</small>}
        </section>
      </div>

      <div className={`rs-c ${pendientes.length ? "" : "dos"}`}>
        <section className="glass rs-card subir d2" aria-label="Rendimiento del equipo">
          <div className="rs-cab"><b>Rendimiento del equipo</b><small>{nombreP}</small></div>
          {r.porBarbero.length ? (
            <div className="rs-tabla">
              <small>Persona</small><small>Servicios</small><small>Calificación</small>
              {r.porBarbero.map((b) => { const c = calDe(b.id); return [
                <span key={`${b.id}n`} className="rs-per"><Avatar avatar={equipo.find((x) => x.id === b.id)?.avatar ?? "iniciales"} nombre={b.nombre} t={24} />{b.nombre.split(" ")[0]}</span>,
                <b key={`${b.id}s`}>{b.servicios}</b>,
                c?.n ? <b key={`${b.id}c`}>★ {c.prom.toFixed(1)}</b> : <span key={`${b.id}c`} className="muted">Sin reseñas</span>,
              ]; })}
            </div>
          ) : <p className="muted rs-vacio">Sin servicios en estas fechas.</p>}
        </section>
        <section className="glass rs-card subir d2" aria-label="Ventas atribuidas">
          <div className="rs-cab"><b>Ventas atribuidas</b><small>por quien atendió</small></div>
          {r.porBarbero.length ? r.porBarbero.map((b) => (
            <div key={b.id} className="rs-barra"><span>{b.nombre.split(" ")[0]}</span><i><em style={{ width: `${Math.max((b.monto / totalVentas) * 100, 2)}%` }} /></i><b>{$(b.monto)}</b></div>
          )) : <p className="muted rs-vacio">Sin ventas en estas fechas.</p>}
          <small className="rs-nota">Es lo que se cobró por sus servicios, no lo que recibió cada quien.</small>
        </section>
        {pendientes.length > 0 && (
          <section className="glass rs-card subir d2" aria-label="Requiere atención">
            <div className="rs-cab"><b>Requiere atención</b><small>{pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}</small></div>
            {pendientes.map((x) => (
              <Link key={x.titulo} href={x.href} className="rs-pend"><span><span>{x.titulo}</span><small>{x.detalle}</small></span><Icono n="derecha" /></Link>
            ))}
          </section>
        )}
      </div>
      </div>
      {/* Teléfono: la cifra del mes arriba y cada sección cerrada con su cifra clave; se abre al tocarla. */}
      <div className="rs-mov solo-movil">
        <section className="glass rs-mh">
          <span className="lab">{p.tipo === "mes" ? `${nombreP}, del 1 al ${Number(hastaV.slice(8))}` : p.etiqueta}</span>
          <div className="rs-mh-f">
            <span><b className="rs-big">{$(r.netas)}</b>{v !== null && <small>{v === 0 ? "Igual" : `${Math.abs(v)}% ${v > 0 ? "más" : "menos"}`} que {p.tipo === "mes" ? `${nombrePrev.toLowerCase()} a esta fecha` : "el periodo anterior"}</small>}</span>
            {meta > 0 && <span className="anillo-m rs-mini-anillo" role="img" aria-label={`${pct}% de la meta`} style={{ ["--p" as string]: Math.min(pct, 100) }}><span>{pct}%</span></span>}
          </div>
          <div className="rs-mh-d"><span><b>{r.clientes}</b> {r.clientes === 1 ? "cliente" : "clientes"}</span><span><b>{r.clientes ? $(Math.round(r.ticket / 100) * 100) : "$0"}</b> por cliente</span>{meta > 0 && r.netas < meta && <span>Faltan <b>{$(meta - r.netas)}</b></span>}</div>
        </section>
        <details className="glass rs-acc" open>
          <summary><span><b>Actividad de ventas</b><small>{mejor && mejor[1] > 0 ? `Promedio diario, mejor día ${DIA_L[new Date(`${mejor[0]}T12:00:00Z`).getUTCDay()]} ${Number(mejor[0].slice(8))}` : "Promedio diario"}</small></span><b>{$(Math.round(r.netas / Math.max(tramo, 1)))}</b><Icono n="abajo" /></summary>
          <div className="rs-acc-c">
            {largo > 1 && largo <= 62
              ? <Grafica id="resumen-m" actual={dias.map((d) => (d <= hoy ? r.porDia.get(d) ?? 0 : null))} previo={dias.map((_, i) => prevCompleto.porDia.get(sumarDias(prevDesde, i)) ?? 0)}
                  etiquetas={dias.map((d) => (largo <= 7 ? DIA[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8)))))} cadaEtiqueta={largo <= 7 ? 1 : 7} alto={130} descripcion={`Ventas por día de ${nombreP} y ${nombrePrev}`} vacio="Sin ventas en estas fechas" />
              : <p className="muted">Elige un mes o una semana para ver la gráfica.</p>}
            <div className="rs-pie">{mejor && mejor[1] > 0 && <span>Mejor día <b>{$(mejor[1])}</b></span>}{p.tipo === "mes" && <span>{nombrePrev} a esta fecha <b>{$(prev.netas)}</b></span>}</div>
            {s.puede("ventas.ver_todas") && <Link className="eq2-link" href="/analitica/ventas">Ver ventas</Link>}
          </div>
        </details>
        <details className="glass rs-acc">
          <summary><span><b>Resultado financiero</b><small>Después de pagos realizados</small></span><b>{signo(resultado)}</b><Icono n="abajo" /></summary>
          <div className="rs-acc-c">
            <div className="rs-f"><span><span>Ingresos</span><small>Ventas netas{rentas ? ` y rentas ${$(rentas)}` : ""}</small></span><b>{$(ingresos)}</b></div>
            <div className="rs-f"><span><span>Egresos del negocio</span><small>{topCats.length ? lista(topCats) : "Sin egresos"}</small></span><b>{egresos ? `−${$(egresos)}` : "$0"}</b></div>
            <div className="rs-f"><span><span>Pagos al equipo realizados</span></span><b>{pagadoEquipo ? `−${$(pagadoEquipo)}` : "$0"}</b></div>
            <div className="rs-f porpagar"><span><span>Pendiente al equipo</span><small>{pendEquipo > 0 ? `Si se paga hoy: ${signo(resultado - pendEquipo)}` : "Nada pendiente"}</small></span><b>{$(pendEquipo)}</b></div>
            {s.puede("reportes.ver") && <Link className="eq2-link" href="/analitica/finanzas">Ver finanzas</Link>}
          </div>
        </details>
        <details className="glass rs-acc">
          <summary><span><b>Equipo</b><small>{r.porBarbero.length ? `${lista(r.porBarbero.map((b) => b.nombre.split(" ")[0]))}, ${r.porBarbero.reduce((a, b) => a + b.servicios, 0)} servicios` : "Sin servicios"}</small></span><b>{$(r.porBarbero.reduce((a, b) => a + b.monto, 0))}</b><Icono n="abajo" /></summary>
          <div className="rs-acc-c">
            {r.porBarbero.map((b) => { const c = calDe(b.id); return (
              <div key={b.id} className="rs-mp">
                <span className="rs-per"><Avatar avatar={equipo.find((x) => x.id === b.id)?.avatar ?? "iniciales"} nombre={b.nombre} t={26} /><span><b>{b.nombre.split(" ")[0]}</b><small>{b.servicios} {b.servicios === 1 ? "servicio" : "servicios"}{c?.n ? `, ★ ${c.prom.toFixed(1)}` : ""}</small></span></span>
                <b>{$(b.monto)}</b>
                <i className="rs-mp-b"><em style={{ width: `${Math.max((b.monto / totalVentas) * 100, 2)}%` }} /></i>
              </div>
            ); })}
            <small className="rs-nota">Ventas atribuidas: lo cobrado por sus servicios, no lo que recibió cada quien.</small>
          </div>
        </details>
        {pendientes.length > 0 && (
          <details className="rs-atn">
            <summary><b className="eq2-num">{pendientes.length}</b><span><b>Requiere atención</b><small>{lista(pendientes.map((x) => x.titulo.toLowerCase())).replace(/^./, (c) => c.toUpperCase())}</small></span><Icono n="abajo" /></summary>
            <div className="rs-acc-c">{pendientes.map((x) => <Link key={x.titulo} href={x.href} className="rs-pend"><span><span>{x.titulo}</span><small>{x.detalle}</small></span><Icono n="derecha" /></Link>)}</div>
          </details>
        )}
      </div>
    </>
  );
}
