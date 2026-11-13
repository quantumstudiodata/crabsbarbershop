import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { registrar } from "./historial";
import { formatoDinero } from "./money";

/** Días que una transferencia de reserva espera confirmación antes de darse por recibida sola. */
export const DIAS_TRANSFERENCIA = 4;

/**
 * Da por recibida una transferencia de reserva: suma lo transferido a lo pagado de la cita.
 * Se usa al confirmarla, al cobrar la cita (se da por hecha) y cuando pasan 4 días sin cambios.
 */
export async function darPorRecibida(barberiaId: string, citaId: string, como: { usuarioId: string | null; nombre: string; motivo: "manual" | "cobro" | "automatico" }) {
  const [c] = await db.select().from(schema.citas).where(and(eq(schema.citas.id, citaId), eq(schema.citas.barberiaId, barberiaId))).limit(1);
  if (!c || c.estadoPago !== "transferencia") return false;
  const pagado = Math.min(c.pagado + c.transferenciaMonto, c.total);
  await db.update(schema.citas).set({ pagado, transferenciaMonto: 0, estadoPago: pagado >= c.total ? "pagada" : "anticipo", metodoPago: "Transferencia", actualizadoEn: new Date() })
    .where(and(eq(schema.citas.id, c.id), eq(schema.citas.estadoPago, "transferencia")));
  const monto = formatoDinero(c.transferenciaMonto);
  await registrar(db, {
    barberiaId, usuarioId: como.usuarioId, tipo: "venta",
    accion: como.motivo === "automatico" ? `La transferencia de ${monto} de la cita ${c.folio} se confirmó sola (automático) a los ${DIAS_TRANSFERENCIA} días`
      : como.motivo === "cobro" ? `${como.nombre} cobró la cita ${c.folio} y se dio por recibida su transferencia de ${monto}`
      : `${como.nombre} confirmó la transferencia de ${monto} de la cita ${c.folio}`,
  });
  return true;
}

/** Transferencias de reservas con 4 días sin confirmarse: se dan por recibidas solas. */
export async function autoconfirmarTransferencias(barberiaId: string) {
  const viejas = await db.select({ id: schema.citas.id }).from(schema.citas)
    .where(and(eq(schema.citas.barberiaId, barberiaId), eq(schema.citas.estadoPago, "transferencia"), inArray(schema.citas.estado, ["en_espera", "llego", "en_atencion", "completada"]),
      lt(sql`coalesce(${schema.citas.transferenciaComprobanteEn}, ${schema.citas.creadoEn})`, new Date(Date.now() - DIAS_TRANSFERENCIA * 86400000))))
    .limit(20);
  for (const v of viejas) await darPorRecibida(barberiaId, v.id, { usuarioId: null, nombre: "", motivo: "automatico" }).catch(() => {});
}
