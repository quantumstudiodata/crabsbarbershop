import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { db, schema as t } from "@/lib/db";
import { NOMBRE_ROL } from "@/lib/permisos";
import { ESTADOS_SOLICITUD, type EstadoSolicitud, hace, PRIORIDADES, type Prioridad, TIPOS_SOLICITUD, type TipoSolicitud } from "@/lib/soporte";
import { Icono } from "@/components/Icono";
import { CabezaSoporte } from "../../Comunes";
import { Campos, Responder } from "./Controles";

export const metadata = { title: "Solicitud" };

type Contexto = { ruta?: string; puesto?: string; pantalla?: string; navegador?: string; errores?: { ruta: string; mensaje: string; t: string }[] };

export default async function Solicitud({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const autor = alias(t.usuarios, "autor");
  const [x] = await db.select({ s: t.solicitudesSoporte, negocio: t.barberias, persona: t.usuarios })
    .from(t.solicitudesSoporte).innerJoin(t.barberias, eq(t.barberias.id, t.solicitudesSoporte.barberiaId)).innerJoin(t.usuarios, eq(t.usuarios.id, t.solicitudesSoporte.usuarioId))
    .where(eq(t.solicitudesSoporte.id, id)).limit(1);
  if (!x) notFound();
  const [mensajes, eventos, equipo, otras] = await Promise.all([
    db.select({ m: t.mensajesSoporte, autor: autor.nombre }).from(t.mensajesSoporte).innerJoin(autor, eq(autor.id, t.mensajesSoporte.autorId)).where(eq(t.mensajesSoporte.solicitudId, id)).orderBy(asc(t.mensajesSoporte.creadoEn)),
    db.select({ e: t.eventosSoporte, autor: autor.nombre }).from(t.eventosSoporte).leftJoin(autor, eq(autor.id, t.eventosSoporte.autorId)).where(eq(t.eventosSoporte.solicitudId, id)).orderBy(desc(t.eventosSoporte.creadoEn)),
    db.select({ id: t.usuarios.id, nombre: t.usuarios.nombre }).from(t.usuarios).where(eq(t.usuarios.esSoporte, true)),
    db.select({ id: t.solicitudesSoporte.id, asunto: t.solicitudesSoporte.asunto, estado: t.solicitudesSoporte.estado, t: t.solicitudesSoporte.creadoEn })
      .from(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.usuarioId, x.s.usuarioId)).orderBy(desc(t.solicitudesSoporte.creadoEn)).limit(6),
  ]);
  const c = x.s.contexto as Contexto;
  return (
    <>
      <CabezaSoporte titulo={x.s.asunto} sub={`#${x.s.folio}, ${TIPOS_SOLICITUD[x.s.tipo as TipoSolicitud].corto}${x.s.categoria ? `, ${x.s.categoria}` : ""}`} />
      <div className="sol-s">
        <section className="glass panel-s conv-s">
          <div className="conv-a">
            {mensajes.map(({ m, autor: a }) => (
              <div key={m.id} className={`msg-a ${m.deSoporte ? "mio" : ""}`}>
                <small>{m.deSoporte ? `${a.split(" ")[0]}, soporte` : a.split(" ")[0]}, {hace(m.creadoEn)}</small>
                <p>{m.texto}</p>
                {m.adjuntoNombre && <a className="adj-msg" href={`/api/adjunto/${m.id}`} target="_blank" rel="noreferrer"><Icono n="clip" />{m.adjuntoNombre}</a>}
              </div>
            ))}
          </div>
          <Responder id={id} estado={x.s.estado as EstadoSolicitud} />
        </section>
        <aside className="lado-s">
          <section className="glass panel-s">
            <Campos key={`${x.s.estado}${x.s.prioridad}${x.s.responsableId}`} id={id} estado={x.s.estado} prioridad={x.s.prioridad} responsable={x.s.responsableId ?? ""}
              estados={Object.entries(ESTADOS_SOLICITUD).map(([valor, texto]) => ({ valor, texto }))}
              prioridades={Object.entries(PRIORIDADES).map(([valor, texto]) => ({ valor, texto }))}
              equipo={[{ valor: "", texto: "Sin asignar" }, ...equipo.map((u) => ({ valor: u.id, texto: u.nombre }))]} />
          </section>
          <section className="glass panel-s">
            <span className="lab">Quién la envió</span>
            <div className="datos-l">
              <div><span>Persona</span><b>{x.persona.nombre}</b></div>
              <div><span>Puesto</span><b>{c.puesto ?? NOMBRE_ROL[x.persona.rol]}</b></div>
              <div><span>Negocio</span><Link className="enlace" href={`/soporte/negocios/${x.negocio.id}`}>{x.negocio.nombre}</Link></div>
              {c.ruta && <div><span>Página</span><b className="mono">{c.ruta}</b></div>}
              {c.pantalla && <div><span>Pantalla</span><b>{c.pantalla}</b></div>}
              {c.navegador && <div><span>Navegador</span><small className="muted">{c.navegador}</small></div>}
            </div>
          </section>
          <section className="glass panel-s">
            <span className="lab">Diagnóstico automático</span>
            {c.errores?.length ? c.errores.map((e, i) => <div key={i} className="error-s"><small>{hace(e.t)}, {e.ruta}</small><code>{e.mensaje}</code></div>)
              : <p className="muted chico-t" style={{ margin: 0 }}>No hubo errores registrados para esta persona en la hora anterior al envío.</p>}
            <Link className="link-c" href={`/soporte/negocios/${x.negocio.id}`}>Diagnóstico del negocio<Icono n="derecha" /></Link>
          </section>
          {otras.length > 1 && (
            <section className="glass panel-s">
              <span className="lab">Otras solicitudes de esta persona</span>
              {otras.filter((o) => o.id !== id).map((o) => <Link key={o.id} className="fila-mini" href={`/soporte/solicitudes/${o.id}`}><span>{o.asunto}</span><small>{ESTADOS_SOLICITUD[o.estado as EstadoSolicitud]}</small></Link>)}
            </section>
          )}
          <section className="glass panel-s">
            <span className="lab">Historial de actividad</span>
            <ol className="eventos-s">{eventos.map(({ e }) => <li key={e.id}><span>{e.accion}</span><small>{hace(e.creadoEn)}</small></li>)}</ol>
          </section>
        </aside>
      </div>
    </>
  );
}
