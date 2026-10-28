"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { esFechaValida, lunesDe } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

export async function registrarPago(form: FormData) {
  const s = await requerirSesion("equipo.pagar");
  const barberoId = texto(form, "barberoId", 40);
  const semanaTxt = texto(form, "semana", 10);
  const tipo = texto(form, "tipo") === "renta" ? "renta" : "pago";
  const monto = leerPesos(texto(form, "monto"));
  const nota = texto(form, "nota", 200);
  const semana = esFechaValida(semanaTxt) ? lunesDe(semanaTxt) : null;
  const ruta = `/analitica/equipo?semana=${semana ?? ""}`;
  if (!semana || !monto) volver(ruta, { error: "Escribe el monto." });
  const [u] = await db.select().from(schema.usuarios)
    .where(and(eq(schema.usuarios.id, barberoId), eq(schema.usuarios.barberiaId, s.barberia.id))).limit(1);
  if (!u) volver(ruta, { error: "No se encontró a esa persona." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.pagosComision).values({ barberiaId: s.barberia.id, barberoId: u.id, tipo, monto, semana, nota, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: tipo === "pago" ? `${s.usuario.nombre} registró un pago de ${formatoDinero(monto)} a ${u.nombre}` : `Se registró que ${u.nombre} pagó ${formatoDinero(monto)} de renta de silla`,
      detalle: { semana, nota },
    });
  });
  revalidatePath("/analitica/equipo");
  volver(ruta, { aviso: "guardado" });
}
