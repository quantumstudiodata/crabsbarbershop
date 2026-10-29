import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { SelectorPeriodo } from "@/components/Periodo";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { equipoQueAtiende, turnoAbierto, ventasEntre } from "@/lib/datos";
import { diasEntre, fechaLarga, fechaLocal, horaCorta, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { serieHoy } from "@/lib/series";
import { Icono } from "@/components/Icono";
import { HistorialVentas, type DiaVentas } from "@/components/HistorialVentas";

export const metadata = { title: "Mis ventas" };

const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export default async function MisVentas({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (s.usuario.rol !== "barbera" && s.usuario.rol !== "encargada") redirect("/analitica");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "semana");
  const yo = s.usuario.id;
  const largo = diasEntre(p.desde, p.hasta) + 1;
  const anual = p.tipo === "anio" || largo > 62;
  const prevDesde = p.tipo === "dia" ? sumarDias(p.desde, -7) : p.tipo === "anio" ? `${Number(p.desde.slice(0, 4)) - 1}-01-01` : sumarDias(p.desde, -largo);
  const prevHasta = p.tipo === "dia" ? sumarDias(p.desde, -7) : p.tipo === "anio" ? `${Number(p.desde.slice(0, 4)) - 1}-12-31` : sumarDias(p.desde, -1);
  const [{ ventas }, previo, equipo, turno] = await Promise.all([
    ventasEntre(s.barberia.id, p.desde, p.hasta, { zona }),
    ventasEntre(s.barberia.id, prevDesde, prevHasta, { zona, barberoId: yo }),
    equipoQueAtiende(s.barberia.id),
    turnoAbierto(s.barberia.id),
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

  const conteo = new Map<string, number>();
  for (const v of pagadas) for (const c of v.conceptos) if (c.barberoId === yo) conteo.set(c.nombre, (conteo.get(c.nombre) ?? 0) + 1);
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

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
      <SelectorPeriodo ruta="/mis-ventas" p={p} hoy={hoy} conDia conAnio />
      <section className="inicio-b subir">
        <div className="glass panel" style={{ padding: 24, gap: 14 }}>
          <div className="entre" style={{ alignItems: "flex-end" }}>
            <div><span className="lab">Ventas generadas</span><div className="big" style={{ fontSize: "clamp(48px, 7vw, 72px)", marginTop: 6 }}><Cuenta valor={vendido} /></div></div>
            <div style={{ textAlign: "right" }}><span className="lab">Servicios realizados</span><span className="fig" style={{ fontSize: 28 }}><Cuenta valor={servicios} formato="entero" /></span></div>
          </div>
          <div className="fila" style={{ gap: 10 }}>
            {variacion === null
              ? <span className="pill gris">Sin ventas en el periodo anterior para comparar</span>
              : <span className={`pill ${variacion >= 0 ? "ok" : "warn"}`}>{variacion >= 0 ? "↗" : "↘"} {Math.abs(variacion)}% {variacion >= 0 ? "más" : "menos"} que {porHoras ? "el mismo día de la semana pasada" : "el periodo anterior"}</span>}
          </div>
          <Grafica id="misventas" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={190}
            puntos={!porHoras} enCurso={horas?.enCurso ?? (dias.indexOf(hoy) >= 0 && !anual ? dias.indexOf(hoy) : undefined)}
            descripcion="Tus ventas del periodo comparadas con el periodo anterior" vacio="Sin servicios en estas fechas" />
          <div className="metodos-c">
            {[["Efectivo", efectivo] as [string, number], ...(otros.length ? otros : [["Tarjeta y transferencia", 0] as [string, number]])].map(([m, v], i) => (
              <div key={m} className="metodo-c" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                <span className="ic-m"><Icono n={m === "Efectivo" ? "efectivo" : /tarjeta/i.test(m) ? "tarjeta" : "cobro"} /></span>
                <span className="lab">{m}</span>
                <b>{formatoDinero(v)}</b>
                <span className="pct-m"><i style={{ width: `${porcentaje(v, vendido)}%` }} /></span>
                <small>{porcentaje(v, vendido)}% de tus ventas</small>
              </div>
            ))}
          </div>
        </div>
        <div className="pila">
          <div className="glass panel">
            <span className="lab">Tus servicios más vendidos</span>
            {top.length === 0 ? <p className="muted">Todavía no hay servicios.</p> : (
              <div className="lista">
                {top.map(([n, k], i) => <div key={n}><span className="fila" style={{ gap: 10 }}><span className="rank">{i + 1}</span>{n}</span><span className="num">{k} {k === 1 ? "vez" : "veces"}</span></div>)}
              </div>
            )}
          </div>
          <div className="glass panel">
            <span className="lab">Rendimiento por barbero</span>
            <div className="rend">
              {rendimiento.map((r, i) => (
                <div key={r.id} className={r.id === yo ? "yo" : ""}>
                  <Avatar avatar={r.avatar} nombre={r.nombre} t={30} />
                  <span>
                    <span className="entre"><b>{r.nombre.split(" ")[0]}{r.id === yo ? " (tú)" : ""}</b><span className="num">{formatoDinero(r.monto)}</span></span>
                    <span className="barra-r"><i style={{ width: `${Math.max((r.monto / maxRend) * 100, 2)}%`, animationDelay: `${0.4 + i * 0.12}s` }} /></span>
                    <small className="muted">{r.servicios} {r.servicios === 1 ? "servicio" : "servicios"}, {porcentaje(r.monto, rendimiento.reduce((a, x) => a + x.monto, 0))}% del total</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <HistorialVentas dias={historial} regreso="/mis-ventas" />
    </>
  );
}
