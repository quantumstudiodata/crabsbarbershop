import "server-only";
import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema as t } from "./db";
import type { EstadoSolicitud, Prioridad, TipoSolicitud } from "./soporte";

export type FilaSolicitud = {
  id: string; folio: number; asunto: string; tipo: TipoSolicitud; estado: EstadoSolicitud; prioridad: Prioridad;
  negocio: string; persona: string; puesto: string; t: Date; responsable: string | null; pendienteSoporte: boolean;
};

/** Solicitudes de todos los negocios, con filtro de estado y búsqueda. */
export async function solicitudes(f: { estado?: string; q?: string; limite?: number; negocioId?: string; tipo?: string }): Promise<FilaSolicitud[]> {
  const resp = alias(t.usuarios, "resp");
  const w: SQL[] = [];
  if (f.estado === "abiertas") w.push(ne(t.solicitudesSoporte.estado, "resuelto"));
  else if (f.estado) w.push(eq(t.solicitudesSoporte.estado, f.estado));
  if (f.negocioId) w.push(eq(t.solicitudesSoporte.barberiaId, f.negocioId));
  if (f.tipo) w.push(eq(t.solicitudesSoporte.tipo, f.tipo));
  if (f.q) {
    const q = `%${f.q}%`;
    w.push(or(ilike(t.solicitudesSoporte.asunto, q), ilike(t.barberias.nombre, q), ilike(t.usuarios.nombre, q), sql`${t.solicitudesSoporte.folio}::text = ${f.q.replace("#", "")}`)!);
  }
  const filas = await db.select({ s: t.solicitudesSoporte, negocio: t.barberias.nombre, persona: t.usuarios.nombre, rol: t.usuarios.rol, resp: resp.nombre })
    .from(t.solicitudesSoporte).innerJoin(t.barberias, eq(t.barberias.id, t.solicitudesSoporte.barberiaId)).innerJoin(t.usuarios, eq(t.usuarios.id, t.solicitudesSoporte.usuarioId))
    .leftJoin(resp, eq(resp.id, t.solicitudesSoporte.responsableId))
    .where(w.length ? and(...w) : undefined)
    // Primero lo que espera a soporte, luego lo más urgente y lo más reciente.
    .orderBy(sql`case ${t.solicitudesSoporte.estado} when 'pendiente' then 0 when 'revision' then 1 when 'esperando' then 2 else 3 end`,
      sql`case ${t.solicitudesSoporte.prioridad} when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end`, desc(t.solicitudesSoporte.actualizadoEn))
    .limit(f.limite ?? 100);
  const { NOMBRE_ROL } = await import("./permisos");
  return filas.map(({ s, negocio, persona, rol, resp: r }) => ({
    id: s.id, folio: s.folio, asunto: s.asunto, tipo: s.tipo as TipoSolicitud, estado: s.estado as EstadoSolicitud, prioridad: s.prioridad as Prioridad,
    negocio, persona: persona.split(" ")[0], puesto: NOMBRE_ROL[rol], t: s.actualizadoEn, responsable: r?.split(" ")[0] ?? null, pendienteSoporte: s.estado === "pendiente",
  }));
}

export async function indicadores() {
  const [r] = await db.select({
    negocios: sql<number>`(select count(*) from barberias where not es_prueba)::int`,
    pruebas: sql<number>`(select count(*) from barberias where es_prueba)::int`,
    usuarios: sql<number>`(select count(*) from usuarios u join barberias b on b.id = u.barberia_id where u.activo and not b.es_prueba and u.usuario not like 'BORRADO-%')::int`,
    pendientes: sql<number>`(select count(*) from solicitudes_soporte where estado = 'pendiente')::int`,
    abiertas: sql<number>`(select count(*) from solicitudes_soporte where estado <> 'resuelto')::int`,
    errores: sql<number>`(select count(*) from errores_sistema where creado_en > now() - interval '24 hours')::int`,
  }).from(sql`(select 1) x`);
  return r;
}

/** Negocios con su propietario y su actividad reciente. */
export async function negocios(q?: string) {
  const duena = alias(t.usuarios, "duena");
  const w = q ? or(ilike(t.barberias.nombre, `%${q}%`), ilike(duena.nombre, `%${q}%`), sql`${t.barberias.id}::text ilike ${`${q}%`}`) : undefined;
  const filas = await db.selectDistinctOn([t.barberias.id], { b: t.barberias, duena: duena.nombre }).from(t.barberias)
    .leftJoin(duena, and(eq(duena.barberiaId, t.barberias.id), eq(duena.rol, "duena"), eq(duena.activo, true))).where(w).orderBy(t.barberias.id);
  const ids = filas.map((f) => f.b.id);
  const [us, vs] = ids.length ? await Promise.all([
    db.select({ b: t.usuarios.barberiaId, n: sql<number>`count(*)::int` }).from(t.usuarios).where(and(inArray(t.usuarios.barberiaId, ids), eq(t.usuarios.activo, true))).groupBy(t.usuarios.barberiaId),
    db.select({ b: t.ventas.barberiaId, n: sql<number>`count(*)::int`, ultima: sql<Date | null>`max(${t.ventas.creadoEn})` }).from(t.ventas).where(inArray(t.ventas.barberiaId, ids)).groupBy(t.ventas.barberiaId),
  ]) : [[], []];
  return filas.map(({ b, duena: d }) => ({
    id: b.id, nombre: b.nombre, prueba: b.esPrueba, estado: b.estadoCuenta, plan: b.plan, propietario: d,
    usuarios: us.find((x) => x.b === b.id)?.n ?? 0, ventas: vs.find((x) => x.b === b.id)?.n ?? 0, ultima: vs.find((x) => x.b === b.id)?.ultima ?? null,
  })).sort((a, b) => Number(a.prueba) - Number(b.prueba) || a.nombre.localeCompare(b.nombre));
}
