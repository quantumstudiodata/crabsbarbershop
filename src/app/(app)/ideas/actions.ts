"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { texto, volver } from "@/lib/volver";

export async function decidirIdea(form: FormData) {
  const s = await requerirSesion("ideas.decidir");
  const clave = texto(form, "clave", 120);
  const titulo = texto(form, "titulo", 200);
  const estado = texto(form, "estado") === "aprobada" ? "aprobada" : "descartada";
  const nota = texto(form, "nota", 300);
  if (!clave || !titulo) volver("/ideas", { error: "No se pudo guardar la decisión." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.ideas)
      .values({ barberiaId: s.barberia.id, clave, titulo, estado, nota, usuarioId: s.usuario.id })
      .onConflictDoUpdate({ target: [schema.ideas.barberiaId, schema.ideas.clave], set: { estado, nota, usuarioId: s.usuario.id, creadoEn: new Date() } });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "idea", accion: `${s.usuario.nombre} ${estado === "aprobada" ? "aprobó" : "descartó"} la idea: ${titulo}`, detalle: { nota } });
  });
  revalidatePath("/ideas");
  volver("/ideas", { aviso: "guardado" });
}
