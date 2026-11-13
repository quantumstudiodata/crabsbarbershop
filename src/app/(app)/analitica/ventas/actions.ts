"use server";

import { reembolsarVenta } from "@/lib/pagos";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { copiaRegla, reglasDe, cajaDe } from "@/lib/datos";
import { comisionDeServicio, elegirRegla } from "@/lib/comisiones";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
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

  // Pagada en línea: el dinero se devuelve en Stripe desde aquí. Si el negocio no acepta reembolsos, solo la titular puede hacer la excepción.
  const enLinea = await db.select({ id: schema.pagosLinea.id }).from(schema.pagosLinea).where(and(eq(schema.pagosLinea.ventaId, v.venta.id), eq(schema.pagosLinea.estado, "pagado")));
  let reembolso = 0;
  if (enLinea.length) {
    const titular = s.usuario.rol === "duena" || s.usuario.rol === "admin";
    if (!s.barberia.aceptaReembolsos && !titular) volver(regreso, { error: "Se pagó en línea y el negocio no hace reembolsos. Si el cliente no pudo venir, cambia su cita de día; si hay que devolver el dinero, pídelo a la titular." });
    const r = await reembolsarVenta(v.venta.id, s.barberia.id).catch((e) => ({ monto: 0, error: e instanceof Error ? e.message : "No se pudo devolver el pago." }));
    if (r.error) volver(regreso, { error: r.error });
    reembolso = r.monto;
    await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "venta",
      accion: `${s.usuario.nombre} devolvió ${formatoDinero(reembolso)} pagados en línea de la venta ${v.venta.folio}${s.barberia.aceptaReembolsos ? "" : " como excepción"}`, detalle: { motivo } });
  }

  let devolucion = 0;
  let turnoActualId: string | null = null;
  if (v.turno.estado === "cerrado") {
    const pagosVenta = await db.select().from(schema.pagos).where(eq(schema.pagos.ventaId, v.venta.id));
    const propinasVenta = await db.select().from(schema.propinas).where(eq(schema.propinas.ventaId, v.venta.id));
    devolucion = pagosVenta.filter((p) => p.esEfectivo).reduce((a, p) => a + p.monto, 0) + propinasVenta.filter((p) => p.esEfectivo).reduce((a, p) => a + p.monto, 0);
    if (devolucion > 0) {
      const t = await cajaDe(s);
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
      detalle: { folio: v.venta.folio, motivo, total: v.venta.total, devolucionEfectivo: devolucion || undefined, total_texto: formatoDinero(v.venta.total) },
    });
  });
  revalidatePath("/", "layout");
  volver(regreso, { aviso: "cancelada" });
}

export type EstadoModificar = { ok?: boolean; error?: string; n?: number };

/**
 * Modifica una venta ya cobrada: quién atendió, el precio de cada servicio y cómo se pagó.
 * Queda en el historial con el antes y el después. Si la caja de esa venta ya cerró, el efectivo no puede cambiar:
 * para eso está el ajuste al corte.
 */
