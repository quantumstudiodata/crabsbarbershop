import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_VISTA, COOKIE_VISTA_NEGOCIO, obtenerSesion } from "@/lib/auth";
import { PLANTILLAS, type Rol } from "@/lib/permisos";

/** Entra o sale del modo de visualización. Solo para la cuenta de soporte de la plataforma. */
export async function GET(req: NextRequest) {
  const s = await obtenerSesion();
  const base = req.nextUrl.origin;
  if (!s?.usuario.esSoporte) return NextResponse.redirect(new URL("/", base));
  const como = req.nextUrl.searchParams.get("como") ?? "";
  if (!como || req.nextUrl.searchParams.has("salir")) {
    const r = NextResponse.redirect(new URL("/soporte", base));
    r.cookies.delete(COOKIE_VISTA);
    r.cookies.delete(COOKIE_VISTA_NEGOCIO);
    return r;
  }
  if (!PLANTILLAS.includes(como as Rol) && !/^puesto:[0-9a-f-]{36}$/.test(como)) return NextResponse.redirect(new URL("/soporte", base));
  // Al cambiar de experiencia se queda en la misma página, para comparar un puesto con otro.
  const volver = req.nextUrl.searchParams.get("volver") ?? "/";
  const destino = /^\/(?!\/)[\w\-/?=&%.]*$/.test(volver) && !volver.startsWith("/api") ? volver : "/";
  const r = NextResponse.redirect(new URL(destino, base));
  // No es httpOnly: la página lo lee para avisar que no se guardan cambios.
  const opciones = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 4 * 3600 };
  r.cookies.set(COOKIE_VISTA, como, opciones);
  // Negocio de referencia: solo se acepta si es de prueba (lo vuelve a comprobar la sesión).
  const negocio = req.nextUrl.searchParams.get("negocio");
  if (negocio !== null) {
    if (/^[0-9a-f-]{36}$/.test(negocio)) r.cookies.set(COOKIE_VISTA_NEGOCIO, negocio, opciones);
    else r.cookies.delete(COOKIE_VISTA_NEGOCIO);
  }
  return r;
}
