import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** Guarda un fallo para el panel de soporte. Nunca debe romper la petición que falló. */
export async function guardarError(e: { origen: "servidor" | "navegador"; ruta: string; mensaje: string; digest?: string | null; cookie?: string | null; usuarioId?: string | null; barberiaId?: string | null }) {
  try {
    let usuarioId = e.usuarioId ?? null, barberiaId = e.barberiaId ?? null;
    const token = e.cookie?.match(/(?:^|;\s*)crabs_sesion=([^;]+)/)?.[1];
    if (!usuarioId && token) {
      const [f] = await db.select({ u: schema.usuarios.id, b: schema.usuarios.barberiaId }).from(schema.sesiones)
        .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sesiones.usuarioId))
        .where(eq(schema.sesiones.id, createHash("sha256").update(decodeURIComponent(token)).digest("hex"))).limit(1);
      if (f) { usuarioId = f.u; barberiaId = f.b; }
    }
    await db.insert(schema.erroresSistema).values({ origen: e.origen, ruta: e.ruta.slice(0, 300), mensaje: e.mensaje.slice(0, 2000), digest: e.digest ?? null, usuarioId, barberiaId });
  } catch {
    // Si ni siquiera se puede guardar, no hay nada más que hacer.
  }
}
