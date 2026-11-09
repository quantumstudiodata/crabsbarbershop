import { and, eq } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Muestra una evidencia de corte de caja a quien puede ver los cortes de ese negocio. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  if (!s.puede("cortes.ver")) return new Response("Sin permiso.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado.", { status: 404 });
  const [c] = await db.select().from(schema.evidenciasCorte).where(and(eq(schema.evidenciasCorte.id, id), eq(schema.evidenciasCorte.barberiaId, s.barberia.id))).limit(1);
  if (!c) return new Response("No encontrado.", { status: 404 });
  const datos = Buffer.from(c.datos.slice(c.datos.indexOf(",") + 1), "base64");
  return new Response(datos, { headers: { "Content-Type": c.tipo, "Content-Disposition": `inline; filename="${encodeURIComponent(c.nombre)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
