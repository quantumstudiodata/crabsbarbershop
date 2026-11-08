import { eq } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { guardarError } from "@/lib/errores";

/** Errores que ve una persona en su navegador. Solo con sesión, para no recibir basura de fuera. */
export async function POST(req: Request) {
  const s = await obtenerSesion();
  if (!s) return new Response(null, { status: 204 });
  const b = await req.json().catch(() => ({})) as { mensaje?: string; ruta?: string; digest?: string };
  if (typeof b.mensaje !== "string" || !b.mensaje) return new Response(null, { status: 204 });
  // Un error del servidor llega también al navegador con el mismo código: se guarda una sola vez.
  if (typeof b.digest === "string" && b.digest && (await db.select({ id: schema.erroresSistema.id }).from(schema.erroresSistema).where(eq(schema.erroresSistema.digest, b.digest.slice(0, 80))).limit(1)).length) return new Response(null, { status: 204 });
  await guardarError({ origen: "navegador", ruta: String(b.ruta ?? ""), mensaje: b.mensaje, digest: typeof b.digest === "string" ? b.digest.slice(0, 80) : null, usuarioId: s.usuario.id, barberiaId: s.barberia.id });
  return new Response(null, { status: 204 });
}
