import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CalendarioFiltro } from "@/components/CalendarioFiltro";
import { periodoEncabezado } from "@/components/CabeceraPeriodo";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { equipoConVentas, resumenPeriodo, turnosCerrados } from "@/lib/datos";
import { db, schema as t } from "@/lib/db";
import { diasEntre, fechaCorta, fechaLocal, inicioDeMes, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Resumen" };

const SUELDO = new Set(["sueldo", "mixto"]);
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
  const [r, prev, prevCompleto, equipo, pagos, reglas, gastos, cortes, generadas] = await Promise.all([
    resumenPeriodo(bId, p.desde, p.hasta, zona),
    resumenPeriodo(bId, prevDesde, sumarDias(prevDesde, tramo - 1), zona),
    resumenPeriodo(bId, prevDesde, sumarDias(prevDesde, largo - 1), zona),
    equipoConVentas(bId),
    db.select({ id: t.pagosComision.barberoId, tipo: t.pagosComision.tipo, monto: sql<number>`sum(${t.pagosComision.monto})::int` })
      .from(t.pagosComision).where(and(eq(t.pagosComision.barberiaId, bId), enRango(t.pagosComision.creadoEn))).groupBy(t.pagosComision.barberoId, t.pagosComision.tipo),
    db.select({ id: t.reglasComision.barberoId, tipo: t.reglasComision.tipo }).from(t.reglasComision)
      .where(and(eq(t.reglasComision.barberiaId, bId), isNull(t.reglasComision.vigenteHasta), isNull(t.reglasComision.servicioId))),
    db.select({ monto: sql<number>`coalesce(sum(${t.gastos.monto}), 0)::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))),
    turnosCerrados(bId, 1000, { desde: p.desde, hasta: p.hasta }),
    db.select({ id: t.conceptos.barberoId, comision: sql<number>`coalesce(sum(${t.conceptos.comision}), 0)::int` })
      .from(t.conceptos).innerJoin(t.ventas, eq(t.ventas.id, t.conceptos.ventaId))
      .where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), enRango(t.ventas.creadoEn))).groupBy(t.conceptos.barberoId),
  ]);
  const esSueldo = (id: string) => SUELDO.has(reglas.find((x) => x.id === id)?.tipo ?? "");
  const pagadoA = (id: string) => pagos.filter((x) => x.id === id && x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const pagadoEquipo = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentas = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const egresos = gastos[0]?.monto ?? 0;
  const quedo = r.netas + rentas - egresos - pagadoEquipo;
  const porPagar = generadas.filter((g) => !esSueldo(g.id)).reduce((a, g) => a + Math.max(g.comision - pagadoA(g.id), 0), 0);
  const conDif = cortes.filter((c) => (c.diferencia ?? 0) !== 0);
  const v = cambio(r.netas, prev.netas);

  // Meta del mes: solo con metas activas y viendo un mes.
  const meta = s.barberia.usaMetas && s.barberia.metaMensual > 0 && p.tipo === "mes" ? s.barberia.metaMensual : 0;
  const diasRestantes = Array.from({ length: diasEntre(hoy, p.hasta) }, (_, i) => sumarDias(hoy, i + 1)).filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0).length;
  const pct = meta ? porcentaje(r.netas, meta) : 0;

  const dias = Array.from({ length: Math.min(largo, 62) }, (_, i) => sumarDias(p.desde, i));
  const DIA = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const pendientes = [
    ...(conDif.length ? [{ titulo: conDif.length === 1 ? "Un corte con diferencia" : `${conDif.length} cortes con diferencia`, detalle: conDif.length === 1 ? `${(conDif[0].diferencia ?? 0) < 0 ? "Faltaron" : "Sobraron"} ${$(Math.abs(conDif[0].diferencia ?? 0))} el ${fechaCorta(conDif[0].fechaOperativa)}` : "Revisa qué pasó en cada uno", href: "/analitica/cortes" }] : []),
    ...(porPagar > 0 && s.puede("equipo.pagar") ? [{ titulo: "Comisiones por pagar", detalle: `${$(porPagar)} al equipo`, href: "/analitica/finanzas" }] : []),
  ];
  const totalVentas = Math.max(1, r.porBarbero.reduce((a, x) => a + x.monto, 0));
  const nombreP = p.tipo === "mes" ? p.etiqueta.split(" ")[0] : p.etiqueta;

  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <CalendarioFiltro p={elegido} hoy={hoy} todas={`${nombreP}${anterior ? " (mes anterior)" : ""}`} />
        {anterior && <span className="aviso-sutil" style={{ margin: 0 }}>Mostrando {nombreP.toLowerCase()} hasta que empiece el mes.</span>}
      </div>

      <section className="hero-m subir">
        <div>
          <span className="lab">{p.tipo === "mes" ? `${nombreP}, del 1 al ${Number((p.hasta > hoy ? hoy : p.hasta).slice(8))}` : p.etiqueta}</span>
          <b className="big-m num">{$(r.netas)}</b>
          <div className="fila" style={{ gap: 12, marginTop: 8 }}>
            {v !== null && <span className="chip-p si">{v === 0 ? "Igual" : `${Math.abs(v)}% ${v > 0 ? "más" : "menos"}`} que {p.tipo === "mes" ? "el mes anterior" : "el periodo anterior"}</span>}
            <span className="muted" style={{ fontSize: 13 }}>{r.clientes} {r.clientes === 1 ? "cliente" : "clientes"}{r.clientes ? `, ${$(r.ticket)} por cliente` : ""}</span>
          </div>
        </div>
        {meta > 0 && (
          <div className="meta-m">
            <div className="anillo-m" style={{ ["--p" as string]: Math.min(pct, 100) }}><div><b>{pct}%</b><small>de la meta</small></div></div>
            <div><b className="num">{$(r.netas)}</b> <span className="muted">de {$(meta)}</span><br /><small className="muted">{r.netas >= meta ? "Meta alcanzada" : `Faltan ${$(meta - r.netas)} en ${diasRestantes} ${diasRestantes === 1 ? "día" : "días"} de trabajo`}</small></div>
          </div>
        )}
      </section>

      <div className="mosaico" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
        <section className="glass bloque-m subir d1 bloque-dia">
          <div className="cab-m"><span className="lab">Ventas por día</span><span className="fila" style={{ gap: 12 }}><span className="leyenda-mv"><span><i className="l-act" />{nombreP}</span><span><i className="l-prev" />Anterior</span></span>{s.puede("ventas.ver_todas") && <Ir href="/analitica/ventas" titulo="Ir a Ventas" />}</span></div>
          {largo > 1 && largo <= 62
            ? <Grafica id="resumen" actual={dias.map((d) => (d <= hoy ? r.porDia.get(d) ?? 0 : null))} previo={dias.map((_, i) => prevCompleto.porDia.get(sumarDias(prevDesde, i)) ?? 0)}
                etiquetas={dias.map((d) => (largo <= 7 ? DIA[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8)))))} cadaEtiqueta={largo <= 7 ? 1 : 5} alto={168} descripcion="Ventas por día" vacio="Sin ventas en estas fechas" />
            : <p className="muted">Elige un mes o una semana para ver la gráfica.</p>}
        </section>
        <section className="glass bloque-m subir d1 bloque-dinero">
          <div className="cab-m"><span className="lab">Dinero del periodo</span>{s.puede("reportes.ver") && <Ir href="/analitica/finanzas" titulo="Ir a Finanzas" />}</div>
          <div className="fila-m"><span><b>Gastaste</b><small className="muted">egresos del negocio</small></span><b className="num">{$(egresos)}</b></div>
          <div className="fila-m"><span><b>Te quedó</b><small className="muted">después de gastos y pagos al equipo</small></span><b className="num grande-m">{quedo < 0 ? `−${$(-quedo)}` : $(quedo)}</b></div>
        </section>
      </div>

      <div className="mosaico" style={{ gridTemplateColumns: pendientes.length ? "1fr 1.4fr" : "1fr" }}>
        {pendientes.length > 0 && (
          <section className="glass bloque-m subir d2 bloque-revisar">
            <div className="cab-m"><span className="lab">Para revisar</span><span className="chip-p alerta">{pendientes.length}</span></div>
            {pendientes.map((x) => (
              <Link key={x.titulo} href={x.href} className="fila-m clic"><span><b>{x.titulo}</b><small className="muted">{x.detalle}</small></span><Icono n="derecha" /></Link>
            ))}
          </section>
        )}
        <section className="glass bloque-m subir d2 bloque-cobro">
          <div className="cab-m"><span className="lab">Lo que cobró cada barbero</span>{s.puede("ventas.ver_todas") && <Ir href="/analitica/ventas" titulo="Ir a Ventas" />}</div>
          {r.porBarbero.length === 0 && <p className="muted">Sin ventas en estas fechas.</p>}
          {r.porBarbero.map((b) => {
            const e = equipo.find((x) => x.id === b.id);
            const gen = generadas.find((g) => g.id === b.id)?.comision ?? 0;
            return (
              <div key={b.id} className="barbero-m">
                <Avatar avatar={e?.avatar ?? "iniciales"} nombre={b.nombre} t={32} />
                <span><b>{b.nombre.split(" ")[0]}</b><small className="muted">{b.servicios} {b.servicios === 1 ? "servicio" : "servicios"}{gen && !esSueldo(b.id) ? `, le corresponden ${$(gen)}` : ""}</small></span>
                <span className="barra-m"><i style={{ width: `${(b.monto / totalVentas) * 100}%` }} /></span>
                <b className="num">{$(b.monto)}</b>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
