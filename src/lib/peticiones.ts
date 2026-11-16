import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema as t } from "./db";

export { TIPOS_PETICION, type TipoPeticion } from "./peticiones-tipos";

/** Quien administra el negocio: Titular o quien puede editar usuarios. Recibe y responde las peticiones. */
export function esAdministra(s: { usuario: { rol: string }; puede: (p: never) => boolean }) {
  return s.usuario.rol === "duena" || (s.puede as (p: string) => boolean)("usuarios.editar");
}

/** Para el botón de ayuda: peticiones del equipo sin resolver (quien administra) y respuestas sin leer (quien pidió). */
export async function conteoPeticiones(s: { usuario: { id: string; rol: string }; barberia: { id: string }; puede: (p: never) => boolean }) {
  try {
    const [abiertas, respondidas] = await Promise.all([
      esAdministra(s) ? db.select({ n: sql<number>`count(*)::int` }).from(t.peticionesInternas)
        .where(and(eq(t.peticionesInternas.barberiaId, s.barberia.id), eq(t.peticionesInternas.estado, "abierta"))).then((r) => r[0]?.n ?? 0) : Promise.resolve(0),
      db.select({ n: sql<number>`count(*)::int` }).from(t.peticionesInternas)
        .where(and(eq(t.peticionesInternas.usuarioId, s.usuario.id), eq(t.peticionesInternas.estado, "resuelta"), isNull(t.peticionesInternas.vistoUsuarioEn))).then((r) => r[0]?.n ?? 0),
    ]);
    return { equipo: abiertas, respondidas };
  } catch {
    // Si la tabla todavía no existe en la base, la ayuda funciona sin peticiones.
    return { equipo: 0, respondidas: 0 };
  }
}
