import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const DIAS_ENCUESTA = 30;

/** La venta de una encuesta, si la clave es válida, la venta sigue pagada y aún no han pasado 30 días. */
export async function ventaDeEncuesta(token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const [v] = await db.select({ id: schema.ventas.id, barberiaId: schema.ventas.barberiaId, estado: schema.ventas.estado, creadoEn: schema.ventas.creadoEn, negocio: schema.barberias.nombre })
    .from(schema.ventas).innerJoin(schema.barberias, eq(schema.barberias.id, schema.ventas.barberiaId))
    .where(eq(schema.ventas.tokenEncuesta, token)).limit(1);
  if (!v || v.estado !== "pagada" || Date.now() - v.creadoEn.getTime() > DIAS_ENCUESTA * 86400000) return null;
  const [c] = await db.select({ barberoId: schema.conceptos.barberoId, nombre: schema.usuarios.nombre })
    .from(schema.conceptos).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.conceptos.barberoId))
    .where(and(eq(schema.conceptos.ventaId, v.id), eq(schema.conceptos.barberiaId, v.barberiaId))).orderBy(asc(schema.conceptos.id)).limit(1);
  if (!c) return null;
  const [r] = await db.select({ id: schema.resenas.id }).from(schema.resenas).where(eq(schema.resenas.ventaId, v.id)).limit(1);
  return { ...v, barberoId: c.barberoId, barbero: c.nombre.split(" ")[0], contestada: !!r };
}
