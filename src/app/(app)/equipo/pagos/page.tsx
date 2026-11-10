import Link from "next/link";
import { Vacio } from "../Vacio";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { db, schema } from "@/lib/db";
import { faltantesEnRevision } from "@/lib/faltantes";
import { fechaCorta, fechaLocal, horaCorta, sumarDias } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { personasEquipo, sesionEquipo } from "../datos";
import { decidirFaltante } from "../actions";

export const metadata = { title: "Pagos del equipo" };

/** Historial de pagos del equipo y faltantes de caja por decidir. Se llega desde Equipo. */
export default async function Pagos({ searchParams }: { searchParams: Promise<{ persona?: string; n?: string; aviso?: string; error?: string }> }) {
  const se = await sesionEquipo();
  const q = await searchParams;
  const zona = se.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const personas = await personasEquipo(se.barberia.id);
  const persona = personas.some((p) => p.id === q.persona) ? q.persona! : "";
  const limite = Math.min(Math.max(Number(q.n) || 30, 30), 300);
  const quien = alias(schema.usuarios, "quien");
  const [revision, sinAsignar, pagos] = await Promise.all([
    faltantesEnRevision(se.barberia.id),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.turnosCaja)
      .where(and(eq(schema.turnosCaja.barberiaId, se.barberia.id), eq(schema.turnosCaja.estado, "cerrado"), lt(schema.turnosCaja.diferencia, 0), isNull(schema.turnosCaja.faltanteRegla), gte(schema.turnosCaja.fechaOperativa, sumarDias(hoy, -60)))),
    db.select({ id: schema.pagosComision.id, tipo: schema.pagosComision.tipo, monto: schema.pagosComision.monto, nota: schema.pagosComision.nota, creadoEn: schema.pagosComision.creadoEn, nombre: schema.usuarios.nombre, registro: quien.nombre })
      .from(schema.pagosComision).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pagosComision.barberoId)).innerJoin(quien, eq(quien.id, schema.pagosComision.usuarioId))
      .where(and(eq(schema.pagosComision.barberiaId, se.barberia.id), ...(persona ? [eq(schema.pagosComision.barberoId, persona)] : [])))
      .orderBy(desc(schema.pagosComision.creadoEn)).limit(limite + 1),
  ]);
  const hayMas = pagos.length > limite;
  const puedeAutorizar = se.puede("equipo.autorizar");
  const nSinAsignar = sinAsignar[0]?.n ?? 0;
  const url = (x: { persona?: string; n?: number }) => {
    const u = new URLSearchParams();
    const pe = x.persona ?? persona;
    if (pe) u.set("persona", pe);
    if (x.n) u.set("n", String(x.n));
    const t = u.toString();
    return `/equipo/pagos${t ? `?${t}` : ""}`;
  };
  const dia = (d: Date) => { const f = fechaLocal(d, zona); return f === hoy ? `Hoy, ${horaCorta(d, zona)}` : fechaCorta(f); };

  return (
    <div className="eq2">
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <Link href="/equipo" className="eq2-volver"><Icono n="izquierda" />Equipo</Link>
      <div className="eq2-cab"><div><h1>Pagos del equipo</h1></div></div>

      {(revision.length > 0 || nSinAsignar > 0) && (
        <section id="faltantes" className="eq2-sec">
          <span className="lab">Faltantes de caja</span>
          {nSinAsignar > 0 && se.puede("cortes.ver") && (
            <Link href="/analitica/cortes" className="eq-aviso"><Icono n="caja" /><span><b>{nSinAsignar} {nSinAsignar === 1 ? "corte con faltante detectado" : "cortes con faltante detectado"}</b><small>Falta decidir quién lo cubre</small></span><Icono n="derecha" /></Link>
          )}
          {revision.length > 0 && (
            <div className="glass eq2-lista">
              {revision.map((f) => (
                <div key={f.id} className="eq2-fila sin">
                  <span><b>{f.nombre}</b><small>Corte del {fechaCorta(f.fecha)}, en revisión</small></span>
                  <span className="eq2-m"><b>{formatoDinero(f.monto)}</b></span>
                  {puedeAutorizar && (
                    <div className="eq-facc">
                      <form action={decidirFaltante}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="decision" value="descartar" /><button className="eq-bt">Descartar</button></form>
                      <form action={decidirFaltante}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="decision" value="autorizar" /><button className="eq-bt osc">Autorizar</button></form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="eq-nota">Un faltante en revisión no afecta el saldo. Solo se descuenta si se autoriza y la persona lo acepta por escrito (Ley Federal del Trabajo, art. 110).</p>
        </section>
      )}

      <section className="eq2-sec">
        <div className="entre">
          <span className="lab">Historial</span>
          {personas.length > 1 && (
            <nav className="ln-chips" aria-label="Persona">
              <Link href={url({ persona: "" })} aria-current={!persona ? "true" : undefined}>Todos</Link>
              {personas.filter((p) => p.activo || p.id === persona).map((p) => <Link key={p.id} href={url({ persona: p.id })} aria-current={persona === p.id ? "true" : undefined}>{p.nombre.split(" ")[0]}</Link>)}
            </nav>
          )}
        </div>
        {pagos.length ? (
          <div className="glass eq2-lista">
            {pagos.slice(0, limite).map((x) => (
              <div key={x.id} className="eq2-fila sin">
                <span><b>{x.tipo === "renta" ? `${x.nombre} pagó renta` : `Pago a ${x.nombre}`}</b><small>{dia(x.creadoEn)}, registró {x.registro.split(" ")[0]}{x.nota ? `, ${x.nota}` : ""}</small></span>
                <span className="eq2-m"><b>{formatoDinero(x.monto)}</b></span>
              </div>
            ))}
          </div>
        ) : <Vacio icono="historial" titulo="Todavía no hay pagos registrados" texto="Cuando registres un pago o un cobro de renta desde Equipo, aparecerá aquí con quién lo registró." />}
        {hayMas && <Link className="eq-mas" href={url({ n: limite + 30 })}>Ver más<Icono n="abajo" /></Link>}
      </section>
    </div>
  );
}
