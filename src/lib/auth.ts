import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "./db";
import { permisosDe, type Permiso, type Rol } from "./permisos";

const COOKIE = "crabs_sesion";
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas
export const INTENTOS_MAXIMOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export const hashContrasena = (texto: string) => bcrypt.hash(texto, 10);
export const verificarContrasena = (texto: string, hash: string) => bcrypt.compare(texto, hash);

export type Sesion = {
  usuario: { id: string; nombre: string; usuario: string; rol: Rol; debeCambiar: boolean };
  barberia: typeof schema.barberias.$inferSelect;
  permisos: Set<Permiso>;
  puede: (p: Permiso) => boolean;
};

export async function crearSesion(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + DURACION_MS);
  await db.insert(schema.sesiones).values({ id: sha256(token), usuarioId, expiraEn });
  await db.delete(schema.sesiones).where(lt(schema.sesiones.expiraEn, new Date()));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEn,
  });
}

export async function cerrarSesion() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sesiones).where(eq(schema.sesiones.id, sha256(token)));
  jar.delete(COOKIE);
}

/** Cierra todas las sesiones de una persona (al restablecer contraseña o desactivarla). */
export async function cerrarSesionesDe(usuarioId: string) {
  await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, usuarioId));
}

export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [fila] = await db
    .select({ u: schema.usuarios, b: schema.barberias })
    .from(schema.sesiones)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sesiones.usuarioId))
    .innerJoin(schema.barberias, eq(schema.barberias.id, schema.usuarios.barberiaId))
    .where(and(eq(schema.sesiones.id, sha256(token)), gt(schema.sesiones.expiraEn, new Date())))
    .limit(1);
  if (!fila || !fila.u.activo) return null;
  const permisos = permisosDe(fila.u.rol, fila.u.permisosExtra);
  return {
    usuario: { id: fila.u.id, nombre: fila.u.nombre, usuario: fila.u.usuario, rol: fila.u.rol, debeCambiar: fila.u.debeCambiar },
    barberia: fila.b,
    permisos,
    puede: (p) => permisos.has(p),
  };
});

/** Para páginas y acciones: exige sesión válida y, si se indica, un permiso. */
export async function requerirSesion(permiso?: Permiso): Promise<Sesion> {
  const s = await obtenerSesion();
  if (!s) redirect("/entrar");
  if (s.usuario.debeCambiar) redirect("/cambiar-contrasena");
  if (permiso && !s.puede(permiso)) redirect("/?aviso=sin-permiso");
  return s;
}
