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
import { AnularPago } from "./AnularPago";
import { Avatar } from "@/components/Avatar";
import { fechaLarga } from "@/lib/fechas";

export const metadata = { title: "Pagos del equipo" };

/** Historial de pagos del equipo y faltantes de caja por decidir. Se llega desde Equipo. */
export default async function Pagos({ searchParams }: { searchParams: Promise<{ persona?: string; n?: string; aviso?: string; error?: string }> }) {
  const se = await sesionEquipo();
  const puedeAnular = se.puede("equipo.pagar");
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
    db.select({ id: schema.pagosComision.id, tipo: schema.pagosComision.tipo, monto: schema.pagosComision.monto, nota: schema.pagosComision.nota, creadoEn: schema.pagosComision.creadoEn, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar, registro: quien.nombre })
      .from(schema.pagosComision).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pagosComision.barberoId)).innerJoin(quien, eq(quien.id, schema.pagosComision.usuarioId))
      .where(and(eq(schema.pagosComision.barberiaId, se.barberia.id), ...(persona ? [eq(schema.pagosComision.barberoId, persona)] : [])))
      .orderBy(desc(schema.pagosComision.creadoEn)).limit(limite + 1),
  ]);
  const hayMas = pagos.length > limite;
  // Resumen del mes (con el filtro de persona): lo pagado al equipo y la renta cobrada.
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const [mes] = await db.select({
    pagado: sql<number>`coalesce(sum(${schema.pagosComision.monto}) filter (where ${schema.pagosComision.tipo} <> 'renta'), 0)::int`,
    nPagos: sql<number>`count(*) filter (where ${schema.pagosComision.tipo} <> 'renta' and ${schema.pagosComision.monto} > 0)::int`,
    renta: sql<number>`coalesce(sum(${schema.pagosComision.monto}) filter (where ${schema.pagosComision.tipo} = 'renta'), 0)::int`,
  }).from(schema.pagosComision)
    .where(and(eq(schema.pagosComision.barberiaId, se.barberia.id), sql`(${schema.pagosComision.creadoEn} at time zone ${zona})::date >= ${inicioMes}::date`, ...(persona ? [eq(schema.pagosComision.barberoId, persona)] : [])));
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
  const etiquetaDia = (f: string) => (f === hoy ? "Hoy" : f === sumarDias(hoy, -1) ? "Ayer" : fechaLarga(f));
  // La nota guarda "Forma: detalle". Los automáticos y los anulados se reconocen por su texto.
  const leer = (original: string) => {
    const anulado = /\(anulado: ([^;)]*)/.exec(original)?.[1];
    const nota = original.replace(/\s*\(anulado: [^)]*\)/, "");
    const i = nota.indexOf(": ");
    const forma = i > 0 ? nota.slice(0, i) : /^(Efectivo|Transferencia|Otro)/.test(nota) ? nota : "";
    let detalle = i > 0 ? nota.slice(i + 2) : forma ? "" : nota;
    const auto = /^(Pago|Renta) automátic[oa]/.test(detalle);
    if (auto) detalle = detalle.replace(/^(Pago|Renta) automátic[oa]\s*/, "").replace(/^del /, "Periodo del ");
    return { forma, detalle, auto, anulado };
  };
  const grupos: { dia: string; filas: typeof pagos }[] = [];
  for (const x of pagos.slice(0, limite)) {
    const f = fechaLocal(x.creadoEn, zona);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === f) g.filas.push(x); else grupos.push({ dia: f, filas: [x] });
  }
  const filtro = personas.find((p) => p.id === persona);

  return (
    <div className="eq2">
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="eq2-tit">
        <Link href="/equipo" className="eq2-atr" aria-label="Volver a Equipo"><Icono n="izquierda" /></Link>
        <span><small>Equipo</small><h1>{se.barberia.pagosEquipoAuto ? "Historial de comisiones" : "Pagos del equipo"}</h1></span>
      </div>

      <section className="glass pg-resumen subir" aria-label="Este mes">
        <span className="lab">{filtro ? `${filtro.nombre.split(" ")[0]}, este mes` : "Este mes"}</span>
        <div className="pg-kpis">
          <span><small>{se.barberia.pagosEquipoAuto ? "Comisiones liquidadas" : "Pagado al equipo"}</small><b>{formatoDinero(mes?.pagado ?? 0)}</b><em>{mes?.nPagos ?? 0} {mes?.nPagos === 1 ? "pago" : "pagos"}</em></span>
          {(mes?.renta ?? 0) > 0 && <span><small>Renta cobrada</small><b>{formatoDinero(mes!.renta)}</b><em>de silla</em></span>}
        </div>
      </section>

      {(revision.length > 0 || nSinAsignar > 0) && (
        <section id="faltantes" className="eq2-sec">
          <span className="lab">Faltantes de caja</span>
          {nSinAsignar > 0 && se.puede("cortes.ver") && (
            <Link href="/analitica/cortes" className="glass eq2-alerta">
              <b className="eq2-num">{nSinAsignar}</b>
              <span><b>{nSinAsignar === 1 ? "Corte con faltante" : "Cortes con faltante"}</b><small>Elige quién cubre cada faltante en Corte de caja</small></span>
              <span className="eq2-ir">Revisar<Icono n="derecha" /></span>
            </Link>
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
        </section>
      )}

      <section className="eq2-sec">
        {personas.length > 1 && (
          <nav className="pg-personas" aria-label="Filtrar por persona">
            <Link href={url({ persona: "" })} aria-current={!persona ? "true" : undefined}>Todos</Link>
            {personas.filter((p) => p.activo || p.id === persona).map((p) => (
              <Link key={p.id} href={url({ persona: p.id })} aria-current={persona === p.id ? "true" : undefined}><Avatar avatar={p.avatar} nombre={p.nombre} t={22} />{p.nombre.split(" ")[0]}</Link>
            ))}
          </nav>
        )}
        {grupos.length ? grupos.map((g) => (
          <div key={g.dia} className="pg-dia">
            <span className="lab">{etiquetaDia(g.dia)}</span>
            <div className="glass eq2-lista">
              {g.filas.map((x) => {
                const n = leer(x.nota);
                const anulado = x.monto === 0;
                return (
                  <div key={x.id} className={`pg-fila ${anulado ? "anulado" : ""}`}>
                    <Avatar avatar={x.avatar} nombre={x.nombre} t={34} />
                    <span className="pg-t">
                      <b>{x.nombre}</b>
                      <small>{[n.forma || (x.tipo === "renta" ? "Cobro de renta" : "Pago"), horaCorta(x.creadoEn, zona), n.auto ? "" : `registró ${x.registro.split(" ")[0]}`].filter(Boolean).join(", ")}</small>
                      {(n.detalle || n.anulado) && <small className="pg-nota">{n.anulado ? `Anulado: ${n.anulado}` : n.detalle}</small>}
                    </span>
                    <span className="pg-m">
                      {anulado ? <b className="tachado">Anulado</b> : <b>{x.tipo === "renta" ? "+" : ""}{formatoDinero(x.monto)}</b>}
                      {!anulado && (n.auto || x.tipo === "renta") && <span className="pg-tags">{x.tipo === "renta" && <small className="pg-tag">Renta</small>}{n.auto && <small className="pg-tag">Automático</small>}</span>}
                    </span>
                    {puedeAnular && !anulado ? <AnularPago id={x.id} texto={`${x.tipo === "renta" ? `Cobro de renta a ${x.nombre}` : `Pago a ${x.nombre}`} por ${formatoDinero(x.monto)}`} /> : <span className="pg-sin" />}
                  </div>
                );
              })}
            </div>
          </div>
        )) : <Vacio icono="historial" titulo={filtro ? `Todavía no hay pagos de ${filtro.nombre.split(" ")[0]}` : "Todavía no hay pagos registrados"} texto="Cuando registres un pago o un cobro de renta desde Equipo, aparecerá aquí con quién lo registró." />}
        {hayMas && <Link className="eq-mas" href={url({ n: limite + 30 })}>Ver más<Icono n="abajo" /></Link>}
      </section>
    </div>
  );
}
