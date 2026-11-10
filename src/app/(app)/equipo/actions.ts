"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

/** Autoriza o descarta un faltante en revisión. Solo lo autorizado se resta del pago de la persona. */
export async function decidirFaltante(form: FormData) {
  const s = await requerirSesion("equipo.autorizar");
  if (s.vista) volver("/equipo/pagos", { error: "En la vista previa no se guardan cambios." });
  const id = texto(form, "id", 40);
  const decision = texto(form, "decision") === "autorizar" ? "autorizado" : "descartado";
  const nota = texto(form, "nota", 200);
  const [f] = await db.select({ id: schema.faltantesCaja.id, monto: schema.faltantesCaja.monto, estado: schema.faltantesCaja.estado, nombre: schema.usuarios.nombre })
    .from(schema.faltantesCaja).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.faltantesCaja.usuarioId))
    .where(and(eq(schema.faltantesCaja.id, id), eq(schema.faltantesCaja.barberiaId, s.barberia.id))).limit(1);
  if (!f || f.estado !== "revision") volver("/equipo/pagos", { error: "Ese faltante ya se revisó." });
  await db.transaction(async (tx) => {
    await tx.update(schema.faltantesCaja).set({ estado: decision, autorizadoPor: s.usuario.id, autorizadoEn: new Date(), nota })
      .where(and(eq(schema.faltantesCaja.id, f.id), eq(schema.faltantesCaja.estado, "revision")));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: decision === "autorizado"
        ? `${s.usuario.nombre} autorizó descontar a ${f.nombre} un faltante de ${formatoDinero(f.monto)}`
        : `${s.usuario.nombre} descartó el faltante de ${formatoDinero(f.monto)} asignado a ${f.nombre}`,
      detalle: { nota: nota || undefined },
    });
  });
  revalidatePath("/", "layout");
  volver("/equipo/pagos", { aviso: "guardado" });
}

/** Responde una reseña. La respuesta queda visible para el equipo. */
export async function responderResena(form: FormData) {
  const s = await requerirSesion("resenas.responder");
  const regreso = texto(form, "regreso", 200).startsWith("/clientes/resenas") ? texto(form, "regreso", 200) : "/clientes/resenas";
  if (s.vista) volver(regreso, { error: "En la vista previa no se guardan cambios." });
  const id = texto(form, "id", 40);
  const respuesta = texto(form, "respuesta", 600);
  if (!respuesta) volver(regreso, { error: "Escribe la respuesta." });
  const r = await db.update(schema.resenas).set({ respuesta, respondidaPor: s.usuario.id, respondidaEn: new Date() })
    .where(and(eq(schema.resenas.id, id), eq(schema.resenas.barberiaId, s.barberia.id))).returning({ id: schema.resenas.id });
  if (!r.length) volver(regreso, { error: "No se encontró esa reseña." });
  revalidatePath("/clientes/resenas");
  volver(regreso, { aviso: "guardado" });
}
