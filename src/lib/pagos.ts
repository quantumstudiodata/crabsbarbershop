import "server-only";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { and, eq, ne, gt, lt, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { avisosDeConfirmacion, ESTADOS_ACTIVOS } from "./citas";
import { db, schema } from "./db";
import { pagosLinea } from "./db/schema";
import { registrar } from "./historial";
import { formatoDinero } from "./money";
import { estadoDeCuenta, stripe, tarjetaDe } from "./stripe";
import { insertarVenta, type PlanVenta, type PropinaVenta } from "./ventas";
import { comisionDeServicio, elegirRegla } from "./comisiones";
import { copiaRegla, reglasDe } from "./datos";

/** Nombre de la forma de pago de una cita pagada completa en línea. */
export const PAGO_EN_LINEA = "Pago en línea";

/**
 * Citas pagadas completas en línea: se registran como venta desde que se pagan (en la caja abierta),
 * con la comisión de quien atiende. La cita sigue pendiente de atenderse y ya no se vuelve a cobrar.
 * Si no hay caja abierta, la venta se registra en cuanto se abra. Es idempotente.
 */
export async function ventasDeCitasPagadas(barberiaId: string) {
  const [turno] = await db.select({ id: schema.turnosCaja.id }).from(schema.turnosCaja)
    .where(and(eq(schema.turnosCaja.barberiaId, barberiaId), eq(schema.turnosCaja.estado, "abierto"))).limit(1);
  if (!turno) return;
  const pendientes = await db.select().from(schema.citas).where(and(eq(schema.citas.barberiaId, barberiaId), sql`${schema.citas.ventaId} is null`,
    sql`${schema.citas.total} > 0`, sql`${schema.citas.pagado} >= ${schema.citas.total}`, inArray(schema.citas.estado, ["en_espera", "llego", "en_atencion", "completada"]),
    sql`exists (select 1 from ${pagosLinea} pl where pl.cita_id = ${schema.citas.id} and pl.estado = 'pagado')`)).limit(20);
  if (!pendientes.length) return;
  const reglas = await reglasDe(barberiaId);
  for (const c of pendientes) {
    try {
      const [pg] = await db.select({ t: sql<Date | null>`min(${pagosLinea.pagadoEn})` }).from(pagosLinea).where(and(eq(pagosLinea.citaId, c.id), eq(pagosLinea.estado, "pagado")));
      const pagadoEn = pg?.t ? new Date(pg.t) : undefined;
      await db.transaction(async (tx) => {
        const conceptos = c.servicios.map((sv) => {
          const desc = Math.min(sv.descuento ?? 0, sv.precio);
          const cobrado = sv.precio - desc;
          const regla = copiaRegla(elegirRegla(reglas, c.barberoId, sv.servicioId, new Date()));
          return {
            barberiaId, servicioId: sv.servicioId, nombreServicio: sv.nombre, barberoId: c.barberoId, precioLista: sv.precio,
            descuento: desc, motivoDescuento: desc > 0 ? "Promoción al reservar" : null, autorizadoPor: null,
            precioCobrado: cobrado, reglaComision: regla, comision: comisionDeServicio(regla, cobrado), promocionId: sv.promocionId ?? null,
          };
        });
        const plan: PlanVenta = {
          // La registra quien atiende la cita; la hora es la del pago, no la de abrir la app.
          barberiaId, turnoId: turno.id, usuarioId: c.barberoId, usuarioNombre: "Pago en línea", creadoEn: pagadoEn,
          total: c.total, descuentoTotal: conceptos.reduce((a, x) => a + x.descuento, 0), descuento: 0, motivoDescuento: "",
          observaciones: `Cita ${c.folio} pagada en línea`, clave: `cita-linea-${c.id}`, citaId: c.id, promosUsadas: [], nombresPromo: "",
          conceptos, mantenerCita: true,
        };
        const v = await insertarVenta(tx, plan, [{ metodoPagoId: null, nombreMetodo: PAGO_EN_LINEA, esEfectivo: false, monto: c.total }], null, randomBytes(9).toString("base64url"));
        await tx.update(pagosLinea).set({ ventaId: v.ventaId }).where(and(eq(pagosLinea.citaId, c.id), eq(pagosLinea.estado, "pagado"), sql`${pagosLinea.ventaId} is null`));
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? "");
      if (!msg.includes("cita_cobrada") && !msg.includes("ventas_clave_uq")) console.error("venta_cita_linea", c.id, err);
    }
  }
}

/** Lo mismo, una vez por petición: se llama al cargar las pantallas de ventas, cobro e inicio. */
export const asentarCitasPagadas = cache(async (barberiaId: string) => {
  await ventasDeCitasPagadas(barberiaId).catch((err) => console.error("venta_cita_linea", err));
  await comisionesStripe(barberiaId).catch((err) => console.error("comision_stripe", err));
});

export const CATEGORIA_COMISIONES = "Comisiones por pago en línea";
/** Nombre anterior: se juntó con el nuevo para que no salgan dos categorías iguales. */
const CATEGORIA_VIEJA = "Comisiones Stripe";

/**
 * La categoría de comisiones por pagos en línea, una sola. Si el negocio ya creó una con ese nombre (con otras mayúsculas),
 * se usa esa; la vieja "Comisiones Stripe" se junta con ella.
 */
export async function categoriaComisiones(barberiaId: string) {
  const cats = await db.select({ id: schema.categoriasGasto.id, nombre: schema.categoriasGasto.nombre }).from(schema.categoriasGasto).where(eq(schema.categoriasGasto.barberiaId, barberiaId));
  const propia = cats.find((c) => c.nombre.trim().toLowerCase() === CATEGORIA_COMISIONES.toLowerCase());
  const nombre = propia?.nombre ?? CATEGORIA_COMISIONES;
  if (!propia) await db.insert(schema.categoriasGasto).values({ barberiaId, nombre, orden: 99 }).onConflictDoNothing();
  const vieja = cats.find((c) => c.nombre === CATEGORIA_VIEJA);
  if (vieja) {
    await db.transaction(async (tx) => {
      await tx.update(schema.gastos).set({ categoria: nombre }).where(and(eq(schema.gastos.barberiaId, barberiaId), eq(schema.gastos.categoria, CATEGORIA_VIEJA)));
      await tx.update(schema.conceptosFrecuentes).set({ categoria: nombre }).where(and(eq(schema.conceptosFrecuentes.barberiaId, barberiaId), eq(schema.conceptosFrecuentes.categoria, CATEGORIA_VIEJA)));
      await tx.delete(schema.categoriasGasto).where(eq(schema.categoriasGasto.id, vieja.id));
    });
  }
  return nombre;
}

/** Las comisiones por pagos en línea nunca salen de la caja: no se ofrecen como gasto de caja. */
export const esCategoriaComisiones = (nombre: string) => [CATEGORIA_COMISIONES.toLowerCase(), CATEGORIA_VIEJA.toLowerCase()].includes(nombre.trim().toLowerCase());

/**
 * Lo que Stripe cobra por cada pago en línea se anota solo como egreso, para que Finanzas y la libreta cuadren.
 * Stripe no devuelve su comisión en un reembolso, así que el egreso se queda. Es idempotente (una vez por pago).
 */
export async function comisionesStripe(barberiaId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const [b] = await db.select({ cuenta: schema.barberias.stripeCuenta, zona: schema.barberias.zonaHoraria }).from(schema.barberias).where(eq(schema.barberias.id, barberiaId)).limit(1);
  if (!b?.cuenta) return;
  const categoria = await categoriaComisiones(barberiaId);
  const pagos = await db.select({ id: pagosLinea.id, intento: pagosLinea.intento, pagadoEn: pagosLinea.pagadoEn, tipo: pagosLinea.tipo }).from(pagosLinea)
    .where(and(eq(pagosLinea.barberiaId, barberiaId), inArray(pagosLinea.estado, ["pagado", "reembolsado"]), sql`${pagosLinea.intento} is not null`, sql`not (${pagosLinea.detalle} ? 'sinComision')`, sql`coalesce((${pagosLinea.detalle}->>'cargo')::int, 0) = 0`,
      sql`not exists (select 1 from ${schema.gastos} g where g.barberia_id = ${barberiaId} and g.descripcion like '%' || ${pagosLinea.intento} || '%')`)).limit(10);
  if (!pagos.length) return;
  const [titular] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios)
    .where(and(eq(schema.usuarios.barberiaId, barberiaId), eq(schema.usuarios.rol, "duena"))).limit(1);
  if (!titular) return;
  for (const p of pagos) {
    try {
      const pi = await stripe().paymentIntents.retrieve(p.intento!, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: b.cuenta });
      const ch = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      const bt = ch && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
      if (!bt?.fee) continue;
      const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: b.zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(p.pagadoEn ?? new Date());
      await db.insert(schema.gastos).values({
        barberiaId, categoria, concepto: p.tipo === "cita" ? "Comisión por pago de cita en línea" : "Comisión por cobro con QR",
        descripcion: `Stripe ${pi.id}`, monto: bt.fee, fecha, metodo: "transferencia", usuarioId: titular.id,
      });
    } catch (err) {
      // Pagos de prueba o de otra cuenta: Stripe ya no los tiene. Se marcan para no volver a preguntar en cada página.
      if ((err as { code?: string }).code === "resource_missing") { await db.update(pagosLinea).set({ detalle: sql`${pagosLinea.detalle} || '{"sinComision": true}'::jsonb` }).where(eq(pagosLinea.id, p.id)); continue; }
      console.error("comision_stripe", p.id, err);
    }
  }
}

