"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { hashContrasena, obtenerSesion, verificarContrasena } from "@/lib/auth";
import { problemaContrasena } from "@/lib/cuentas";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";

export type EstadoCambio = { error?: string; ok?: boolean };

export async function cambiarContrasena(_: EstadoCambio, form: FormData): Promise<EstadoCambio> {
  const s = await obtenerSesion();
  if (!s) redirect("/entrar");
  const actual = String(form.get("actual") ?? "");
  const nueva = String(form.get("nueva") ?? "");
  const repetir = String(form.get("repetir") ?? "");
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, s.usuario.id)).limit(1);
  if (!u || !(await verificarContrasena(actual, u.hash))) return { error: "La contraseña actual no coincide." };
  if (nueva !== repetir) return { error: "Las dos contraseñas nuevas no son iguales." };
  if (nueva === actual) return { error: "La nueva contraseña debe ser diferente a la actual." };
  const problema = problemaContrasena(nueva, u.usuario);
  if (problema) return { error: problema };
  await db.update(schema.usuarios).set({ hash: await hashContrasena(nueva), debeCambiar: false, claveTemporal: null, claveTemporalExpira: null }).where(eq(schema.usuarios.id, u.id));
  await registrar(db, { barberiaId: u.barberiaId, usuarioId: u.id, tipo: "acceso", accion: `${u.nombre} cambió su contraseña` });
  // Desde la ventana emergente no se cambia de página.
  if (form.get("modal") === "si") return { ok: true };
  redirect("/?aviso=contrasena");
}
