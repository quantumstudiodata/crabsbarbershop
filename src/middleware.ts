import { NextResponse, type NextRequest } from "next/server";

/**
 * Modo de visualización: mientras está activo no se guarda nada.
 * Se bloquea cualquier envío (acciones del servidor, formularios y APIs) salvo entrar y salir del modo,
 * excepto cuando se está mirando un negocio de prueba.
 */
export function middleware(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || !req.cookies.get("crabs_vista")) return NextResponse.next();
  // En un negocio de prueba sí se ejecutan acciones reales. La sesión comprueba que de verdad sea de prueba.
  if (req.cookies.get("crabs_vista_prueba")?.value === "1" && req.cookies.get("crabs_vista_negocio")) return NextResponse.next();
  const ruta = req.nextUrl.pathname;
  if (ruta.startsWith("/api/vista") || ruta.startsWith("/entrar") || ruta.startsWith("/cambiar-contrasena")) return NextResponse.next();
  return new NextResponse("Estás en el modo de visualización: no se guardan cambios.", { status: 403, headers: { "x-crabs-vista": "1" } });
}

export const config = { matcher: ["/((?!_next/|icon|apple-icon|manifest).*)"] };
