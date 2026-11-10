"use server";

import { db, schema } from "@/lib/db";
import { ventaDeEncuesta } from "./datos";

export type EstadoEncuesta = { ok?: boolean; error?: string };

/** Guarda la calificación del cliente. Una sola vez por venta; se atribuye a quien lo atendió. */
export async function enviarEncuesta(_: EstadoEncuesta, form: FormData): Promise<EstadoEncuesta> {
  const token = String(form.get("token") ?? "");
  const calificacion = Number(form.get("calificacion"));
  const comentario = String(form.get("comentario") ?? "").trim().slice(0, 600);
  const cliente = String(form.get("cliente") ?? "").trim().slice(0, 60);
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) return { error: "Elige de una a cinco estrellas." };
  const v = await ventaDeEncuesta(token);
  if (!v) return { error: "Esta encuesta ya no está disponible." };
  if (v.contestada) return { ok: true };
  try {
    await db.insert(schema.resenas).values({ barberiaId: v.barberiaId, ventaId: v.id, barberoId: v.barberoId, calificacion, comentario, cliente });
  } catch {
    // Si se envió dos veces, la primera ya quedó guardada.
  }
  return { ok: true };
}
