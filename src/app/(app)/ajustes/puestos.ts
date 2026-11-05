"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cerrarSesionesDe, hashContrasena, requerirSesion, type Sesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { NOMBRE_ROL, PERMISOS, PLANTILLAS, type Permiso, type Rol } from "@/lib/permisos";
import { puedeManejar } from "@/lib/puestos";
import { texto } from "@/lib/volver";

export type EstadoPuesto = { ok?: boolean; error?: string; mensaje?: string; n?: number; conUsuarios?: number };

function leer(form: FormData) {
  const nombre = texto(form, "nombre", 40).replace(/\s+/g, " ");
  const descripcion = texto(form, "descripcion", 140);
  const base = texto(form, "plantilla");
  const plantilla: Rol = PLANTILLAS.includes(base as Rol) ? (base as Rol) : "duena";
  const permisos = [...new Set(form.getAll("permisos").map(String).filter((p) => p in PERMISOS))] as Permiso[];
  return { nombre, descripcion, plantilla, permisos };
}

export async function guardarPuesto(_: EstadoPuesto, form: FormData): Promise<EstadoPuesto> {
  const s = await requerirSesion("usuarios.editar");
  const id = texto(form, "id", 40);
  const { nombre, descripcion, plantilla, permisos } = leer(form);
  if (nombre.length < 2) return { error: "Escribe el nombre del puesto." };
  if (PLANTILLAS.some((r) => NOMBRE_ROL[r].toLowerCase() === nombre.toLowerCase())) return { error: "Ese nombre ya lo usa una plantilla. Elige otro." };
  if (!(puedeManejar(s, permisos))) return { error: "No puedes dar permisos que tú no tienes." };
  const [igual] = await db.select().from(schema.puestos).where(and(eq(schema.puestos.barberiaId, s.barberia.id), eq(schema.puestos.nombre, nombre))).limit(1);
  if (igual && igual.id !== id) return { error: "Ya hay un puesto con ese nombre." };
  if (id) {
    const [antes] = await db.select().from(schema.puestos).where(and(eq(schema.puestos.id, id), eq(schema.puestos.barberiaId, s.barberia.id))).limit(1);
    if (!antes) return { error: "No se encontró el puesto." };
    if (!(puedeManejar(s, antes.permisos))) return { error: "No puedes cambiar ese puesto." };
    await db.transaction(async (tx) => {
      await tx.update(schema.puestos).set({ nombre, descripcion, permisos }).where(eq(schema.puestos.id, id));
      await registrar(tx, {
        barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} cambió el puesto ${antes.nombre}`,
        detalle: { antes: `${antes.nombre}: ${antes.permisos.length} permisos`, ahora: `${nombre}: ${permisos.length} permisos` },
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Puesto ${nombre} guardado.`, n: Date.now() };
  }
  await db.transaction(async (tx) => {
    await tx.insert(schema.puestos).values({ barberiaId: s.barberia.id, nombre, descripcion, plantilla, permisos });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} creó el puesto ${nombre}`, detalle: { permisos: permisos.length } });
  });
  revalidatePath("/ajustes");
  return { ok: true, mensaje: `Puesto ${nombre} creado.`, n: Date.now() };
}

async function puestoMio(s: Sesion, id: string) {
  const [p] = await db.select().from(schema.puestos).where(and(eq(schema.puestos.id, String(id)), eq(schema.puestos.barberiaId, s.barberia.id))).limit(1);
  return p && (puedeManejar(s, p.permisos)) ? p : null;
}

/** Desactivar un puesto deja sin acceso a quienes lo tienen; sus datos se conservan. */
export async function alternarPuesto(id: string): Promise<EstadoPuesto> {
  const s = await requerirSesion("usuarios.editar");
  const p = await puestoMio(s, id);
  if (!p) return { error: "No se encontró el puesto." };
  const gente = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.puestoId, p.id));
  await db.transaction(async (tx) => {
    await tx.update(schema.puestos).set({ activo: !p.activo }).where(eq(schema.puestos.id, p.id));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} ${p.activo ? "desactivó" : "reactivó"} el puesto ${p.nombre}`,
      detalle: { antes: p.activo ? "Activo" : "Desactivado", ahora: p.activo ? "Desactivado" : "Activo", usuarios: gente.length },
    });
  });
  if (p.activo) for (const g of gente) await cerrarSesionesDe(g.id);
  revalidatePath("/", "layout");
  return { ok: true, mensaje: p.activo ? `${p.nombre} se desactivó. ${gente.length ? "Quienes lo tienen ya no pueden entrar." : ""}` : `${p.nombre} está activo otra vez.`, n: Date.now() };
}

/**
 * Eliminar un puesto. Sin usuarios, se borra. Con usuarios, primero hay que desactivarlo;
 * al confirmar la eliminación definitiva, sus usuarios quedan en los registros como "Usuario eliminado".
 */
export async function eliminarPuesto(id: string, definitivo = false): Promise<EstadoPuesto> {
  const s = await requerirSesion("usuarios.editar");
  const p = await puestoMio(s, id);
  if (!p) return { error: "No se encontró el puesto." };
  const gente = await db.select().from(schema.usuarios).where(eq(schema.usuarios.puestoId, p.id));
  if (gente.length && p.activo) return { error: "Primero desactiva el puesto: así sus usuarios dejan de tener acceso.", conUsuarios: gente.length };
  if (gente.length && !definitivo) return { conUsuarios: gente.length, n: Date.now() };
  const ahora = new Date();
  await db.transaction(async (tx) => {
    for (const u of gente) {
      await tx.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, u.id));
      await tx.delete(schema.solicitudesClave).where(eq(schema.solicitudesClave.usuarioId, u.id));
      await tx.update(schema.reglasComision).set({ vigenteHasta: ahora }).where(and(eq(schema.reglasComision.barberoId, u.id), isNull(schema.reglasComision.vigenteHasta)));
      // Sus ventas y movimientos se quedan para que las cuentas cuadren, a nombre de "Usuario eliminado".
      await tx.update(schema.usuarios).set({
        nombre: "Usuario eliminado", usuario: `BORRADO-${u.id.slice(0, 8).toUpperCase()}`, hash: await hashContrasena(randomUUID()), puestoId: null,
        activo: false, avatar: "iniciales", permisosExtra: [], permisosQuitados: [], metaSemanal: 0, claveTemporal: null, claveTemporalExpira: null, debeCambiar: false,
      }).where(eq(schema.usuarios.id, u.id));
    }
    await tx.delete(schema.puestos).where(eq(schema.puestos.id, p.id));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} eliminó el puesto ${p.nombre}`,
      detalle: { usuarios: gente.map((u) => u.nombre).join(", ") || "ninguno", datosBorrados: gente.length > 0 },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: gente.length ? `${p.nombre} se eliminó. Sus ${gente.length} usuarios quedan como "Usuario eliminado".` : `${p.nombre} se eliminó.`, n: Date.now() };
}