/**
 * Stripe dice que un pago se devolvió (por ejemplo, desde su panel) aunque el aviso no haya llegado:
 * se deja igual aquí. La venta se cancela y, si era de una cita, la cita queda sin pago.
 */
export async function sincronizarReembolso(intento: string) {
  const filas = await db.update(pagosLinea).set({ estado: "reembolsado" }).where(and(eq(pagosLinea.intento, intento), eq(pagosLinea.estado, "pagado")))
    .returning({ tipo: pagosLinea.tipo, ventaId: pagosLinea.ventaId, citaId: pagosLinea.citaId });
  for (const f of filas) {
    await cancelarVentaReembolsada(f.ventaId);
    if (f.tipo === "cita" && f.citaId) await db.update(schema.citas).set({ pagado: 0, estadoPago: "sin_pago", actualizadoEn: new Date() }).where(eq(schema.citas.id, f.citaId));
  }
}

/** Si una venta salió de una cita pagada en línea y el pago se devolvió, la venta se cancela sola. */
async function cancelarVentaReembolsada(ventaId: string | null) {
  if (!ventaId) return;
  await db.update(schema.ventas).set({ estado: "cancelada", motivoCancelacion: "Se devolvió el pago en línea", canceladaEn: new Date() })
    .where(and(eq(schema.ventas.id, ventaId), eq(schema.ventas.estado, "pagada")));
}

