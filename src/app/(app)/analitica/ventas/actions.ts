"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { formatoDinero } from "@/lib/money";
import { texto, volver } from "@/lib/volver";



/**
 * Cancela una venta sin borrarla. Si su caja ya cerró, el efectivo se devuelve desde la caja abierta.
 * Quien no tiene permiso de cancelar puede corregir su propio cobro durante los primeros 10 minutos, con la caja abierta.
 */
export async function cancelarVenta(form: FormData) {
  const s = await requerirSesion();
  const ventaId = texto(form, "ventaId", 40);
  const motivo = texto(form, "motivo", 300);
  const r = texto(form, "regreso", 200);
  const regreso = r.startsWith("/analitica/ventas") || r.startsWith("/mis-ventas") ? r : "/analitica/ventas";
  if (!motivo) volver(regreso, { error: "Escribe el motivo de la cancelación." });
  const [v] = await db.select({ venta: schema.ventas, turno: schema.turnosCaja }).from(schema.ventas)
    .innerJoin(schema.turnosCaja, eq(schema.turnosCaja.id, schema.ventas.turnoId))
    .where(and(eq(schema.ventas.id, ventaId), eq(schema.ventas.barberiaId, s.barberia.id))).limit(1);
  if (!v) volver(regreso, { error: "No se encontró esa venta." });
  if (v.venta.estado === "cancelada") volver(regreso, { error: "Esa venta ya estaba cancelada." });
  if (!s.puede("ventas.cancelar")) {
    const reciente = Date.now() - v.venta.creadoEn.getTime() <= MINUTOS_CORRECCION * 60000;
    if (v.venta.registradaPor !== s.usuario.id || !reciente || v.turno.estado !== "abierto") {
      volver(regreso, { error: `Solo puedes corregir tus cobros de los últimos ${MINUTOS_CORRECCION} minutos. Pide al encargado que la cancele.` });
    }
  }

  let devolucion = 0;
  let turnoActualId: string | null = null;
  if (v.turno.estado === "cerrado") {
    const pagosVenta = await db.select().from(schema.pagos).where(eq(schema.pagos.ventaId, v.venta.id));
    const propinasVenta = await db.select().from(schema.propinas).where(eq(schema.propinas.ventaId, v.venta.id));
    devolucion = pagosVenta.filter((p) => p.esEfectivo).reduce((a, p) => a + p.monto, 0) + propinasVenta.filter((p) => p.esEfectivo).reduce((a, p) => a + p.monto, 0);
    if (devolucion > 0) {
      const t = await turnoAbierto(s.barberia.id);
      if (!t) volver(regreso, { error: "Esa venta es de una caja ya cerrada. Abre la caja para registrar la devolución del efectivo." });
      turnoActualId = t.id;
    }
  }

  await db.transaction(async (tx) => {
    const filas = await tx.update(schema.ventas)
      .set({ estado: "cancelada", motivoCancelacion: motivo, canceladaPor: s.usuario.id, canceladaEn: new Date() })
      .where(and(eq(schema.ventas.id, v.venta.id), eq(schema.ventas.estado, "pagada")))
      .returning({ id: schema.ventas.id });
    if (filas.length === 0) return;
    if (turnoActualId && devolucion > 0) {
      await tx.insert(schema.movimientosCaja).values({
        barberiaId: s.barberia.id, turnoId: turnoActualId, tipo: "devolucion", monto: devolucion,
        concepto: `Devolución de la venta ${v.venta.folio}`, ventaId: v.venta.id, usuarioId: s.usuario.id,
      });
    }
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "venta",
      accion: `${s.usuario.nombre} canceló la venta ${v.venta.folio}`,
      detalle: { motivo, total: v.venta.total, devolucionEfectivo: devolucion || undefined, total_texto: formatoDinero(v.venta.total) },
    });
  });
  revalidatePath("/", "layout");
  volver(regreso, { aviso: "cancelada" });
}
