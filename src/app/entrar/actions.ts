"use server";

import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BLOQUEO_MS, INTENTOS_MAXIMOS, crearSesion, hashContrasena, verificarContrasena } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";

export type EstadoEntrada = { error?: string };

// Hash de relleno para que el tiempo de respuesta no revele si el usuario existe.
let relleno: Promise<string> | null = null;

export async function entrar(_: EstadoEntrada, form: FormData): Promise<EstadoEntrada> {
  const usuario = String(form.get("usuario") ?? "").trim().toUpperCase();
  const contrasena = String(form.get("contrasena") ?? "");
  if (!usuario || !contrasena) return { error: "Escribe tu usuario y tu contraseña." };

  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
  if (!u) {
    relleno ??= hashContrasena("relleno-crabs");
    await verificarContrasena(contrasena, await relleno);
    return { error: "El usuario o la contraseña no coinciden." };
  }
  if (!u.activo) return { error: "Este usuario está desactivado. Pide ayuda al propietario." };
  const [negocio] = await db.select({ estado: schema.barberias.estadoCuenta }).from(schema.barberias).where(eq(schema.barberias.id, u.barberiaId)).limit(1);
  if (negocio?.estado !== "activa") return { error: "La cuenta de este negocio está suspendida. Comunícate con soporte." };
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    const min = Math.ceil((u.bloqueadoHasta.getTime() - Date.now()) / 60000);
    return { error: `Demasiados intentos. Vuelve a intentar en ${min} minutos o usa ¿Olvidaste tu contraseña?` };
  }
  if (!(await verificarContrasena(contrasena, u.hash))) {
    const intentos = u.intentosFallidos + 1;
    const bloquear = intentos >= INTENTOS_MAXIMOS;
    await db
      .update(schema.usuarios)
      .set({ intentosFallidos: bloquear ? 0 : intentos, bloqueadoHasta: bloquear ? new Date(Date.now() + BLOQUEO_MS) : null })
      .where(eq(schema.usuarios.id, u.id));
    if (bloquear) {
      await registrar(db, { barberiaId: u.barberiaId, usuarioId: u.id, tipo: "acceso", accion: `Se bloqueó el usuario ${u.usuario} por intentos fallidos` });
      return { error: "Demasiados intentos. El usuario quedó bloqueado 15 minutos." };
    }
    return { error: `El usuario o la contraseña no coinciden. Te quedan ${INTENTOS_MAXIMOS - intentos} intentos.` };
  }
  await db
    .update(schema.usuarios)
    .set({ intentosFallidos: 0, bloqueadoHasta: sql`null` })
    .where(eq(schema.usuarios.id, u.id));
  await crearSesion(u.id);
  redirect(u.debeCambiar ? "/cambiar-contrasena" : "/");
}

/**
 * Pide al propietario que restablezca la contraseña. Siempre responde igual,
 * exista o no el usuario, para no revelar quién tiene cuenta.
 */
export async function solicitarRestablecer(usuarioTxt: string): Promise<{ ok: true }> {
  const usuario = String(usuarioTxt ?? "").trim().toUpperCase().slice(0, 40);
  if (!usuario) return { ok: true };
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
  if (!u || !u.activo) return { ok: true };
  const [pendiente] = await db.select({ id: schema.solicitudesClave.id }).from(schema.solicitudesClave)
    .where(and(eq(schema.solicitudesClave.usuarioId, u.id), eq(schema.solicitudesClave.atendida, false))).limit(1);
  if (pendiente) return { ok: true };
  await db.transaction(async (tx) => {
    await tx.insert(schema.solicitudesClave).values({ barberiaId: u.barberiaId, usuarioId: u.id });
    await registrar(tx, { barberiaId: u.barberiaId, usuarioId: u.id, tipo: "usuario", accion: `${u.nombre} pidió restablecer su contraseña` });
  });
  return { ok: true };
}
