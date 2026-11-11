"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { esFechaValida } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

export async function registrarPago(form: FormData) {
  const s = await requerirSesion("equipo.pagar");
  const barberoId = texto(form, "barberoId", 40);
  const semanaTxt = texto(form, "semana", 10);
  const tipo = texto(form, "tipo") === "renta" ? "renta" : "pago";
  // Puede pagarse con una o dos formas de pago; cada una queda como un pago con su forma en la nota.
  const FORMAS: Record<string, string> = { efectivo: "Efectivo de caja", transferencia: "Transferencia", otro: "Otro" };
  const partes = [1, 2].map((i) => ({ monto: leerPesos(texto(form, i === 1 ? "monto" : "monto2")), forma: FORMAS[texto(form, i === 1 ? "forma" : "forma2")] ?? "" }))
    .filter((x) => x.monto && x.monto > 0) as { monto: number; forma: string }[];
  const monto = partes.reduce((a, x) => a + x.monto, 0);
  const nota = texto(form, "nota", 200);
  // La fecha con la que se agrupa el pago: el lunes de la semana (Ventas) o el cierre del periodo (Equipo).
  const semana = esFechaValida(semanaTxt) ? semanaTxt : null;
  const reg = texto(form, "regreso", 200);
  const ruta = reg.startsWith("/analitica/ventas") || reg.startsWith("/equipo") ? reg : "/analitica/ventas";
  if (!semana || !monto) volver(ruta, { error: "Escribe el monto." });
  const [u] = await db.select().from(schema.usuarios)
    .where(and(eq(schema.usuarios.id, barberoId), eq(schema.usuarios.barberiaId, s.barberia.id))).limit(1);
  if (!u) volver(ruta, { error: "No se encontró a esa persona." });
  await db.transaction(async (tx) => {
    for (const x of partes) {
      const n = [x.forma, nota].filter(Boolean).join(": ");
      await tx.insert(schema.pagosComision).values({ barberiaId: s.barberia.id, barberoId: u.id, tipo, monto: x.monto, semana: semana!, nota: n.slice(0, 200), usuarioId: s.usuario.id });
    }
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: tipo === "pago" ? `${s.usuario.nombre} registró un pago de ${formatoDinero(monto)} a ${u.nombre}` : `Se registró que ${u.nombre} pagó ${formatoDinero(monto)} de renta de silla`,
      detalle: { semana, nota, formas: partes.map((x) => `${x.forma || "Sin forma"} ${formatoDinero(x.monto)}`).join(" y ") },
    });
  });
  revalidatePath("/analitica/ventas");
  revalidatePath("/equipo", "layout");
  volver(ruta, { aviso: "guardado" });
}

/**
 * Anula un pago al equipo o un cobro de renta (por ejemplo, una renta automática que la persona no pagó).
 * No se borra: queda en cero con la nota de lo que era, para que el historial lo conserve y el pago automático no se repita.
 * Lo anulado vuelve a contar como pendiente.
 */
export async function anularPagoEquipo(id: string, motivo: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await requerirSesion("equipo.pagar");
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return { error: "Pago no encontrado." };
  const m = String(motivo ?? "").trim().slice(0, 120);
  if (!m) return { error: "Escribe el motivo." };
  const [p] = await db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.id, id), eq(schema.pagosComision.barberiaId, s.barberia.id))).limit(1);
  if (!p) return { error: "Pago no encontrado." };
  if (p.monto === 0) return { error: "Este pago ya está anulado." };
  const [u] = await db.select({ nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.id, p.barberoId)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(schema.pagosComision).set({ monto: 0, nota: `${p.nota} (anulado: ${m}; era ${formatoDinero(p.monto)})`.slice(0, 200) }).where(eq(schema.pagosComision.id, p.id));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: `${s.usuario.nombre} anuló ${p.tipo === "renta" ? "el cobro de renta" : "el pago"} de ${formatoDinero(p.monto)} de ${u?.nombre ?? "una persona"}`,
      detalle: { motivo: m, nota: p.nota },
    });
  });
  revalidatePath("/equipo", "layout");
  revalidatePath("/analitica", "layout");
  return { ok: true };
}
