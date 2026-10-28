"use server";

import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";

export async function decidirIdea(clave: string, titulo: string, aprobada: boolean) {
  const s = await requerirSesion("ideas.decidir");
  const c = String(clave).slice(0, 120), t = String(titulo).slice(0, 200);
  if (!c || !t) return;
  const estado = aprobada ? "aprobada" : "descartada";
  await db.transaction(async (tx) => {
    await tx.insert(schema.ideas)
      .values({ barberiaId: s.barberia.id, clave: c, titulo: t, estado, usuarioId: s.usuario.id })
      .onConflictDoUpdate({ target: [schema.ideas.barberiaId, schema.ideas.clave], set: { estado, usuarioId: s.usuario.id, creadoEn: new Date() } });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "idea", accion: `${s.usuario.nombre} marcó ${aprobada ? "que le interesa" : "como ahora no"} la idea: ${t}` });
  });
}