/**
 * Stripe confirmó un pago (aviso verificado). Es idempotente: si el aviso llega dos veces, la segunda no hace nada.
 * Cita: queda confirmada con lo pagado. Cobro con QR: se registra la venta con su folio.
 */
export async function confirmarPago(pi: Stripe.PaymentIntent, cuenta: string) {
  const [p] = await db.select().from(pagosLinea).where(eq(pagosLinea.intento, pi.id)).limit(1);
  if (!p) return { omitido: "sin_pago" };
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, p.barberiaId)).limit(1);
  // El pago tiene que venir de la cuenta del propio negocio.
  if (!b || b.stripeCuenta !== cuenta) return { omitido: "otra_cuenta" };
  const completo = await stripe().paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] }, { stripeAccount: cuenta }).catch(() => pi);
  if (completo.status !== "succeeded") return { omitido: "no_pagado" };
  const cobrado = completo.amount_received || completo.amount;
  const tarjeta = tarjetaDe(completo);

  if (p.tipo === "venta") {
    const datos = p.plan as { plan: PlanVenta; propina: PropinaVenta; propinaPara: string; anticipo?: number } | null;
    if (!datos) return { omitido: "sin_plan" };
    // Lo que el cliente pagó de más es propina, sin contar la comisión de tarjeta que él cubrió.
    const cargoQr = Number((p.detalle as { cargo?: number })?.cargo ?? 0);
    const propinaCliente = Math.max(cobrado - p.monto - cargoQr, 0);
    const r = await db.transaction(async (tx) => {
      const marcado = await tx.update(pagosLinea).set({ estado: "pagado", pagadoEn: new Date(), tarjeta, propina: propinaCliente })
        .where(and(eq(pagosLinea.id, p.id), inArray(pagosLinea.estado, ["pendiente", "cancelado"]))).returning({ id: pagosLinea.id });
      if (!marcado.length) return null;
      // Si la caja del cobro ya se cerró, la venta entra en la caja abierta del negocio (si hay una).
      const [abierta] = await tx.select({ id: schema.turnosCaja.id }).from(schema.turnosCaja)
        .where(and(eq(schema.turnosCaja.barberiaId, b.id), eq(schema.turnosCaja.estado, "abierto"))).limit(1);
      const [original] = await tx.select({ estado: schema.turnosCaja.estado }).from(schema.turnosCaja).where(eq(schema.turnosCaja.id, datos.plan.turnoId)).limit(1);
      const plan = { ...datos.plan, turnoId: original?.estado === "abierto" || !abierta ? datos.plan.turnoId : abierta.id };
      const propina: PropinaVenta = propinaCliente > 0 ? { monto: propinaCliente, barberoId: datos.propina?.barberoId || datos.propinaPara, efectivo: false } : null;
      const anticipo = datos.anticipo ?? 0;
      const v = await insertarVenta(tx, plan, [
        { metodoPagoId: null, nombreMetodo: "Pago con QR", esEfectivo: false, monto: plan.total - anticipo },
        ...(anticipo > 0 ? [{ metodoPagoId: null, nombreMetodo: "Anticipo en línea", esEfectivo: false, monto: anticipo }] : []),
      ], propina, randomBytes(9).toString("base64url"));
      await tx.update(pagosLinea).set({ ventaId: v.ventaId }).where(eq(pagosLinea.id, p.id));
      return v;
    }).catch(async (err) => {
      // La misma venta ya se cobró por otro lado (otro QR o la cita ya cobrada): se devuelve este pago.
      const msg = String((err as Error)?.message ?? "");
      if (!msg.includes("ventas_clave_uq") && !msg.includes("cita_cobrada")) throw err;
      await stripe().refunds.create({ payment_intent: pi.id, reason: "duplicate" }, { stripeAccount: cuenta, idempotencyKey: `reemb-${p.id}` });
      await db.update(pagosLinea).set({ estado: "reembolsado", pagadoEn: new Date(), tarjeta }).where(eq(pagosLinea.id, p.id));
      return null;
    });
    return r ? { venta: r.folio } : { omitido: "repetido" };
  }

  // Anticipo o pago completo de una cita reservada en línea. Si el cliente pagó el cargo por pago en línea,
  // a la cita solo cuenta lo del servicio: el cargo es lo que se queda Stripe.
  const cargo = Number((p.detalle as { cargo?: number })?.cargo ?? 0);
  const neto = Math.max(cobrado - cargo, 0);
  const r = await db.transaction(async (tx) => {
    const marcado = await tx.update(pagosLinea).set({ estado: "pagado", pagadoEn: new Date(), tarjeta, monto: neto })
      .where(and(eq(pagosLinea.id, p.id), eq(pagosLinea.estado, "pendiente"))).returning({ id: pagosLinea.id });
    if (!marcado.length || !p.citaId) return null;
    const [c] = await tx.select().from(schema.citas).where(eq(schema.citas.id, p.citaId)).limit(1);
    if (!c) return null;
    // Si el apartado ya venció y alguien más tomó el horario, se devuelve el dinero.
    if (c.estado === "expirada" || c.estado === "cancelada") {
      const [choque] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.citas)
        .where(and(eq(schema.citas.barberiaId, c.barberiaId), eq(schema.citas.barberoId, c.barberoId), ne(schema.citas.id, c.id),
          lt(schema.citas.inicio, c.fin), gt(schema.citas.fin, c.inicio), inArray(schema.citas.estado, [...ESTADOS_ACTIVOS])));
      if (c.estado === "cancelada" || choque.n > 0) return { reembolsar: true, c };
    }
    const pagado = c.pagado + neto;
    const [act] = await tx.update(schema.citas).set({
      estado: c.estado === "apartada" || c.estado === "expirada" ? "en_espera" : c.estado, expiraEn: null,
      pagado, estadoPago: pagado >= c.total ? "pagada" : "anticipo", metodoPago: tarjeta ? `En línea, ${tarjeta}` : "En línea", actualizadoEn: new Date(),
    }).where(eq(schema.citas.id, c.id)).returning();
    if (c.estado === "apartada" || c.estado === "expirada") {
      const [u] = await tx.select({ nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.id, c.barberoId)).limit(1);
      await avisosDeConfirmacion(tx, b, act, u?.nombre.split(" ")[0] ?? "");
    }
    return { reembolsar: false, c: act };
  });
  if (r?.reembolsar) {
    await stripe().refunds.create({ payment_intent: pi.id, reason: "requested_by_customer" }, { stripeAccount: cuenta, idempotencyKey: `reemb-${p.id}` });
    await db.update(pagosLinea).set({ estado: "reembolsado" }).where(eq(pagosLinea.id, p.id));
    return { reembolsado: true };
  }
  if (r) await ventasDeCitasPagadas(b.id).catch((err) => console.error("venta_cita_linea", err));
  return r ? { cita: r.c.folio } : { omitido: "repetido" };
}

