import Link from "next/link";
import { Vacio } from "./Vacio";
import { eq, sql } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { rendimiento } from "@/lib/equipo";
import { faltantesEnRevision } from "@/lib/faltantes";
import { formatoDinero } from "@/lib/money";
import { fechaCorta } from "@/lib/fechas";
import { MesEquipo } from "./Partes";
import { RegistrarPago } from "./Pago";
import { cuentasEnCurso, mesElegido, personasEquipo, sesionEquipo } from "./datos";
import { Ayuda } from "@/components/Ayuda";

export const metadata = { title: "Equipo" };

/** Equipo: una sola lista tranquila con lo que vendió cada persona en el mes y lo que tiene pendiente hoy. */
export default async function Equipo({ searchParams }: { searchParams: Promise<{ mes?: string; archivados?: string; aviso?: string; error?: string; pagar?: string }> }) {
  const se = await sesionEquipo();
  const q0 = await searchParams;
  const zona = se.barberia.zonaHoraria;
  const m = mesElegido(q0, zona);
  const puedePagar = se.puede("equipo.pagar");
  const personas = await personasEquipo(se.barberia.id);
  const activas = personas.filter((p) => p.activo);
  const auto = se.barberia.pagosEquipoAuto;
  // Mismo tramo del mes anterior (del 1 al mismo día), para comparar sin ventaja.
  const ant = (() => {
    const d = new Date(`${m.desde}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
    const ym = d.toISOString().slice(0, 7);
    const fin = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const dia = `${ym}-${m.hasta.slice(8, 10)}`;
    return { desde: `${ym}-01`, hasta: dia < fin ? dia : fin, nombre: new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" }) };
  })();
  const [{ ventas }, { ventas: ventasAnt }, cuentas, revision, [cal], porResena] = await Promise.all([
    ventasEntre(se.barberia.id, m.desde, m.hasta, { zona }),
    ventasEntre(se.barberia.id, ant.desde, ant.hasta, { zona }),
    cuentasEnCurso(se.barberia.id, zona, activas, puedePagar),
    faltantesEnRevision(se.barberia.id),
    db.select({ n: sql<number>`count(*)::int`, prom: sql<number>`coalesce(avg(${schema.resenas.calificacion}), 0)::float` }).from(schema.resenas).where(eq(schema.resenas.barberiaId, se.barberia.id)),
    db.select({ id: schema.resenas.barberoId, n: sql<number>`count(*)::int`, prom: sql<number>`avg(${schema.resenas.calificacion})::float` }).from(schema.resenas).where(eq(schema.resenas.barberiaId, se.barberia.id)).groupBy(schema.resenas.barberoId),
  ]);
  const total = rendimiento(ventas);
  const cuentaDe = (id: string) => cuentas.find((c) => c.id === id);
  const filas = activas.map((p) => ({ ...p, r: rendimiento(ventas, p.id), c: cuentaDe(p.id) })).sort((a, b) => b.r.vendido - a.r.vendido);
  const archivadas = personas.filter((p) => !p.activo).map((p) => ({ ...p, r: rendimiento(ventas, p.id) }));
  const porPagar = cuentas.filter((c) => !c.renta && c.saldo > 0).reduce((a, c) => a + c.saldo, 0);
  const porCobrar = cuentas.filter((c) => c.renta && c.saldo > 0).reduce((a, c) => a + c.saldo, 0);
  const q = m.mes === m.hoy.slice(0, 7) ? "" : `?mes=${m.mes}`;
  const verArch = q0.archivados === "1";
  const urlArch = `/equipo?${new URLSearchParams({ ...(q ? { mes: m.mes } : {}), ...(verArch ? {} : { archivados: "1" }) }).toString()}`;

  const maxV = Math.max(1, ...filas.map((p) => p.r.vendido));
  // Indicadores en palabras: quién lleva más, quién creció, lo más pedido y la mejor calificación.
  const primero = (n: string) => n.split(" ")[0];
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
  const totalAnt = rendimiento(ventasAnt).vendido;
  const lider = filas[0];
  const crec = filas.map((p) => ({ p, a: rendimiento(ventasAnt, p.id).vendido })).filter((x) => x.a > 0 && x.p.r.vendido > x.a).sort((x, y) => pct(y.p.r.vendido, y.a) - pct(x.p.r.vendido, x.a))[0];
  const mejor = porResena.filter((x) => x.n >= 2 && activas.some((p) => p.id === x.id)).sort((a, b) => b.prom - a.prom)[0];
  const indicadores: { icono: string; texto: React.ReactNode }[] = [
    ...(lider && total.vendido > 0 && filas.length > 1 ? [{ icono: "chispa", texto: <><b>{primero(lider.nombre)}</b> lleva el {Math.round((lider.r.vendido / total.vendido) * 100)}% de las ventas</> }] : []),
    ...(totalAnt > 0 && total.vendido > 0 ? [{ icono: total.vendido >= totalAnt ? "grafica" : "abajo", texto: <>El equipo va <b>{Math.abs(pct(total.vendido, totalAnt))}% {total.vendido >= totalAnt ? "arriba" : "abajo"}</b> de {ant.nombre} a esta fecha</> }] : []),
    ...(crec && filas.length > 1 ? [{ icono: "arriba", texto: <><b>{primero(crec.p.nombre)}</b> vendió {pct(crec.p.r.vendido, crec.a)}% más que en {ant.nombre}</> }] : []),
    ...(total.top[0] ? [{ icono: "lista", texto: <>Lo más pedido: <b>{total.top[0].nombre}</b>, {total.top[0].veces} {total.top[0].veces === 1 ? "vez" : "veces"}</> }] : []),
    ...(mejor ? [{ icono: "estrella", texto: <><b>{primero(activas.find((p) => p.id === mejor.id)!.nombre)}</b> tiene la mejor calificación, ★ {mejor.prom.toFixed(1)}</> }] : []),
  ].slice(0, 4);
  const conRegla = cuentas.filter((c) => !c.sinRegla);
  const hayRentas = conRegla.some((c) => c.renta), hayEquipo = conRegla.some((c) => !c.renta);

  return (
    <div className="eq2 eqa">
      <AvisoUrl aviso={q0.aviso} error={q0.error} />
      <aside className="glass eqa-res">
        <div className="entre"><span className="lab">{m.nombre}</span><MesEquipo mes={m.mes} hoy={m.hoy} /></div>
        <span className="eqa-total"><small className="lab-ay">Ventas atribuidas<Ayuda titulo="Ventas atribuidas">Total cobrado por los servicios que realizó el equipo, con cualquier forma de pago. No corresponde a lo que se le paga a cada persona.</Ayuda></small><b>{formatoDinero(total.vendido)}</b><em>{total.servicios} {total.servicios === 1 ? "servicio" : "servicios"}</em>{cal?.n ? <em>★ {cal.prom.toFixed(1)} de calificación en {cal.n} {cal.n === 1 ? "reseña" : "reseñas"}</em> : null}</span>
        {(hayEquipo || hayRentas) && (
          <div className="eqa-pend">
            {hayEquipo && <span><small>{auto ? "Comisiones del periodo" : "Por pagar al equipo"}</small><b>{formatoDinero(porPagar)}</b></span>}
            {hayRentas && <span><small>Renta por cobrar</small><b>{formatoDinero(porCobrar)}</b></span>}
          </div>
        )}
        {puedePagar && !auto && <RegistrarPago filas={cuentas.filter((c) => c.saldo > 0).map((c) => c.fila)} regreso={`/equipo${q}`} clase="eq2-pri eqa-bt" abrir={q0.pagar === "1"} />}
        {auto && <Link href="/equipo/pagos" className="eq2-pri eqa-bt">Historial de comisiones</Link>}
        <nav className="eqa-links" aria-label="Más de Equipo">
          {puedePagar && !auto && <Link href="/equipo/pagos">Historial de pagos</Link>}
          {revision.length > 0 && <Link href="/equipo/pagos#faltantes">{revision.length} {revision.length === 1 ? "faltante en revisión" : "faltantes en revisión"}</Link>}
          {archivadas.length > 0 && <Link href={urlArch} className="sutil">{verArch ? "Ocultar archivados" : `Archivados (${archivadas.length})`}</Link>}
        </nav>
      </aside>
      <section className="eqa-col">
        <div className="eqa-cab"><h1>Equipo</h1><small>{filas.length} {filas.length === 1 ? "persona activa" : "personas activas"}</small></div>
        {indicadores.length > 0 && (
          <div className="eqa-ind" aria-label="Rendimiento del equipo">
            {indicadores.map((x, k) => <span key={k} className="glass" style={{ animationDelay: `${k * 70}ms` }}><Icono n={x.icono} /><span>{x.texto}</span></span>)}
          </div>
        )}
        <div className="glass eq2-lista" aria-label="Personas">
          {filas.length ? filas.map((p) => {
            const c = p.c;
            const pend = !c || c.sinRegla ? null : c.renta ? (c.saldo > 0 ? `${formatoDinero(c.saldo)} por cobrar` : "Renta al corriente")
              : c.saldo > 0 ? (auto ? `Lleva ${formatoDinero(c.saldo)}, ${c.pago === m.hoy ? "se paga hoy en el corte" : `se paga el ${fechaCorta(c.pago)}`}` : `${formatoDinero(c.saldo)} por pagar`) : null;
            return (
              <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq2-fila">
                <Avatar avatar={p.avatar} nombre={p.nombre} t={38} />
                <span><b>{p.nombre}</b><small>{!c || c.sinRegla ? "Sin forma de pago" : `${c.modalidad}, ${c.frecuencia.toLowerCase()}`}</small></span>
                <span className="eq2-m"><b>{formatoDinero(p.r.vendido)}</b><small>en ventas</small>{pend && <small className="pend">{pend}</small>}</span>
                <Icono n="derecha" />
                <i className="eqa-barra eq2-barra-fila" aria-hidden="true"><i style={{ width: `${Math.max((p.r.vendido / maxV) * 100, 2)}%` }} /></i>
              </Link>
            );
          }) : <Vacio icono="persona" titulo="Todavía no hay personas que atiendan" texto="Da de alta a tu equipo en Ajustes, Usuarios, y aquí verás lo que vende cada persona." />}
        </div>
        {verArch && archivadas.length > 0 && (
          <div className="glass eq2-lista arch" aria-label="Archivados">
            {archivadas.map((p) => (
              <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq2-fila">
                <Avatar avatar={p.avatar} nombre={p.nombre} t={34} />
                <span><b>{p.nombre}</b><small>Archivada</small></span>
                <span className="eq2-m"><b>{formatoDinero(p.r.vendido)}</b></span>
                <Icono n="derecha" />
              </Link>
            ))}
          </div>
        )}
        {filas.length > 0 && <small className="eqa-nota">La barra muestra cuánto aporta cada persona a las ventas del mes. {se.barberia.pagosEquipoAuto
          ? "Las comisiones se liquidan solas en su fecha de pago. En el corte de caja se elige si se entregan de la caja, al día siguiente o por transferencia."
          : "Lo que falta por pagar incluye lo pendiente de periodos anteriores."}</small>}
      </section>
    </div>
  );
}
