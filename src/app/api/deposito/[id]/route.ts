import { and, eq } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Muestra el comprobante de un depósito a la dueña a quien es del mismo negocio. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado.", { status: 404 });
  const [c] = await db.select({ nombre: schema.negocioDuena.comprobanteNombre, tipo: schema.negocioDuena.comprobanteTipo, datos: schema.negocioDuena.comprobanteDatos })
    .from(schema.negocioDuena).where(and(eq(schema.negocioDuena.id, id), eq(schema.negocioDuena.barberiaId, s.barberia.id), eq(schema.negocioDuena.tipo, "deposito"))).limit(1);
  if (!c?.datos) return new Response("No encontrado.", { status: 404 });
  const datos = Buffer.from(c.datos.slice(c.datos.indexOf(",") + 1), "base64");
  return new Response(datos, { headers: { "Content-Type": c.tipo ?? "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(c.nombre ?? "comprobante")}"`, "Cache-Control": "private, no-store" } });
}