export async function modificarVenta(_: EstadoModificar, form: FormData): Promise<EstadoModificar> {
  const s = await requerirSesion();
  if (!s.puede("ventas.modificar")) return { error: "No tienes permiso para modificar ventas." };
  const ventaId = texto(form, "ventaId", 40);
  const motivo = texto(form, "motivo", 300);
  if (!motivo) return { error: "Escribe por qué se modifica la venta." };
  let datos: { conceptos: { id: string; barberoId: string; precio: string }[]; pagos: { metodoId: string; monto: string }[] };
  try { datos = JSON.parse(String(form.get("datos") ?? "{}")); } catch { return { error: "Revisa los datos de la venta." }; }
  const [v] = await db.select({ venta: schema.ventas, turno: schema.turnosCaja }).from(schema.ventas)
    .innerJoin(schema.turnosCaja, eq(schema.turnosCaja.id, schema.ventas.turnoId))
    .where(and(eq(schema.ventas.id, ventaId), eq(schema.ventas.barberiaId, s.barberia.id))).limit(1);
  if (!v) return { error: "No se encontró esa venta." };
  if (v.venta.estado !== "pagada") return { error: "Una venta cancelada no se puede modificar." };
  const [conceptosAntes, pagosAntes, equipo, metodos, servicios, reglas] = await Promise.all([
    db.select().from(schema.conceptos).where(eq(schema.conceptos.ventaId, v.venta.id)),
    db.select().from(schema.pagos).where(eq(schema.pagos.ventaId, v.venta.id)),
    db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)),
    db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, s.barberia.id)),
    db.select({ id: schema.servicios.id, comision: schema.servicios.comision }).from(schema.servicios).where(eq(schema.servicios.barberiaId, s.barberia.id)),
    reglasDe(s.barberia.id),
  ]);
  const nuevos: { antes: (typeof conceptosAntes)[number]; barberoId: string; barbero: string; precio: number; descuento: number; regla: ReturnType<typeof copiaRegla>; comision: number }[] = [];
  for (const c of conceptosAntes) {
    const d = (datos.conceptos ?? []).find((x) => x.id === c.id);
    if (!d) return { error: "Faltan servicios de la venta." };
    const precio = leerPesos(String(d.precio));
    if (precio === null || precio < 0) return { error: `Revisa el precio de ${c.nombreServicio}.` };
    const barbero = equipo.find((e) => e.id === d.barberoId);
    if (!barbero) return { error: "Elige quién atendió cada servicio." };
    const base = copiaRegla(elegirRegla(reglas, barbero.id, c.servicioId, v.venta.creadoEn));
    const especial = servicios.find((x) => x.id === c.servicioId)?.comision ?? null;
    const regla = base && especial !== null && (base.tipo === "porcentaje" || base.tipo === "mixto") ? { ...base, porcentaje: especial } : base;
    nuevos.push({ antes: c, barberoId: barbero.id, barbero: barbero.nombre, precio, descuento: Math.max(0, c.precioLista - precio), regla, comision: comisionDeServicio(regla, precio) });
  }
  const total = nuevos.reduce((a, x) => a + x.precio, 0);
  const pagos = (datos.pagos ?? []).map((p) => ({ m: metodos.find((m) => m.id === p.metodoId), monto: leerPesos(String(p.monto)) ?? -1 })).filter((p) => p.monto !== 0);
  if (pagos.some((p) => !p.m || p.monto < 0)) return { error: "Revisa las formas de pago." };
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  if (pagado !== total) return { error: `Los pagos suman ${formatoDinero(pagado)} y la venta queda en ${formatoDinero(total)}.` };
  const efectivo = (xs: { esEfectivo: boolean; monto: number }[]) => xs.filter((p) => p.esEfectivo).reduce((a, p) => a + p.monto, 0);
  if (v.turno.estado === "cerrado" && efectivo(pagosAntes) !== efectivo(pagos.map((p) => ({ esEfectivo: p.m!.esEfectivo, monto: p.monto })))) {
    return { error: "La caja de esta venta ya se cerró, así que el efectivo no puede cambiar. Registra la diferencia como ajuste al corte." };
  }
  const nombre = (id: string) => equipo.find((e) => e.id === id)?.nombre.split(" ")[0] ?? "";
  const texto1 = (cs: { nombre: string; barbero: string; precio: number }[], ps: { metodo: string; monto: number }[]) =>
    `${cs.map((c) => `${c.nombre} con ${c.barbero}, ${formatoDinero(c.precio)}`).join("; ")}. Pago: ${ps.map((p) => `${p.metodo} ${formatoDinero(p.monto)}`).join(" y ") || "sin pago"}`;
  const antes = texto1(conceptosAntes.map((c) => ({ nombre: c.nombreServicio, barbero: nombre(c.barberoId), precio: c.precioCobrado })), pagosAntes.map((p) => ({ metodo: p.nombreMetodo, monto: p.monto })));
  const ahora = texto1(nuevos.map((c) => ({ nombre: c.antes.nombreServicio, barbero: c.barbero.split(" ")[0], precio: c.precio })), pagos.map((p) => ({ metodo: p.m!.nombre, monto: p.monto })));
  if (antes === ahora) return { error: "No cambiaste nada." };
  await db.transaction(async (tx) => {
    for (const c of nuevos) {
      await tx.update(schema.conceptos).set({ barberoId: c.barberoId, precioCobrado: c.precio, descuento: c.descuento, reglaComision: c.regla, comision: c.comision })
        .where(eq(schema.conceptos.id, c.antes.id));
    }
    await tx.update(schema.ventas).set({ total, descuentoTotal: nuevos.reduce((a, x) => a + x.descuento, 0) }).where(eq(schema.ventas.id, v.venta.id));
    await tx.execute(sql`select set_config('crabs.edicion', 'pagos', true)`);
    await tx.delete(schema.pagos).where(eq(schema.pagos.ventaId, v.venta.id));
    if (pagos.length) await tx.insert(schema.pagos).values(pagos.map((p) => ({ barberiaId: s.barberia.id, ventaId: v.venta.id, metodoPagoId: p.m!.id, nombreMetodo: p.m!.nombre, esEfectivo: p.m!.esEfectivo, monto: p.monto })));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "venta",
      accion: `${s.usuario.nombre} modificó la venta ${v.venta.folio}`,
      detalle: { folio: v.venta.folio, motivo, antes, ahora, total },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export type ConsultaStripe = { estado: "cobrado" | "reembolsado" | "parcial" | "pendiente" | "error"; monto?: number; reembolsado?: number; tarjeta?: string; referencia?: string; consultado?: string };

/** Consulta en vivo a Stripe el pago en línea de una venta: lo que responde Stripe, no lo que guardó la app. */
export async function consultarPagoStripe(ventaId: string): Promise<ConsultaStripe> {
  const s = await requerirSesion();
  if (!/^[0-9a-f-]{36}$/.test(String(ventaId)) || !s.barberia.stripeCuenta) return { estado: "error" };
  const [p] = await db.select().from(schema.pagosLinea).where(and(eq(schema.pagosLinea.ventaId, ventaId), eq(schema.pagosLinea.barberiaId, s.barberia.id))).limit(1);
  if (!p?.intento) return { estado: "error" };
  try {
    const { stripe, tarjetaDe } = await import("@/lib/stripe");
    const pi = await stripe().paymentIntents.retrieve(p.intento, { expand: ["latest_charge"] }, { stripeAccount: s.barberia.stripeCuenta });
    const ch = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const reemb = ch?.amount_refunded ?? 0;
    const estado = pi.status !== "succeeded" ? "pendiente" : reemb >= (ch?.amount ?? pi.amount) ? "reembolsado" : reemb > 0 ? "parcial" : "cobrado";
    // Si se devolvió desde Stripe y aquí no se supo, se deja igual: la venta se cancela.
    if (estado === "reembolsado" && p.estado === "pagado") { const { sincronizarReembolso } = await import("@/lib/pagos"); await sincronizarReembolso(p.intento); }
    const hora = new Intl.DateTimeFormat("es-MX", { timeZone: s.barberia.zonaHoraria, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    return { estado, monto: pi.amount_received || pi.amount, reembolsado: reemb, tarjeta: tarjetaDe(pi), referencia: pi.id, consultado: hora };
  } catch (err) {
    console.error("consultar_pago_stripe", err);
    return { estado: "error" };
  }
}
