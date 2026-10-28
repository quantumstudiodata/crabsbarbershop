"use server";

import { eq, sql } from "drizzle-orm";
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
  if (!u.activo) return { error: "Este usuario está desactivado. Pide ayuda a la dueña." };
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    const min = Math.ceil((u.bloqueadoHasta.getTime() - Date.now()) / 60000);
    return { error: `Demasiados intentos. Vuelve a intentar en ${min} minutos o pide a la dueña que restablezca tu contraseña.` };
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
