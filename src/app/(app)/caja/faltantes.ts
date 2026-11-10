"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLarga } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { cobradoresDe, repartir } from "@/lib/faltantes";

export type ReglaFaltante = "abrio" | "iguales" | "proporcional" | "manual" | "negocio";



/** La encargada decide quién cubre el faltante de un corte. Queda en revisión hasta que se autorice; solo entonces se descuenta. */
export async function asignarFaltante(d: { turnoId: string; regla: ReglaFaltante; manual?: Record<string, string> }): Promise<{ error?: string; mensaje?: string }> {
  const s = await requerirSesion("caja.corregir");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const b = s.barberia.id;
  const [t] = await db.select().from(schema.turnosCaja).where(and(eq(schema.turnosCaja.id, d.turnoId), eq(schema.turnosCaja.barberiaId, b))).limit(1);
  if (!t || t.estado !== "cerrado") return { error: "No se encontró ese corte." };
  const faltante = -(t.diferencia ?? 0);
  if (faltante <= 0) return { error: "Ese corte no tiene faltante." };
  if (t.faltanteRegla) return { error: "El faltante de ese corte ya se asignó." };
  const cobradores = await cobradoresDe(b, t.id);
  let partes: { id: string; monto: number }[] = [];
  if (d.regla === "abrio") partes = [{ id: t.abiertoPor, monto: faltante }];
  else if (d.regla === "iguales") {
    if (!cobradores.length) return { error: "En ese turno nadie cobró. Elige otra opción." };
    const m = repartir(faltante, cobradores.map(() => 1));
    partes = cobradores.map((c, i) => ({ id: c.id, monto: m[i] }));
  } else if (d.regla === "proporcional") {
    const conEfectivo = cobradores.filter((c) => c.efectivo > 0);
    if (!conEfectivo.length) return { error: "En ese turno nadie cobró en efectivo. Elige otra opción." };
    const m = repartir(faltante, conEfectivo.map((c) => c.efectivo));
    partes = conEfectivo.map((c, i) => ({ id: c.id, monto: m[i] }));
  } else if (d.regla === "manual") {
    const equipo = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, b));
    for (const [id, txt] of Object.entries(d.manual ?? {})) {
      const m = leerPesos(txt);
      if (m === null || m === 0) continue;
      if (m < 0 || !equipo.some((e) => e.id === id)) return { error: "Revisa las cantidades." };
      partes.push({ id, monto: m });
    }
    const suma = partes.reduce((a, x) => a + x.monto, 0);
    if (suma !== faltante) return { error: `Las cantidades suman ${formatoDinero(suma)} y el faltante es de ${formatoDinero(faltante)}.` };
  } else if (d.regla !== "negocio") return { error: "Elige una opción." };
  partes = partes.filter((x) => x.monto > 0);

  const nombres = new Map((await db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, b))).map((u) => [u.id, u.nombre.split(" ")[0]]));
  const ok = await db.transaction(async (tx) => {
    const f = await tx.update(schema.turnosCaja).set({ faltanteRegla: d.regla, revisadoPor: s.usuario.id, revisadoEn: new Date() })
      .where(and(eq(schema.turnosCaja.id, t.id), sql`${schema.turnosCaja.faltanteRegla} is null`)).returning({ id: schema.turnosCaja.id });
    if (!f.length) return false;
    if (partes.length) await tx.insert(schema.faltantesCaja).values(partes.map((x) => ({ barberiaId: b, turnoId: t.id, usuarioId: x.id, monto: x.monto, regla: d.regla, fecha: t.fechaOperativa, asignadoPor: s.usuario.id, estado: "revision" })));
    await registrar(tx, {
      barberiaId: b, usuarioId: s.usuario.id, tipo: "caja",
      accion: d.regla === "negocio"
        ? `${s.usuario.nombre} decidió que el negocio absorbe el faltante de ${formatoDinero(faltante)} del corte del ${fechaLarga(t.fechaOperativa).toLowerCase()}`
        : `${s.usuario.nombre} asignó el faltante de ${formatoDinero(faltante)} del corte del ${fechaLarga(t.fechaOperativa).toLowerCase()}: ${partes.map((x) => `${nombres.get(x.id)} ${formatoDinero(x.monto)}`).join(", ")}`,
      detalle: { regla: d.regla },
    });
    return true;
  });
  if (!ok) return { error: "El faltante de ese corte ya se asignó." };
  revalidatePath("/", "layout");
  return { mensaje: d.regla === "negocio" ? "Listo. El negocio absorbe el faltante." : "Faltante asignado. Queda en revisión: solo se descuenta si se autoriza en Equipo, Pagos." };
}

