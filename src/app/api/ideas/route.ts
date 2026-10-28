import { obtenerSesion } from "@/lib/auth";
import { propuestas } from "@/lib/propuestas";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar || !s.puede("ideas.decidir")) return new Response(null, { status: 403 });
  return Response.json(await propuestas(s.barberia.id, s.barberia.zonaHoraria), { headers: { "Cache-Control": "no-store" } });
}
