"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cerrarSesionesDe, hashContrasena, requerirSesion } from "@/lib/auth";
import { cifrar, descifrar, expiraClave } from "@/lib/claves";
import { contrasenaTemporal, sugerirUsuario } from "@/lib/cuentas";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { leerPesos } from "@/lib/money";
import { NOMBRE_ROL, PERMISOS, PERMISOS_POR_ROL, rolesAsignables, type Rol } from "@/lib/permisos";
import { texto } from "@/lib/volver";

export type ClaveVisible = { nombre: string; usuario: string; clave: string; expira: number };
export type EstadoPersona = { ok?: boolean; error?: string; mensaje?: string; clave?: ClaveVisible; n?: number };

async function personaDeMiBarberia(barberiaId: string, id: string) {
  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.barberiaId, barberiaId))).limit(1);
  return u ?? null;
}

async function atenderSolicitudes(usuarioId: string) {
  await db.update(schema.solicitudesClave).set({ atendida: true }).where(and(eq(schema.solicitudesClave.usuarioId, usuarioId), eq(schema.solicitudesClave.atendida, false)));
}

/** Da de alta a una persona. La contraseña temporal se puede volver a ver durante 30 minutos. */
export async function darDeAlta(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ");
  const rol = texto(form, "rol") as Rol;
  if (nombre.split(" ").length < 2) return { error: "Escribe nombre y apellido." };
  if (!rolesAsignables(s.usuario.rol).includes(rol)) return { error: "Elige un rol." };
  const existentes = (await db.select({ u: schema.usuarios.usuario }).from(schema.usuarios)).map((x) => x.u);
  const usuario = sugerirUsuario(nombre, existentes);
  const clave = contrasenaTemporal(nombre);
  const expira = expiraClave();
  await db.transaction(async (tx) => {
    await tx.insert(schema.usuarios).values({ barberiaId: s.barberia.id, nombre, usuario, rol, hash: await hashContrasena(clave), debeCambiar: true, claveTemporal: cifrar(clave), claveTemporalExpira: expira });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} dio de alta a ${nombre} como ${NOMBRE_ROL[rol]}`, detalle: { usuario } });
  });
  revalidatePath("/ajustes");
  return { ok: true, clave: { nombre, usuario, clave, expira: expira.getTime() }, n: Date.now() };
}

export async function restablecer(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "Tu propia contraseña se cambia desde tu menú." };
  if (!rolesAsignables(s.usuario.rol).includes(u.rol)) return { error: "No puedes restablecer la contraseña de esa persona." };
  const clave = contrasenaTemporal(u.nombre);
  const expira = expiraClave();
  await db.update(schema.usuarios).set({ hash: await hashContrasena(clave), debeCambiar: true, intentosFallidos: 0, bloqueadoHasta: null, claveTemporal: cifrar(clave), claveTemporalExpira: expira }).where(eq(schema.usuarios.id, u.id));
  await cerrarSesionesDe(u.id);
  await atenderSolicitudes(u.id);
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} restableció la contraseña de ${u.nombre}` });
  revalidatePath("/ajustes");
  return { ok: true, clave: { nombre: u.nombre, usuario: u.usuario, clave, expira: expira.getTime() }, n: Date.now() };
}

/** Vuelve a mostrar la contraseña temporal mientras no pasen los 30 minutos. */
export async function verClave(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u || !rolesAsignables(s.usuario.rol).includes(u.rol)) return { error: "No se encontró a esa persona." };
  if (!u.claveTemporal || !u.claveTemporalExpira || u.claveTemporalExpira < new Date() || !u.debeCambiar) return { error: "Ya pasaron los 30 minutos. Restablécela otra vez para ver una nueva." };
  const clave = descifrar(u.claveTemporal);
  if (!clave) return { error: "No se pudo leer la contraseña. Restablécela otra vez." };
  return { ok: true, clave: { nombre: u.nombre, usuario: u.usuario, clave, expira: u.claveTemporalExpira.getTime() } };
}

export async function actualizarPersona(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, texto(form, "id", 40));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "No puedes cambiar tu propio rol." };
  const asignables = rolesAsignables(s.usuario.rol);
  if (!asignables.includes(u.rol)) return { error: "No puedes cambiar a esa persona." };
  const rol = texto(form, "rol") as Rol;
  if (!asignables.includes(rol)) return { error: "Elige un rol." };
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ") || u.nombre;
  const activo = form.get("activo") === "si";
  const base = new Set<string>(PERMISOS_POR_ROL[rol]);
  const extra = form.getAll("permisos").map(String).filter((p) => p in PERMISOS && !base.has(p) && !p.startsWith("ajustes."));
  const meta = leerPesos(texto(form, "meta")) ?? 0;
  await db.transaction(async (tx) => {
    await tx.update(schema.usuarios).set({ nombre, rol, activo, permisosExtra: extra, metaSemanal: meta }).where(eq(schema.usuarios.id, u.id));
    const cambios: string[] = [];
    if (nombre !== u.nombre) cambios.push(`nombre a ${nombre}`);
    if (rol !== u.rol) cambios.push(`rol a ${NOMBRE_ROL[rol]}`);
    if (activo !== u.activo) cambios.push(activo ? "le devolvió el acceso" : "le quitó el acceso");
    if ([...extra].sort().join() !== [...u.permisosExtra].sort().join()) cambios.push("permisos");
    if (meta !== u.metaSemanal) cambios.push("meta semanal");
    if (cambios.length) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} cambió a ${u.nombre}: ${cambios.join(", ")}`, detalle: { permisosExtra: extra } });
  });
  if (!activo) await cerrarSesionesDe(u.id);
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Cambios guardados.", n: Date.now() };
}

/** Si la persona nunca registró nada, se borra. Si ya tiene movimientos, se da de baja y su historial se conserva. */
export async function darDeBaja(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "No puedes darte de baja a ti mismo." };
  if (!rolesAsignables(s.usuario.rol).includes(u.rol)) return { error: "No puedes dar de baja a esa persona." };
  let borrada = false;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.solicitudesClave).where(eq(schema.solicitudesClave.usuarioId, u.id));
      await tx.delete(schema.reglasComision).where(eq(schema.reglasComision.barberoId, u.id));
      await tx.delete(schema.usuarios).where(eq(schema.usuarios.id, u.id));
    });
    borrada = true;
  } catch {
    await db.update(schema.usuarios).set({ activo: false, claveTemporal: null, claveTemporalExpira: null }).where(eq(schema.usuarios.id, u.id));
    await cerrarSesionesDe(u.id);
  }
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: borrada ? `${s.usuario.nombre} eliminó a ${u.nombre}, que no tenía movimientos` : `${s.usuario.nombre} dio de baja a ${u.nombre}` });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: borrada ? `${u.nombre} se eliminó porque no tenía movimientos.` : `${u.nombre} ya no tiene acceso. Su historial se conserva.`, n: Date.now() };
}