/** Devuelve lo que se pagó en línea por una cita (al cancelarla). No hace nada si no se pagó en línea. */
export async function reembolsarCita(citaId: string, quien: { barberiaId: string; usuarioId: string | null; nombre: string }) {
  const pagos = await db.select().from(pagosLinea).where(and(eq(pagosLinea.citaId, citaId), eq(pagosLinea.estado, "pagado")));
  if (!pagos.length) return { monto: 0 };
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, quien.barberiaId)).limit(1);
  if (!b?.stripeCuenta) return { monto: 0, error: "La cuenta de Stripe del negocio no está conectada; devuelve el anticipo desde el panel de Stripe." };
  let monto = 0;
  for (const p of pagos) {
    if (!p.intento) continue;
    await stripe().refunds.create({ payment_intent: p.intento, reason: "requested_by_customer" }, { stripeAccount: b.stripeCuenta, idempotencyKey: `reemb-${p.id}` });
    await db.update(pagosLinea).set({ estado: "reembolsado" }).where(eq(pagosLinea.id, p.id));
    await cancelarVentaReembolsada(p.ventaId);
    monto += p.monto;
  }
  await db.update(schema.citas).set({ pagado: 0, estadoPago: "sin_pago", actualizadoEn: new Date() }).where(eq(schema.citas.id, citaId));
  await registrar(db, { barberiaId: quien.barberiaId, usuarioId: quien.usuarioId, tipo: "venta", accion: `${quien.nombre} canceló una cita y se devolvieron ${formatoDinero(monto)} pagados en línea` });
  return { monto };
}

