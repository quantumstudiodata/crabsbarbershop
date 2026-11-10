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
import { MesEquipo } from "./Partes";
import { RegistrarPago } from "./Pago";
import { cuentasEnCurso, mesElegido, personasEquipo, sesionEquipo } from "./datos";

export const metadata = { title: "Equipo" };

/** Equipo: una sola lista tranquila con lo que vendió cada persona en el mes y lo que tiene pendiente hoy. */
export default async function Equipo({ searchParams }: { searchParams: Promise<{ mes?: string; archivados?: string; aviso?: string; error?: string }> }) {
  const se = await sesionEquipo();
  const q0 = await searchParams;
  const zona = se.barberia.zonaHoraria;
  const m = mesElegido(q0, zona);
  const puedePagar = se.puede("equipo.pagar");
  const personas = await personasEquipo(se.barberia.id);
  const activas = personas.filter((p) => p.activo);
  const [{ ventas }, cuentas, revision, [cal]] = await Promise.all([
    ventasEntre(se.barberia.id, m.desde, m.hasta, { zona }),
    cuentasEnCurso(se.barberia.id, zona, activas, puedePagar),
    faltantesEnRevision(se.barberia.id),
    db.select({ n: sql<number>`count(*)::int`, prom: sql<number>`coalesce(avg(${schema.resenas.calificacion}), 0)::float` }).from(schema.resenas).where(eq(schema.resenas.barberiaId, se.barberia.id)),
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

  return (
    <div className="eq2">
      <AvisoUrl aviso={q0.aviso} error={q0.error} />
      <div className="eq2-cab">
        <div><h1>Equipo</h1></div>
        <div className="eq2-acc">
          <MesEquipo mes={m.mes} hoy={m.hoy} />
          {puedePagar && <RegistrarPago filas={cuentas.filter((c) => c.saldo > 0).map((c) => c.fila)} regreso={`/equipo${q}`} />}
        </div>
      </div>
      <p className="eq2-res">
        El equipo vendió <b>{formatoDinero(total.vendido)}</b> en {total.servicios} {total.servicios === 1 ? "servicio" : "servicios"}
        {cal?.n ? <>, con calificación de <b>{cal.prom.toFixed(1)}</b></> : null}.
        {porPagar > 0 && <> Quedan <b>{formatoDinero(porPagar)}</b> por pagar.</>}
        {porCobrar > 0 && <> Hay <b>{formatoDinero(porCobrar)}</b> de renta por cobrar.</>}
        {" "}{se.puede("ventas.ver_todas") && <Link href="/analitica/ventas" className="eq2-link">Estadísticas completas</Link>}
      </p>
      <section className="glass eq2-lista" aria-label="Personas">
        {filas.length ? filas.map((p) => {
          const c = p.c;
          const pend = !c || c.sinRegla ? null : c.renta ? (c.saldo > 0 ? { t: `${formatoDinero(c.saldo)} por cobrar`, aviso: true } : { t: "Renta al corriente", aviso: false }) : c.saldo > 0 ? { t: `${formatoDinero(c.saldo)} por pagar`, aviso: true } : null;
          return (
            <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq2-fila">
              <Avatar avatar={p.avatar} nombre={p.nombre} t={38} />
              <span><b>{p.nombre}</b><small>{!c || c.sinRegla ? "Sin forma de pago" : `${c.modalidad}, ${c.frecuencia.toLowerCase()}`}</small></span>
              <span className="eq2-m"><b>{formatoDinero(p.r.vendido)}</b>{pend && <small className={pend.aviso ? "pend" : undefined} title="Del periodo de pago en curso">{pend.t}</small>}</span>
              <Icono n="derecha" />
            </Link>
          );
        }) : <Vacio icono="persona" titulo="Todavía no hay personas que atiendan" texto="Da de alta a tu equipo en Ajustes, Usuarios, y aquí verás lo que vende cada persona." />}
      </section>
      {verArch && archivadas.length > 0 && (
        <section className="glass eq2-lista arch" aria-label="Archivados">
          {archivadas.map((p) => (
            <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq2-fila">
              <Avatar avatar={p.avatar} nombre={p.nombre} t={34} />
              <span><b>{p.nombre}</b><small>Archivada</small></span>
              <span className="eq2-m"><b>{formatoDinero(p.r.vendido)}</b></span>
              <Icono n="derecha" />
            </Link>
          ))}
        </section>
      )}
      <div className="eq2-pie">
        <span>Ventas atribuidas de {m.nombre.toLowerCase()}. Lo pendiente es del periodo de pago en curso.</span>
        <span className="eq2-links">
          {revision.length > 0 && <Link href="/equipo/pagos#faltantes">{revision.length} {revision.length === 1 ? "faltante en revisión" : "faltantes en revisión"}</Link>}
          {puedePagar && <Link href="/equipo/pagos">Historial de pagos</Link>}
          {archivadas.length > 0 && <Link href={urlArch} className="sutil">{verArch ? "Ocultar archivados" : `Archivados (${archivadas.length})`}</Link>}
        </span>
      </div>
    </div>
  );
}
