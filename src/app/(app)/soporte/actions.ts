"use server";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema as t } from "@/lib/db";

export type EstadoLimpieza = { ok?: boolean; error?: string; resumen?: string };

/**
 * Deja el negocio como recién instalado: borra ventas, cobros, cortes, egresos, pagos al equipo, ideas e historial,
 * y las cuentas que ya estaban eliminadas. Conserva la configuración (servicios, precios, formas de pago, ajustes),
 * las cuentas activas y los meses que se capturaron del Excel. Solo la cuenta de soporte puede hacerlo.
 */
export async function limpiarDatosDePrueba(_: EstadoLimpieza, form: FormData): Promise<EstadoLimpieza> {
  const s = await requerirSesion();
  if (!s.usuario.esSoporte) return { error: "Esta herramienta es solo para la cuenta de soporte." };
  if (String(form.get("confirmar") ?? "").trim().toUpperCase() !== "BORRAR") return { error: "Escribe BORRAR para confirmar." };
  const b = s.barberia.id;
  const cuenta = async (tabla: typeof t.ventas | typeof t.gastos | typeof t.turnosCaja) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(tabla).where(eq(tabla.barberiaId, b)))[0].n;
  const [ventas, gastos, cortes] = await Promise.all([cuenta(t.ventas), cuenta(t.gastos), cuenta(t.turnosCaja)]);
  await db.transaction(async (tx) => {
    // Permite borrar ventas e historial solo dentro de esta transacción.
    await tx.execute(sql`select set_config('crabs.limpieza', 'si', true)`);
    await tx.delete(t.comprobantes).where(eq(t.comprobantes.barberiaId, b));
    await tx.delete(t.gastos).where(eq(t.gastos.barberiaId, b));
    await tx.delete(t.propinas).where(eq(t.propinas.barberiaId, b));
    await tx.delete(t.pagos).where(eq(t.pagos.barberiaId, b));
    await tx.delete(t.conceptos).where(eq(t.conceptos.barberiaId, b));
    await tx.delete(t.movimientosCaja).where(eq(t.movimientosCaja.barberiaId, b));
    await tx.delete(t.ventas).where(eq(t.ventas.barberiaId, b));
    await tx.delete(t.ajustesCierre).where(eq(t.ajustesCierre.barberiaId, b));
    await tx.delete(t.turnosCaja).where(eq(t.turnosCaja.barberiaId, b));
    await tx.delete(t.pagosComision).where(eq(t.pagosComision.barberiaId, b));
    await tx.delete(t.ideas).where(eq(t.ideas.barberiaId, b));
    await tx.delete(t.solicitudesClave).where(eq(t.solicitudesClave.barberiaId, b));
    await tx.delete(t.historial).where(eq(t.historial.barberiaId, b));
    // Cuentas que ya se habían eliminado ("Persona eliminada"): sin movimientos, ya no hace falta conservarlas.
    const borradas = await tx.select({ id: t.usuarios.id }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, b), like(t.usuarios.usuario, "BORRADO-%")));
    if (borradas.length) {
      const ids = borradas.map((x) => x.id);
      await tx.delete(t.sesiones).where(inArray(t.sesiones.usuarioId, ids));
      await tx.delete(t.reglasComision).where(inArray(t.reglasComision.barberoId, ids));
      await tx.delete(t.usuarios).where(inArray(t.usuarios.id, ids));
    }
    await tx.update(t.barberias).set({ siguienteFolio: 1 }).where(eq(t.barberias.id, b));
  });
  revalidatePath("/", "layout");
  return { ok: true, resumen: `Se borraron ${ventas} ventas, ${gastos} egresos y ${cortes} cortes de caja. Los folios empiezan otra vez en 1.` };
}
