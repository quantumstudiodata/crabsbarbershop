import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db, schema as t } from "@/lib/db";
import { solicitudes } from "@/lib/plataforma";
import { hace } from "@/lib/soporte";
import { Icono } from "@/components/Icono";
import { CabezaSoporte, ListaSolicitudes } from "../Comunes";

export const metadata = { title: "Actividad e incidencias" };

const VISTAS: [string, string][] = [["actividad", "Registro de actividad"], ["errores", "Errores del sistema"], ["incidencias", "Incidencias"], ["servicios", "Estado de servicios"], ["cambios", "Historial de cambios"]];

export default async function Actividad({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; negocio?: string }> }) {
  const q = await searchParams;
  const ver = VISTAS.some(([k]) => k === q.ver) ? q.ver! : "actividad";
  const buscar = q.q?.trim().slice(0, 60) ?? "";
  const negocio = /^[0-9a-f-]{36}$/.test(q.negocio ?? "") ? q.negocio! : "";
  const url = (v: string) => `/soporte/actividad?ver=${v}${negocio ? `&negocio=${negocio}` : ""}`;
  return (
    <>
      <CabezaSoporte titulo="Actividad e incidencias" sub="Para diagnosticar y resolver problemas sin investigar a mano" />
      <nav className="chips-s grande" aria-label="Herramienta">{VISTAS.map(([k, v]) => <Link key={k} href={url(k)} aria-current={ver === k ? "page" : undefined}>{v}</Link>)}</nav>
      <section className="glass panel-s">
        {(ver === "actividad" || ver === "cambios" || ver === "errores") && (
          <form className="buscar-s chico" action="/soporte/actividad"><input type="hidden" name="ver" value={ver} />{negocio && <input type="hidden" name="negocio" value={negocio} />}<Icono n="buscar" />
            <input name="q" className="input" defaultValue={buscar} placeholder={ver === "errores" ? "Buscar en el mensaje o la página" : "Buscar acción, persona o negocio"} aria-label="Buscar" /></form>
        )}
        {ver === "actividad" && <Registro buscar={buscar} negocio={negocio} />}
        {ver === "cambios" && <Registro buscar={buscar} negocio={negocio} tipos={["ajuste", "precio", "usuario"]} />}
        {ver === "errores" && <Errores buscar={buscar} negocio={negocio} />}
        {ver === "incidencias" && <ListaSolicitudes filas={await solicitudes({ tipo: "problema", negocioId: negocio || undefined })} vacio="No hay problemas reportados." />}
        {ver === "servicios" && <Servicios />}
      </section>
    </>
  );
}

/** Qué acciones hicieron las personas, en todos los negocios. */
async function Registro({ buscar, negocio, tipos }: { buscar: string; negocio: string; tipos?: string[] }) {
  const w: SQL[] = [];
  if (negocio) w.push(eq(t.historial.barberiaId, negocio));
  if (tipos) w.push(inArray(t.historial.tipo, tipos));
  if (buscar) w.push(sql`(${ilike(t.historial.accion, `%${buscar}%`)} or ${ilike(t.usuarios.nombre, `%${buscar}%`)} or ${ilike(t.barberias.nombre, `%${buscar}%`)})`);
  const filas = await db.select({ h: t.historial, quien: t.usuarios.nombre, negocio: t.barberias.nombre, negocioId: t.barberias.id }).from(t.historial)
    .innerJoin(t.barberias, eq(t.barberias.id, t.historial.barberiaId)).leftJoin(t.usuarios, eq(t.usuarios.id, t.historial.usuarioId))
    .where(w.length ? and(...w) : undefined).orderBy(desc(t.historial.creadoEn)).limit(100);
  if (!filas.length) return <p className="muted vacio-s">Sin registros con esos filtros.</p>;
  return (
    <div className="lista-s">
      {filas.map(({ h, quien, negocio: n, negocioId }) => (
        <div key={h.id} className="fila-s plana">
          <span className="t-s"><b>{h.accion}</b><small>{quien ?? "Sistema"}, <Link className="enlace" href={`/soporte/negocios/${negocioId}`}>{n}</Link></small></span>
          <span className="meta-s"><span className="chip-p">{h.tipo}</span><small>{hace(h.creadoEn)}</small></span>
        </div>
      ))}
    </div>
  );
}

async function Errores({ buscar, negocio }: { buscar: string; negocio: string }) {
  const w: SQL[] = [];
  if (negocio) w.push(eq(t.erroresSistema.barberiaId, negocio));
  if (buscar) w.push(sql`(${ilike(t.erroresSistema.mensaje, `%${buscar}%`)} or ${ilike(t.erroresSistema.ruta, `%${buscar}%`)})`);
  const filas = await db.select({ e: t.erroresSistema, quien: t.usuarios.nombre, negocio: t.barberias.nombre }).from(t.erroresSistema)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.erroresSistema.usuarioId)).leftJoin(t.barberias, eq(t.barberias.id, t.erroresSistema.barberiaId))
    .where(w.length ? and(...w) : undefined).orderBy(desc(t.erroresSistema.creadoEn)).limit(100);
  if (!filas.length) return <p className="muted vacio-s">No hay errores registrados.</p>;
  return (
    <div className="lista-s">
      {filas.map(({ e, quien, negocio: n }) => (
        <div key={e.id} className="error-s fila-err">
          <small>{hace(e.creadoEn)}, {e.origen === "servidor" ? "servidor" : "navegador"}, {e.ruta || "sin página"}{n ? `, ${n}` : ""}{quien ? `, ${quien}` : ""}{e.digest ? `, código ${e.digest}` : ""}</small>
          <code>{e.mensaje}</code>
        </div>
      ))}
    </div>
  );
}

/** Comprueba que la base de datos responde y muestra la versión publicada. */
async function Servicios() {
  const t0 = performance.now();
  let base = true, ms = 0, migracion = "";
  try {
    const [r] = await db.execute<{ m: string | null }>(sql`select to_char(to_timestamp(max(created_at) / 1000), 'YYYY-MM-DD HH24:MI') as m from drizzle.__drizzle_migrations`);
    ms = Math.round(performance.now() - t0);
    migracion = r?.m ?? "";
  } catch { base = false; }
  const [e] = await db.select({ hora: sql<number>`count(*) filter (where ${t.erroresSistema.creadoEn} > now() - interval '1 hour')::int`, dia: sql<number>`count(*) filter (where ${t.erroresSistema.creadoEn} > now() - interval '24 hours')::int` }).from(t.erroresSistema);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const filas: [string, React.ReactNode][] = [
    ["Aplicación", <span key="a" className="chip-p">Funcionando</span>],
    ["Base de datos", base ? <span key="b" className="chip-p">Responde en {ms} ms</span> : <span key="b" className="chip-p alerta">No responde</span>],
    ["Errores en la última hora", e.hora ? <span key="c" className="chip-p alerta">{e.hora}</span> : <span key="c" className="chip-p">Ninguno</span>],
    ["Errores en 24 horas", <b key="d">{e.dia}</b>],
    ["Última actualización de la base", <b key="e">{migracion || "Sin dato"}</b>],
    ["Versión publicada", <b key="f" className="mono">{commit ?? "Local"}{process.env.VERCEL_ENV ? `, ${process.env.VERCEL_ENV}` : ""}</b>],
    ["Región", <b key="g">{process.env.VERCEL_REGION ?? "Local"}</b>],
  ];
  return <div className="lista-s">{filas.map(([k, v]) => <div key={k} className="fila-d"><span>{k}</span>{v}</div>)}</div>;
}
