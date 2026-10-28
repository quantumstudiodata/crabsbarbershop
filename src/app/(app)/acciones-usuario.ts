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
