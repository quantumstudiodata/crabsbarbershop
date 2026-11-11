"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { esAvatar } from "@/lib/avatares";
import { db, schema } from "@/lib/db";

export async function cambiarAvatar(avatar: string) {
  const s = await requerirSesion();
  if (!esAvatar(avatar)) return;
  await db.update(schema.usuarios).set({ avatar }).where(eq(schema.usuarios.id, s.usuario.id));
  revalidatePath("/", "layout");
}

/** Acciones rápidas de Inicio: cada persona elige el orden y cuáles oculta. Se guardan solo las claves conocidas. */
export async function guardarAccionesRapidas(orden: string[], ocultas: string[]): Promise<{ error?: string }> {
  const s = await requerirSesion();
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const valida = (x: unknown): x is string => typeof x === "string" && /^[a-z]{2,20}$/.test(x);
  const o = [...new Set((Array.isArray(orden) ? orden : []).filter(valida))].slice(0, 30);
  const h = [...new Set((Array.isArray(ocultas) ? ocultas : []).filter(valida))].filter((k) => k !== "cobrar").slice(0, 30);
  await db.update(schema.usuarios).set({ accionesRapidas: o.length || h.length ? { orden: o, ocultas: h } : null }).where(eq(schema.usuarios.id, s.usuario.id));
  revalidatePath("/");
  return {};
}
