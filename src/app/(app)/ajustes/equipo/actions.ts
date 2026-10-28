"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { describirRegla } from "@/lib/comisiones";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

const R = "/ajustes/equipo";
const TIPOS = ["porcentaje", "fijo", "renta", "sueldo", "mixto"] as const;

/** Guarda una forma de pago. La anterior deja de aplicar desde ahora; lo ya cobrado conserva su regla. */
export async function guardarRegla(form: FormData) {
  const s = await requerirSesion("ajustes.usuarios");
  const barberoId = texto(form, "barberoId", 40);
  const servicioId = texto(form, "servicioId", 40) || null;
  const tipo = texto(form, "tipo") as (typeof TIPOS)[number];
  if (!TIPOS.includes(tipo)) volver(R, { error: "Elige una forma de pago." });
  const pct = Number(texto(form, "porcentaje", 6) || "0");
  const fijo = leerPesos(texto(form, "montoFijo")) ?? 0;
  const semanal = leerPesos(texto(form, "montoSemanal")) ?? 0;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) volver(R, { error: "El porcentaje va de 0 a 100." });
  if ((tipo === "porcentaje" || tipo === "mixto") && pct <= 0) volver(R, { error: "Escribe el porcentaje." });
  if (tipo === "fijo" && fijo <= 0) volver(R, { error: "Escribe cuánto gana por servicio." });
  if ((tipo === "renta" || tipo === "sueldo" || tipo === "mixto") && semanal <= 0) volver(R, { error: "Escribe el monto semanal." });
  if (servicioId && (tipo === "renta" || tipo === "sueldo" || tipo === "mixto")) volver(R, { error: "Para un servicio en particular solo aplica porcentaje o monto fijo." });
  if (tipo === "mixto" && pct >= 100) volver(R, { error: "El porcentaje va de 1 a 99." });

  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, barberoId), eq(schema.usuarios.barberiaId, s.barberia.id))).limit(1);
  if (!u) volver(R, { error: "No se encontró a esa persona." });
  if (servicioId) {
    const [sv] = await db.select().from(schema.servicios).where(and(eq(schema.servicios.id, servicioId), eq(schema.servicios.barberiaId, s.barberia.id))).limit(1);
    if (!sv) volver(R, { error: "No se encontró ese servicio." });
  }
  const regla = { tipo, porcentaje: tipo === "porcentaje" || tipo === "mixto" ? Math.round(pct * 100) : 0, montoFijo: tipo === "fijo" ? fijo : 0, montoSemanal: ["renta", "sueldo", "mixto"].includes(tipo) ? semanal : 0 };
  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schema.reglasComision).set({ vigenteHasta: ahora }).where(and(
      eq(schema.reglasComision.barberiaId, s.barberia.id), eq(schema.reglasComision.barberoId, u.id), isNull(schema.reglasComision.vigenteHasta),
      servicioId ? eq(schema.reglasComision.servicioId, servicioId) : isNull(schema.reglasComision.servicioId),
    ));
    await tx.insert(schema.reglasComision).values({ barberiaId: s.barberia.id, barberoId: u.id, servicioId, ...regla, vigenteDesde: ahora });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo", accion: `${s.usuario.nombre} cambió la forma de pago de ${u.nombre}: ${describirRegla(regla, formatoDinero)}${servicioId ? " (un servicio)" : ""}` });
  });
  revalidatePath(R);
  volver(R, { aviso: "guardado" });
}

export async function quitarRegla(form: FormData) {
  const s = await requerirSesion("ajustes.usuarios");
  const id = texto(form, "id", 40);
  await db.update(schema.reglasComision).set({ vigenteHasta: new Date() })
    .where(and(eq(schema.reglasComision.id, id), eq(schema.reglasComision.barberiaId, s.barberia.id), isNull(schema.reglasComision.vigenteHasta)));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo", accion: `${s.usuario.nombre} quitó una regla de pago por servicio` });
  revalidatePath(R);
  volver(R, { aviso: "guardado" });
}