/**
 * Devuelve en Stripe lo pagado en línea de una venta (cobro con QR o anticipo de su cita).
 * La venta la cancela quien llama; aquí solo se reembolsa y se ajusta la cita ligada.
 */
export async function reembolsarVenta(ventaId: string, barberiaId: string): Promise<{ monto: number; error?: string }> {
  const pagos = await db.select().from(pagosLinea).where(and(eq(pagosLinea.ventaId, ventaId), eq(pagosLinea.estado, "pagado")));
  if (!pagos.length) return { monto: 0 };
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, barberiaId)).limit(1);
  if (!b?.stripeCuenta) return { monto: 0, error: "La cuenta de Stripe del negocio no está conectada; no se puede devolver el pago desde la app." };
  let monto = 0;
  for (const p of pagos) {
    if (!p.intento) continue;
    await stripe().refunds.create({ payment_intent: p.intento, reason: "requested_by_customer" }, { stripeAccount: b.stripeCuenta, idempotencyKey: `reemb-${p.id}` });
    await db.update(pagosLinea).set({ estado: "reembolsado" }).where(eq(pagosLinea.id, p.id));
    if (p.citaId) await db.update(schema.citas).set({ pagado: sql`greatest(${schema.citas.pagado} - ${p.monto}, 0)`, estadoPago: "sin_pago", actualizadoEn: new Date() }).where(eq(schema.citas.id, p.citaId));
    monto += p.monto;
  }
  return { monto };
}

