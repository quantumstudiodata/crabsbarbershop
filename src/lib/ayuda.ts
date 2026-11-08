import { eq, sql } from "drizzle-orm";
import { db, schema as t } from "./db";

/** Cuántas solicitudes siguen abiertas y cuántas tienen respuestas sin leer. */
export async function conteoAyuda(usuarioId: string) {
  const [r] = await db.select({
    abiertas: sql<number>`count(*) filter (where ${t.solicitudesSoporte.estado} <> 'resuelto')::int`,
    nuevas: sql<number>`count(*) filter (where exists (select 1 from mensajes_soporte m where m.solicitud_id = ${t.solicitudesSoporte.id} and m.de_soporte and m.creado_en > ${t.solicitudesSoporte.vistoUsuarioEn}))::int`,
  }).from(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.usuarioId, usuarioId));
  return r ?? { abiertas: 0, nuevas: 0 };
}
