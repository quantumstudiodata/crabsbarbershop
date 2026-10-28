"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cerrarSesionesDe, hashContrasena, requerirSesion } from "@/lib/auth";
import { contrasenaTemporal, sugerirUsuario } from "@/lib/cuentas";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { NOMBRE_ROL, PERMISOS, rolesAsignables, type Rol } from "@/lib/permisos";
import { texto, volver } from "@/lib/volver";

export type EstadoClave = { error?: string; nombre?: string; usuario?: string; clave?: string };

/** Da de alta a una persona. La contraseña temporal se devuelve una sola vez y no se guarda legible. */
export async function darDeAlta(_: EstadoClave, form: FormData): Promise<EstadoClave> {
  const s = await requerirSesion("ajustes.usuarios");
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ");
  const rol = texto(form, "rol") as Rol;
  if (nombre.split(" ").length < 2) return { error: "Escribe nombre y apellido." };
  if (!rolesAsignables(s.usuario.rol).includes(rol)) return { error: "No puedes asignar ese rol." };
  const existentes = (await db.select({ u: schema.usuarios.usuario }).from(schema.usuarios)).map((x) => x.u);
  const usuario = sugerirUsuario(nombre, existentes);
  const clave = contrasenaTemporal(nombre);
  await db.transaction(async (tx) => {
    await tx.insert(schema.usuarios).values({ barberiaId: s.barberia.id, nombre, usuario, rol, hash: await hashContrasena(clave), debeCambiar: true });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} dio de alta a ${nombre} como ${NOMBRE_ROL[rol]}`, detalle: { usuario } });
  });
  revalidatePath("/ajustes");
  return { nombre, usuario, clave };
}

async function personaDeMiBarberia(barberiaId: string, id: string) {
  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.barberiaId, barberiaId))).limit(1);
  return u ?? null;
}

export async function restablecer(_: EstadoClave, form: FormData): Promise<EstadoClave> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, texto(form, "id", 40));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "Tu propia contraseña se cambia en la opción Contraseña." };
  if (!rolesAsignables(s.usuario.rol).includes(u.rol)) return { error: "No puedes restablecer la contraseña de esa persona." };
  const clave = contrasenaTemporal(u.nombre);
  await db.update(schema.usuarios).set({ hash: await hashContrasena(clave), debeCambiar: true, intentosFallidos: 0, bloqueadoHasta: null }).where(eq(schema.usuarios.id, u.id));
  await cerrarSesionesDe(u.id);
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} restableció la contraseña de ${u.nombre}` });
  return { nombre: u.nombre, usuario: u.usuario, clave };
}

export async function actualizarPersona(form: FormData) {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, texto(form, "id", 40));
  if (!u) volver("/ajustes", { error: "No se encontró a esa persona." });
  if (u.id === s.usuario.id) volver("/ajustes", { error: "No puedes cambiar tu propio rol ni desactivarte." });
  const asignables = rolesAsignables(s.usuario.rol);
  if (!asignables.includes(u.rol)) volver("/ajustes", { error: "No puedes cambiar a esa persona." });
  const rol = texto(form, "rol") as Rol;
  if (!asignables.includes(rol)) volver("/ajustes", { error: "No puedes asignar ese rol." });
  const activo = form.get("activo") === "si";
  const extra = form.getAll("permisos").map(String).filter((p) => p in PERMISOS);
  await db.transaction(async (tx) => {
    await tx.update(schema.usuarios).set({ rol, activo, permisosExtra: extra }).where(eq(schema.usuarios.id, u.id));
    const cambios: string[] = [];
    if (rol !== u.rol) cambios.push(`rol a ${NOMBRE_ROL[rol]}`);
    if (activo !== u.activo) cambios.push(activo ? "lo activó" : "lo desactivó");
    if (extra.sort().join() !== [...u.permisosExtra].sort().join()) cambios.push("permisos extra");
    if (cambios.length) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} cambió a ${u.nombre}: ${cambios.join(", ")}`, detalle: { permisosExtra: extra } });
  });
  if (!activo) await cerrarSesionesDe(u.id);
  revalidatePath("/ajustes");
  volver("/ajustes", { aviso: "guardado" });
}