/** Stripe avisó que cambió la cuenta conectada de un negocio (datos completos, cobros habilitados). */
export async function actualizarCuenta(a: Stripe.Account) {
  await db.update(schema.barberias).set({ stripeEstado: estadoDeCuenta(a) }).where(eq(schema.barberias.stripeCuenta, a.id));
}

/**
 * Respaldo del aviso de Stripe: el servidor le pregunta a Stripe si el pago ya se cobró.
 * La respuesta viene de Stripe (no del navegador), así que es igual de confiable que el aviso.
 */
export async function verificarPago(p: { intento: string | null; estado: string; barberiaId: string }) {
  if (p.estado !== "pendiente" || !p.intento || !process.env.STRIPE_SECRET_KEY) return;
  try {
    const [b] = await db.select({ cuenta: schema.barberias.stripeCuenta }).from(schema.barberias).where(eq(schema.barberias.id, p.barberiaId)).limit(1);
    if (!b?.cuenta) return;
    const pi = await stripe().paymentIntents.retrieve(p.intento, {}, { stripeAccount: b.cuenta });
    if (pi.status === "succeeded") await confirmarPago(pi, b.cuenta);
  } catch (err) {
    console.error("verificar_pago", err);
  }
}

export type Verificado = { estado: string; tarjeta: string; referencia: string; pagadoEn: Date | null };

/** Pagos en línea ya confirmados por Stripe de unas ventas: para marcarlas como verificadas. */
export async function verificadosDe(ventaIds: string[]): Promise<Map<string, Verificado>> {
  if (!ventaIds.length) return new Map();
  const filas = await db.select({ ventaId: pagosLinea.ventaId, estado: pagosLinea.estado, tarjeta: pagosLinea.tarjeta, intento: pagosLinea.intento, pagadoEn: pagosLinea.pagadoEn })
    .from(pagosLinea).where(and(inArray(pagosLinea.ventaId, ventaIds), inArray(pagosLinea.estado, ["pagado", "reembolsado"])));
  return new Map(filas.map((f) => [f.ventaId!, { estado: f.estado, tarjeta: f.tarjeta, referencia: f.intento ?? "", pagadoEn: f.pagadoEn }]));
}

/** Minutos que vale el enlace de un cobro con QR. */
export const VIGENCIA_QR_MIN = 30;

/**
 * Un cobro con QR que pasó su vigencia sin pagarse se cancela (en Stripe y aquí).
 * Antes se pregunta a Stripe: si el cliente pagó justo a tiempo, la venta se registra.
 */
export async function vencerSiToca(p: { id: string; tipo: string; intento: string | null; estado: string; barberiaId: string; creadoEn: Date }) {
  if (p.tipo !== "venta" || p.estado !== "pendiente" || Date.now() - p.creadoEn.getTime() < VIGENCIA_QR_MIN * 60000) return false;
  await verificarPago(p);
  const [n] = await db.select({ estado: pagosLinea.estado }).from(pagosLinea).where(eq(pagosLinea.id, p.id)).limit(1);
  if (n?.estado !== "pendiente") return false;
  try {
    const [b] = await db.select({ cuenta: schema.barberias.stripeCuenta }).from(schema.barberias).where(eq(schema.barberias.id, p.barberiaId)).limit(1);
    if (p.intento && b?.cuenta) await stripe().paymentIntents.cancel(p.intento, { cancellation_reason: "abandoned" }, { stripeAccount: b.cuenta });
  } catch (err) {
    console.error("vencer_qr", err);
    return false;
  }
  await db.update(pagosLinea).set({ estado: "cancelado" }).where(and(eq(pagosLinea.id, p.id), eq(pagosLinea.estado, "pendiente")));
  return true;
}

/** Stripe devolvió un cobro (desde su panel o por nosotros). */
export async function marcarReembolso(ch: Stripe.Charge) {
  const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
  if (pi && ch.refunded) await sincronizarReembolso(pi);
}
