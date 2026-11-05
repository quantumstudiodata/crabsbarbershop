import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_VISTA, obtenerSesion } from "@/lib/auth";
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
    return r;
  }
  if (!PLANTILLAS.includes(como as Rol) && !/^puesto:[0-9a-f-]{36}$/.test(como)) return NextResponse.redirect(new URL("/soporte", base));
  const r = NextResponse.redirect(new URL("/", base));
  // No es httpOnly: la página lo lee para avisar que no se guardan cambios.
  r.cookies.set(COOKIE_VISTA, como, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 4 * 3600 });
  return r;
}
