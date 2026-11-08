import { eq } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Archivo adjunto de una solicitud de soporte: lo ven quien la envió y el soporte de la plataforma. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado.", { status: 404 });
  const [m] = await db.select({ m: schema.mensajesSoporte, autor: schema.solicitudesSoporte.usuarioId }).from(schema.mensajesSoporte)
    .innerJoin(schema.solicitudesSoporte, eq(schema.solicitudesSoporte.id, schema.mensajesSoporte.solicitudId))
    .where(eq(schema.mensajesSoporte.id, id)).limit(1);
  if (!m?.m.adjuntoDatos || (!s.usuario.esSoporte && m.autor !== s.usuario.id)) return new Response("No encontrado.", { status: 404 });
  const datos = Buffer.from(m.m.adjuntoDatos.slice(m.m.adjuntoDatos.indexOf(",") + 1), "base64");
  return new Response(datos, { headers: { "Content-Type": m.m.adjuntoTipo ?? "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(m.m.adjuntoNombre ?? "adjunto")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
