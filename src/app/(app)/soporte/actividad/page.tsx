import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db, schema as t } from "@/lib/db";
import { solicitudes } from "@/lib/plataforma";
import { hace } from "@/lib/soporte";
import { NOVEDADES } from "@/lib/novedades";
import { ocultarSensibles } from "@/lib/sensibles";
import { fechaLarga } from "@/lib/fechas";
import { Icono } from "@/components/Icono";
import { CabezaSoporte, ListaSolicitudes } from "../Comunes";

export const metadata = { title: "Actividad e incidencias" };

const VISTAS: [string, string, string][] = [
  ["actividad", "Registro de actividad", "Qué hicieron las personas: ventas, cajas, servicios, usuarios y permisos."],
  ["errores", "Errores del sistema", "Qué falló técnicamente: al guardar, al cargar una página o al conectarse con la base de datos. Toca uno para ver su detalle."],
  ["incidencias", "Incidencias", "Problemas reportados que necesitan seguimiento hasta resolverse."],
  ["servicios", "Estado de servicios", "Si cada parte técnica de la plataforma funciona en este momento."],
  ["cambios", "Historial de cambios", "Qué actualizaciones se publicaron en la plataforma."],
];

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
      <p className="muted desc-s">{VISTAS.find(([k]) => k === ver)![2]}</p>
      <section className="glass panel-s">
        {(ver === "actividad" || ver === "errores") && (
          <form className="buscar-s chico" action="/soporte/actividad"><input type="hidden" name="ver" value={ver} />{negocio && <input type="hidden" name="negocio" value={negocio} />}<Icono n="buscar" />
            <input name="q" className="input" defaultValue={buscar} placeholder={ver === "errores" ? "Buscar en el mensaje o la página" : "Buscar acción, persona o negocio"} aria-label="Buscar" /></form>
        )}
        {ver === "actividad" && <Registro buscar={buscar} negocio={negocio} />}
        {ver === "cambios" && <Actualizaciones />}
        {ver === "errores" && <Errores buscar={buscar} negocio={negocio} />}
        {ver === "incidencias" && <ListaSolicitudes filas={await solicitudes({ tipo: "problema", estado: "abiertas", negocioId: negocio || undefined })} vacio="No hay incidencias abiertas." />}
        {ver === "servicios" && <Servicios />}
      </section>
    </>
  );
}

