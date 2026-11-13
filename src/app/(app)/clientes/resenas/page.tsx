import Link from "next/link";
import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { db, schema } from "@/lib/db";
import { fechaCorta, fechaLocal } from "@/lib/fechas";
import { requerirSesion } from "@/lib/auth";
import { personasEquipo } from "../../equipo/datos";
import { Responder } from "./Responder";

export const metadata = { title: "Reseñas" };

const Estrellas = ({ n }: { n: number }) => (
  <span className="eq-estr" aria-label={`${n} de 5`}>{[1, 2, 3, 4, 5].map((i) => <svg key={i} viewBox="0 0 24 24" className={i <= Math.round(n) ? "on" : ""} aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" /></svg>)}</span>
);

type Q = { persona?: string; estado?: string; n?: string; aviso?: string; error?: string };

export default async function Resenas({ searchParams }: { searchParams: Promise<Q> }) {
  const se = await requerirSesion();
  // Quien no ve las ventas de todo el equipo ve solo sus propias reseñas.
  const verTodo = se.puede("ventas.ver_todas") || se.puede("resenas.responder");
  const q = await searchParams;
  const zona = se.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const personas = (await personasEquipo(se.barberia.id)).filter((p) => verTodo || p.id === se.usuario.id);
  const persona = !verTodo ? se.usuario.id : personas.some((p) => p.id === q.persona) ? q.persona! : "";
  const estado = q.estado === "sin" || q.estado === "resp" ? q.estado : "todas";
  const limite = Math.min(Math.max(Number(q.n) || 20, 20), 200);
  const todas = await db.select({ barberoId: schema.resenas.barberoId, calificacion: schema.resenas.calificacion, respuesta: schema.resenas.respuesta })
    .from(schema.resenas).where(and(eq(schema.resenas.barberiaId, se.barberia.id), ...(verTodo ? [] : [eq(schema.resenas.barberoId, se.usuario.id)])));
  const cond: SQL[] = [eq(schema.resenas.barberiaId, se.barberia.id)];
  if (persona) cond.push(eq(schema.resenas.barberoId, persona));
  if (estado === "sin") cond.push(isNull(schema.resenas.respuesta));
  if (estado === "resp") cond.push(isNotNull(schema.resenas.respuesta));
  const lista = await db.select({ id: schema.resenas.id, calificacion: schema.resenas.calificacion, comentario: schema.resenas.comentario, cliente: schema.resenas.cliente, respuesta: schema.resenas.respuesta, creadoEn: schema.resenas.creadoEn, barbero: schema.usuarios.nombre })
    .from(schema.resenas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.resenas.barberoId))
    .where(and(...cond)).orderBy(desc(schema.resenas.creadoEn)).limit(limite + 1);
  const hayMas = lista.length > limite;
  const promedio = (xs: { calificacion: number }[]) => (xs.length ? xs.reduce((a, r) => a + r.calificacion, 0) / xs.length : 0);
  const sinResp = todas.filter((r) => !r.respuesta).length;
  const porPersona = personas.map((p) => { const xs = todas.filter((r) => r.barberoId === p.id); return { ...p, n: xs.length, prom: promedio(xs) }; }).filter((p) => p.n > 0 || p.activo).sort((a, b) => b.n - a.n);
  const url = (cambio: Partial<Q>) => {
    const u = new URLSearchParams(Object.entries({ persona, estado: estado === "todas" ? "" : estado, ...cambio }).filter(([, v]) => v) as [string, string][]).toString();
    return `/clientes/resenas${u ? `?${u}` : ""}`;
  };
  const puede = se.puede("resenas.responder");
  const dia = (d: Date) => { const f = fechaLocal(d, zona); return f === hoy ? "Hoy" : fechaCorta(f); };
  const personasLista = (
    <div className="glass eq-card eq-plist">
      <Link href={url({ persona: "" })} className={`eq-prow ${!persona ? "sel" : ""}`}><b>Todas las personas</b><span>{todas.length > 0 && <>★ {promedio(todas).toFixed(1)}</>}<small>{todas.length}</small></span></Link>
      {porPersona.map((p) => <Link key={p.id} href={url({ persona: p.id })} className={`eq-prow ${persona === p.id ? "sel" : ""}`}><span className="eq-pn">{p.nombre.split(" ")[0]}</span><span>{p.n > 0 && <>★ {p.prom.toFixed(1)}</>}<small>{p.n}</small></span></Link>)}
    </div>
  );

  return (
    <div className="eq eq-llena">
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="glass eq-card eq-rres">
        <div className="eq-prom"><Estrellas n={promedio(todas)} /><span><b>{todas.length ? promedio(todas).toFixed(1) : "Sin datos"}</b>{todas.length > 0 && <small>promedio</small>}</span></div>
        <div className="eq-cnt"><b>{todas.length}</b><small>{todas.length === 1 ? "reseña" : "reseñas"}</small></div>
        <div className="eq-cnt"><b>{sinResp}</b><small>sin responder</small></div>
      </div>
      <div className="eq-ab">
        <aside className="solo-esc-r"><div className="eq-h"><b>Por persona</b></div>{personasLista}</aside>
        <div className="eq-rcol">
          <details className="eq-sec solo-mov-r"><summary><Icono n="persona" />Calificación por persona<Icono n="abajo" /></summary>{personasLista}</details>
          <div className="eq-h eq-rh"><b className="solo-esc-r">Reseñas</b>
            <nav className="eq-segf" aria-label="Filtrar reseñas">
              {([["todas", "Todas"], ["sin", "Sin responder"], ["resp", "Respondidas"]] as const).map(([k, t]) => <Link key={k} href={url({ estado: k === "todas" ? "" : k })} aria-current={estado === k ? "page" : undefined}>{t}</Link>)}
            </nav>
          </div>
          {lista.length ? (
            <div className="glass eq-card">
              {lista.slice(0, limite).map((r) => (
                <article key={r.id} className="eq-res">
                  <div className="eq-res-h"><Estrellas n={r.calificacion} /><small>{dia(r.creadoEn)}</small></div>
                  <b>{r.cliente || "Cliente"} <span>con {r.barbero.split(" ")[0]}</span></b>
                  {r.comentario && <p className={r.comentario.length > 140 ? "clamp" : ""}>{r.comentario}</p>}
                  <div className="eq-res-f">
                    <small className={`eq-est ${r.respuesta ? "" : "parcial"}`}>{r.respuesta ? "Respondida" : "Sin responder"}</small>
                    <Responder id={r.id} cliente={r.cliente} comentario={r.comentario} respuesta={r.respuesta} puede={puede} />
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="muted eq-vacio">{todas.length ? "No hay reseñas con este filtro." : "Todavía no hay reseñas. Al cobrar, comparte la encuesta con el cliente."}</p>}
          {hayMas && <Link className="eq-mas" href={url({ n: String(limite + 20) })}>Ver más<Icono n="abajo" /></Link>}
          {!hayMas && (
            <div className="eq-relleno solo-esc-r" aria-hidden={lista.length === 0}>
              <span className="eq-relleno-i"><Icono n="chispa" /></span>
              <b>{lista.length ? "Parece que no hay mucho por aquí todavía" : "Aquí aparecerán las reseñas"}</b>
              <small>Cada vez que cobres, comparte la encuesta con el cliente. Lo que opine aparecerá en esta lista.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