/** Qué acciones hicieron las personas, en todos los negocios. */
async function Registro({ buscar, negocio }: { buscar: string; negocio: string }) {
  const w: SQL[] = [];
  if (negocio) w.push(eq(t.historial.barberiaId, negocio));
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

/** Errores agrupados: el mismo fallo en la misma página cuenta como uno, con sus repeticiones. */
async function Errores({ buscar, negocio }: { buscar: string; negocio: string }) {
  const w: SQL[] = [];
  if (negocio) w.push(eq(t.erroresSistema.barberiaId, negocio));
  if (buscar) w.push(sql`(${ilike(t.erroresSistema.mensaje, `%${buscar}%`)} or ${ilike(t.erroresSistema.ruta, `%${buscar}%`)})`);
  const grupos = await db.select({
    id: sql<string>`(array_agg(${t.erroresSistema.id} order by ${t.erroresSistema.creadoEn} desc))[1]`,
    mensaje: t.erroresSistema.mensaje, ruta: t.erroresSistema.ruta, origen: t.erroresSistema.origen,
    veces: sql<number>`count(*)::int`, negocios: sql<number>`count(distinct ${t.erroresSistema.barberiaId})::int`, ultima: sql<Date>`max(${t.erroresSistema.creadoEn})`,
  }).from(t.erroresSistema).where(w.length ? and(...w) : undefined)
    .groupBy(t.erroresSistema.mensaje, t.erroresSistema.ruta, t.erroresSistema.origen).orderBy(sql`max(${t.erroresSistema.creadoEn}) desc`).limit(60);
  if (!grupos.length) return <p className="muted vacio-s">No hay errores registrados.</p>;
  return (
    <div className="lista-s">
      {grupos.map((g) => (
        <Link key={g.id} href={`/soporte/actividad/error/${g.id}`} className="fila-s">
          <span className="t-s"><b className="mono-t">{ocultarSensibles(g.mensaje)}</b><small>{g.ruta || "Sin página"}, {g.origen}{g.negocios > 1 ? `, ${g.negocios} negocios` : ""}</small></span>
          <span className="meta-s">{g.veces > 1 && <span className="chip-p alerta">{g.veces} veces</span>}<small>{hace(g.ultima)}</small><Icono n="derecha" /></span>
        </Link>
      ))}
    </div>
  );
}

/** Actualizaciones publicadas de la plataforma. */
function Actualizaciones() {
  const porFecha = new Map<string, string[]>();
  for (const n of NOVEDADES) porFecha.set(n.fecha, [...(porFecha.get(n.fecha) ?? []), n.texto]);
  return (
    <div className="lista-s">
      {[...porFecha].map(([f, xs]) => (
        <div key={f} className="novedad-s">
          <b>{fechaLarga(f)}</b>
          <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** Comprueba cada parte de la plataforma con una consulta real y mide cuánto tarda. */
async function Servicios() {
  const medir = async (f: () => Promise<unknown>) => {
    const t0 = performance.now();
    try { await f(); return { ok: true, ms: Math.round(performance.now() - t0) }; } catch { return { ok: false, ms: 0 }; }
  };
  const [base, sesiones, cobros, adjuntos, avisos] = await Promise.all([
    medir(() => db.execute(sql`select 1`)),
    medir(() => db.select({ n: sql`count(*)` }).from(t.sesiones).where(sql`${t.sesiones.expiraEn} > now()`)),
    medir(() => db.select({ id: t.ventas.id }).from(t.ventas).orderBy(desc(t.ventas.creadoEn)).limit(1)),
    medir(() => db.select({ id: t.comprobantes.id }).from(t.comprobantes).limit(1)),
    medir(() => db.select({ id: t.historial.id }).from(t.historial).orderBy(desc(t.historial.creadoEn)).limit(1)),
  ]);
  const [e] = await db.select({ hora: sql<number>`count(*) filter (where ${t.erroresSistema.creadoEn} > now() - interval '1 hour')::int` }).from(t.erroresSistema);
  const [m] = await db.execute<{ m: string | null }>(sql`select to_char(to_timestamp(max(created_at) / 1000), 'YYYY-MM-DD HH24:MI') as m from drizzle.__drizzle_migrations`).catch(() => [{ m: null }]);
  const estado = (r: { ok: boolean; ms: number }) => r.ok ? <span className={`chip-p ${r.ms > 800 ? "alerta" : "si"}`}>{r.ms > 800 ? `Lento, ${r.ms} ms` : `Funciona, ${r.ms} ms`}</span> : <span className="chip-p alerta">No responde</span>;
  const filas: [string, string, React.ReactNode][] = [
    ["Aplicación", "Páginas y acciones", <span key="a" className="chip-p si">Funciona</span>],
    ["Base de datos", "Conexión y consultas", estado(base)],
    ["Inicio de sesión", "Sesiones de las personas", estado(sesiones)],
    ["Cobros y ventas", "Registro de ventas", estado(cobros)],
    ["Comprobantes y adjuntos", "Archivos de egresos y solicitudes", estado(adjuntos)],
    ["Notificaciones", "Historial y avisos en vivo", estado(avisos)],
    ["Errores en la última hora", "Registrados automáticamente", e.hora ? <span key="e" className="chip-p alerta">{e.hora}</span> : <span key="e" className="chip-p si">Ninguno</span>],
  ];
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return (
    <div className="lista-s">
      {filas.map(([k, d, v]) => <div key={k} className="fila-s plana"><span className="t-s"><b>{k}</b><small>{d}</small></span>{v}</div>)}
      <p className="muted chico-t" style={{ margin: "8px 8px 0" }}>Versión publicada {commit ?? "local"}{process.env.VERCEL_REGION ? `, región ${process.env.VERCEL_REGION}` : ""}. Última actualización de la base: {m?.m ?? "sin dato"}.</p>
    </div>
  );
}
