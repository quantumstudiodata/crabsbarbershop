"use server";

import { randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { darPorRecibida } from "@/lib/transferencias";
import { requerirSesion } from "@/lib/auth";
import { comisionDeServicio, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, reglasDe, cajaOAbrir } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { aplicarPromos, momentoEn, type Promo } from "@/lib/promociones";
import { cobraEnLinea, crearIntento, MINIMO_STRIPE, origen, stripe } from "@/lib/stripe";
import { insertarVenta, type PagoVenta, type PlanVenta, type PropinaVenta } from "@/lib/ventas";
import { pagosLinea } from "@/lib/db/schema";

/** Identificador de la forma de pago "Pago con QR" (no es una forma de pago guardada del negocio). */
const QR = "qr";

export type EstadoCobro = { ok?: boolean; error?: string; folio?: string; total?: number; encuesta?: string | null; qr?: CobroQrAbierto };
export type CobroQrAbierto = { id: string; url: string; total: number; vence: number; detalle?: string };

type Entrada = {
  clave: string;
  lineas: { servicioId: string; barberoId: string }[];
  descuento: number;
  motivoDescuento: string;
  pagos: { metodoId: string; monto: number }[];
  propina: { monto: number; barberoId: string; efectivo: boolean };
  observaciones: string;
  codigo: string;
  citaId: string;
};

const entero = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

function leer(form: FormData): Entrada | null {
  try {
    const d = JSON.parse(String(form.get("datos") ?? ""));
    const e: Entrada = {
      clave: String(d.clave ?? "").slice(0, 64),
      lineas: Array.isArray(d.lineas) ? d.lineas.slice(0, 20).map((l: { servicioId: unknown; barberoId: unknown }) => ({ servicioId: String(l.servicioId), barberoId: String(l.barberoId) })) : [],
      descuento: entero(d.descuento) ?? -1,
      motivoDescuento: String(d.motivoDescuento ?? "").trim().slice(0, 200),
      pagos: Array.isArray(d.pagos) ? d.pagos.slice(0, 3).map((p: { metodoId: unknown; monto: unknown }) => ({ metodoId: String(p.metodoId), monto: entero(p.monto) ?? -1 })) : [],
      propina: { monto: entero(d.propina?.monto) ?? -1, barberoId: String(d.propina?.barberoId ?? ""), efectivo: d.propina?.efectivo !== false },
      observaciones: String(d.observaciones ?? "").trim().slice(0, 300),
      codigo: String(d.codigo ?? "").trim().slice(0, 30),
      citaId: /^[0-9a-f-]{36}$/.test(String(d.citaId ?? "")) ? String(d.citaId) : "",
    };
    if (!e.clave || e.descuento < 0 || e.propina.monto < 0 || e.pagos.some((p) => p.monto < 0)) return null;
    return e;
  } catch {
    return null;
  }
}

export async function registrarVenta(_: EstadoCobro, form: FormData): Promise<EstadoCobro> {
  const s = await requerirSesion();
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) return { error: "No tienes permiso para cobrar." };
  const bId = s.barberia.id;
  const e = leer(form);
  if (!e) return { error: "No se pudo leer la venta. Recarga la página e intenta otra vez." };
  if (e.lineas.length === 0) return { error: "Elige al menos un servicio." };

  // ¿Ya se guardó esta misma venta (doble clic)?
  const [previa] = await db.select({ folio: schema.ventas.folio, total: schema.ventas.total, tokenEncuesta: schema.ventas.tokenEncuesta }).from(schema.ventas)
    .where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
  if (previa) return { ok: true, folio: previa.folio, total: previa.total, encuesta: previa.tokenEncuesta };

  const turno = await cajaOAbrir(s);
  if (!turno) return { error: "La caja está cerrada. Hay que abrirla antes de cobrar." };
  // Pasadas las 12 de la noche, la caja del día anterior tiene que cerrarse antes de seguir cobrando.
  if (s.barberia.corteObligatorio && turno.fechaOperativa < fechaLocal(new Date(), s.barberia.zonaHoraria)) return { error: "La caja de ayer no se cerró. Haz el corte de caja antes de seguir cobrando." };

  // Precios siempre desde la base de datos, nunca desde el navegador.
  const ids = [...new Set(e.lineas.map((l) => l.servicioId))];
  // Los servicios de una cita se cobran aunque después se hayan eliminado u ocultado.
  const deCita = e.citaId ? ((await db.select({ sv: schema.citas.servicios }).from(schema.citas).where(and(eq(schema.citas.id, e.citaId), eq(schema.citas.barberiaId, bId))).limit(1))[0]?.sv ?? []).map((x) => x.servicioId) : [];
  const svc = await db.select().from(schema.servicios).where(and(eq(schema.servicios.barberiaId, bId), inArray(schema.servicios.id, ids)))
    .then((xs) => xs.filter((x) => x.activo || deCita.includes(x.id)));
  if (svc.length !== ids.length) return { error: "Uno de los servicios ya no está disponible. Recarga la página." };
  const equipo = new Set((await equipoQueAtiende(bId)).map((u) => u.id));
  for (const l of e.lineas) {
    if (!equipo.has(l.barberoId)) return { error: "Elige quién atendió." };
    if (l.barberoId !== s.usuario.id && !s.puede("ventas.registrar_otros")) return { error: "Solo puedes registrar tus propios servicios." };
  }

  const lineas = e.lineas.map((l) => ({ ...l, s: svc.find((x) => x.id === l.servicioId)! }));
  const subtotal = lineas.reduce((a, l) => a + l.s.precio, 0);
  // Promociones: se recalculan aquí con la hora del negocio; lo que mande el navegador no cuenta.
  const promos = s.barberia.usaPromociones
    ? (await db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, bId))) as unknown as Promo[]
    : [];
  const ap = aplicarPromos(promos, lineas.map((l) => ({ servicioId: l.servicioId, categoria: l.s.categoria, precio: l.s.precio })), momentoEn(s.barberia.zonaHoraria), e.codigo);
  if (e.codigo && !ap.codigoValido) return { error: "Ese código promocional no es válido o ya no está vigente." };
  const promoDe = (i: number) => ap.porLinea[i]?.descuento ?? 0;
  const descPromo = lineas.reduce((a, _, i) => a + promoDe(i), 0);
  const neto = subtotal - descPromo;
  if (e.descuento > 0 && !s.barberia.usaDescuentos) return { error: "Los descuentos están apagados en Ajustes." };
  if (e.propina.monto > 0 && !s.barberia.usaPropinas) return { error: "Las propinas están apagadas en Ajustes." };
  if (e.pagos.filter((x) => x.monto > 0).length > 1 && !s.barberia.usaDividirPago) return { error: "Dividir el pago está apagado en Ajustes." };
  if (e.descuento > neto) return { error: "El descuento no puede ser mayor que la venta." };
  if (e.descuento > 0 && !e.motivoDescuento) return { error: "Escribe el motivo del descuento." };
  const limite = Math.floor((neto * s.barberia.limiteDescuentoPct) / 100);
  if (e.descuento > limite && !s.puede("ventas.descuento")) {
    return { error: `Ese descuento pasa del ${s.barberia.limiteDescuentoPct}% permitido. Pide a quien tenga permiso de aplicar descuentos mayores que lo registre.` };
  }
  const total = neto - e.descuento;
  const nombrePromo = (id?: string) => promos.find((x) => x.id === id)?.nombre ?? "";

  // Pago con QR: el cliente paga en su teléfono; la venta se guarda cuando Stripe confirma el pago.
  const conQr = e.pagos.some((p) => p.metodoId === QR);
  if (conQr && (e.pagos.length > 1 || !cobraEnLinea(s.barberia))) return { error: "El pago con QR no está disponible en este momento." };
  if (conQr && total <= 0) return { error: "No hay nada que cobrar con QR." };
  const metodos = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.barberiaId, bId), eq(schema.metodosPago.activo, true)));
  const pagos = conQr ? [] : e.pagos.filter((p) => p.monto > 0).map((p) => ({ ...p, m: metodos.find((m) => m.id === p.metodoId) }));
  if (pagos.length === 0 && total > 0 && !conQr && !(e.citaId)) return { error: "Elige cómo pagó." };
  if (pagos.some((p) => !p.m)) return { error: "Esa forma de pago ya no está disponible. Recarga la página." };
  // Anticipo pagado en línea al reservar: ya está cobrado y se registra como un pago más de la venta.
  let anticipo = 0;
  let anticipoNombre = "Anticipo en línea";
  if (e.citaId) {
    // Una transferencia de la reserva que aún no se confirmaba se da por hecha al cobrar la cita.
    await darPorRecibida(bId, e.citaId, { usuarioId: s.usuario.id, nombre: s.usuario.nombre, motivo: "cobro" });
    const [c] = await db.select({ pagado: schema.citas.pagado, metodo: schema.citas.metodoPago }).from(schema.citas).where(and(eq(schema.citas.id, e.citaId), eq(schema.citas.barberiaId, bId))).limit(1);
    anticipo = Math.min(c?.pagado ?? 0, total);
    // Si lo pagó por transferencia a la cuenta del negocio, el pago se registra como transferencia.
    if (c?.metodo === "Transferencia") anticipoNombre = "Transferencia";
  }
  const porCobrar = total - anticipo;
  if (conQr && porCobrar <= 0) return { error: "La cita ya está pagada en línea; cóbrala con cualquier forma de pago por $0." };
  const pagado = conQr ? porCobrar : pagos.reduce((a, p) => a + p.monto, 0);
  if (pagado !== porCobrar) return { error: `Los pagos suman ${formatoDinero(pagado)} y ${anticipo ? "falta por cobrar" : "la venta es de"} ${formatoDinero(porCobrar)}.` };
  if (e.propina.monto > 0 && !equipo.has(e.propina.barberoId)) return { error: "Elige para quién es la propina." };

  // Reparte el descuento manual entre los servicios en proporción a lo que queda después de la promoción.
  let restante = e.descuento;
  const reglas = await reglasDe(bId);
  const ahora = new Date();
  const conceptos = lineas.map((l, i) => {
    const promo = promoDe(i);
    const manual = i === lineas.length - 1 ? restante : Math.floor((e.descuento * (l.s.precio - promo)) / Math.max(neto, 1));
    restante -= manual;
    const desc = promo + manual;
    const cobrado = l.s.precio - desc;
    const promocionId = promo > 0 ? ap.porLinea[i]!.promocionId : null;
    const motivo = [promo > 0 ? `Promoción: ${nombrePromo(promocionId ?? undefined)}` : "", manual > 0 ? e.motivoDescuento : ""].filter(Boolean).join(". ");
    const base = copiaRegla(elegirRegla(reglas, l.barberoId, l.servicioId, ahora));
    // Si el servicio tiene comisión especial, sustituye al porcentaje de quien cobra comisión.
    const regla = base && l.s.comision !== null && (base.tipo === "porcentaje" || base.tipo === "mixto") ? { ...base, porcentaje: l.s.comision } : base;
    return {
      barberiaId: bId, servicioId: l.servicioId, nombreServicio: l.s.nombre, barberoId: l.barberoId, precioLista: l.s.precio,
      descuento: desc, motivoDescuento: desc > 0 ? motivo : null, autorizadoPor: desc > 0 ? s.usuario.id : null,
      precioCobrado: cobrado, reglaComision: regla, comision: comisionDeServicio(regla, cobrado), promocionId,
    };
  });

  const plan: PlanVenta = {
    barberiaId: bId, turnoId: turno.id, usuarioId: s.usuario.id, usuarioNombre: s.usuario.nombre, total, descuentoTotal: descPromo + e.descuento,
    descuento: e.descuento, motivoDescuento: e.motivoDescuento, observaciones: e.observaciones, clave: e.clave, citaId: e.citaId,
    promosUsadas: ap.usadas, nombresPromo: ap.usadas.map((x) => nombrePromo(x)).join(", "), conceptos,
  };
  const propina: PropinaVenta = e.propina.monto > 0 ? { monto: e.propina.monto, barberoId: e.propina.barberoId, efectivo: conQr ? false : e.propina.efectivo } : null;
  const anticipoPago: PagoVenta[] = anticipo > 0 ? [{ metodoPagoId: null, nombreMetodo: anticipoNombre, esEfectivo: false, monto: anticipo }] : [];
  if (conQr) return prepararQr(s, plan, propina, lineas.map((l) => ({ nombre: l.s.nombre, barberoId: l.barberoId, precio: l.s.precio })), anticipo);

  try {
    // Clave del enlace de la encuesta para el cliente: aleatoria, corta y sin datos de la venta.
    const encuesta = randomBytes(9).toString("base64url");
    const { folio } = await db.transaction((tx) => insertarVenta(tx, plan,
      [...pagos.map((p) => ({ metodoPagoId: p.m!.id, nombreMetodo: p.m!.nombre, esEfectivo: p.m!.esEfectivo, monto: p.monto })), ...anticipoPago], propina, encuesta));
    revalidatePath("/", "layout");
    return { ok: true, folio, total, encuesta };
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("cita_cobrada")) return { error: "Esa cita ya se cobró." };
    if (msg.includes("promo_agotada")) return { error: "Una promoción llegó a su límite de usos. Recarga la página para cobrar sin ella." };
    if (msg.includes("ventas_clave_uq")) {
      const [v] = await db.select().from(schema.ventas).where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
      if (v) return { ok: true, folio: v.folio, total: v.total, encuesta: v.tokenEncuesta };
    }
    console.error(err);
    return { error: "No se pudo guardar la venta. Revisa tu conexión e intenta otra vez." };
  }
}

type Sesion = Awaited<ReturnType<typeof requerirSesion>>;

/** Prepara un cobro con QR: guarda la venta calculada y crea el intento de pago en la cuenta del negocio. */
async function prepararQr(s: Sesion, plan: PlanVenta, propina: PropinaVenta, lineas: { nombre: string; barberoId: string; precio: number }[], anticipo: number): Promise<EstadoCobro> {
  const b = s.barberia;
  const base = await origen();
  // Doble clic: si ya hay un cobro con QR pendiente para esta misma venta, se reutiliza.
  const cobro = plan.total - anticipo + (propina?.monto ?? 0);
  // Stripe no acepta cobros con tarjeta menores a $10.
  if (cobro < MINIMO_STRIPE) return { error: `El cobro con QR debe ser de al menos ${formatoDinero(MINIMO_STRIPE)}. Cóbralo con otro método.` };
  const [previo] = await db.select().from(pagosLinea)
    .where(and(eq(pagosLinea.barberiaId, b.id), eq(pagosLinea.estado, "pendiente"), sql`${pagosLinea.intento} is not null`, sql`${pagosLinea.plan}->'plan'->>'clave' = ${plan.clave}`)).limit(1);
  if (previo && Date.now() - previo.creadoEn.getTime() < 25 * 60000) return { qr: { id: previo.id, url: `${base}/pagar/${previo.token}`, total: previo.monto + previo.propina, vence: previo.creadoEn.getTime() + 30 * 60000 } };
  const equipo = await equipoQueAtiende(b.id);
  const nombre = (id: string) => equipo.find((x) => x.id === id)?.nombre.split(" ")[0] ?? "";
  const token = randomBytes(12).toString("base64url");
  const propinaFija = propina?.monto ?? 0;
  let pagoId: string | null = null;
  try {
    const [pago] = await db.insert(pagosLinea).values({
      barberiaId: b.id, tipo: "venta", token, monto: plan.total - anticipo, propina: propinaFija, creadoPor: s.usuario.id,
      plan: { plan, propina, propinaPara: propina?.barberoId ?? lineas[0]?.barberoId ?? "", anticipo },
      detalle: { negocio: b.nombre, conceptos: lineas.map((l) => ({ nombre: l.nombre, con: nombre(l.barberoId), precio: l.precio })), propinaFija: propinaFija > 0, descuento: plan.descuentoTotal, anticipo },
    }).returning();
    pagoId = pago.id;
    const pi = await crearIntento(b.stripeCuenta!, {
      monto: plan.total - anticipo + propinaFija, descripcion: `${b.nombre}: ${lineas.map((l) => l.nombre).join(", ")}`,
      metadata: { pagoId: pago.id, barberiaId: b.id, tipo: "venta" }, clave: `qr-${pago.id}`,
    });
    await db.update(pagosLinea).set({ intento: pi.id }).where(eq(pagosLinea.id, pago.id));
    return { qr: { id: pago.id, url: `${base}/pagar/${token}`, total: plan.total - anticipo + propinaFija, vence: Date.now() + 30 * 60000 } };
  } catch (err) {
    console.error(err);
    // Sin intento de pago el enlace no sirve: se cancela para que no aparezca como pendiente.
    if (pagoId) await db.update(pagosLinea).set({ estado: "cancelado" }).where(eq(pagosLinea.id, pagoId));
    return { error: "No se pudo preparar el cobro con QR. Revisa la conexión con Stripe e intenta otra vez." };
  }
}

export type EstadoQr = { estado: string; folio?: string; total?: number; tarjeta?: string; propina?: number; confirmado?: string; referencia?: string };

/** Estado de un cobro con QR, para la ventana que espera el pago. Si sigue pendiente, se le pregunta a Stripe. */
export async function estadoCobroQr(id: string): Promise<EstadoQr> {
  const s = await requerirSesion();
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return { estado: "desconocido" };
  let [p] = await db.select().from(pagosLinea).where(and(eq(pagosLinea.id, id), eq(pagosLinea.barberiaId, s.barberia.id))).limit(1);
  if (!p) return { estado: "desconocido" };
  if (p.estado === "pendiente") {
    const { verificarPago, vencerSiToca } = await import("@/lib/pagos");
    if (!(await vencerSiToca(p))) await verificarPago(p);
    [p] = await db.select().from(pagosLinea).where(eq(pagosLinea.id, p.id)).limit(1);
  }
  return datosQr(p, s.barberia.zonaHoraria);
}

async function datosQr(p: typeof pagosLinea.$inferSelect, zona: string): Promise<EstadoQr> {
  let folio: string | undefined;
  if (p.ventaId) [{ folio }] = await db.select({ folio: schema.ventas.folio }).from(schema.ventas).where(eq(schema.ventas.id, p.ventaId)).limit(1);
  const confirmado = p.pagadoEn ? new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(p.pagadoEn) : undefined;
  return { estado: p.estado, folio, total: p.monto + p.propina, tarjeta: p.tarjeta, propina: p.propina, confirmado, referencia: p.estado === "pagado" ? p.intento ?? undefined : undefined };
}

const detalleQr = (d: unknown) => {
  const c = ((d as { conceptos?: { nombre: string; con: string }[] })?.conceptos ?? []);
  return `${c.map((x) => x.nombre).join(", ")}${c[0]?.con ? ` con ${c[0].con}` : ""}`;
};

/**
 * Cobros con QR en espera de quien cobra (o de todo el negocio, para quien ve todas las ventas).
 * También avisa cuáles de los que se estaban siguiendo ya se resolvieron (pagados, cancelados o vencidos).
 */
export type CobroQrHoy = { id: string; estado: string; total: number; detalle: string; hora: string; folio?: string };

export async function cobrosQrEnEspera(seguidos: string[] = []): Promise<{ pendientes: CobroQrAbierto[]; resueltos: (EstadoQr & { id: string; detalle: string })[]; hoy: CobroQrHoy[] }> {
  const s = await requerirSesion();
  if (!s.barberia.stripeCuenta) return { pendientes: [], resueltos: [], hoy: [] };
  const { verificarPago, vencerSiToca, VIGENCIA_QR_MIN } = await import("@/lib/pagos");
  const propios = s.puede("ventas.ver_todas") ? [] : [eq(pagosLinea.creadoPor, s.usuario.id)];
  const pend = await db.select().from(pagosLinea)
    .where(and(eq(pagosLinea.barberiaId, s.barberia.id), eq(pagosLinea.tipo, "venta"), eq(pagosLinea.estado, "pendiente"), ...propios)).limit(10);
  for (const p of pend) if (!(await vencerSiToca(p))) await verificarPago(p);
  const ids = [...new Set([...pend.map((p) => p.id), ...seguidos.filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20)])];
  const ahora = ids.length ? await db.select().from(pagosLinea).where(and(eq(pagosLinea.barberiaId, s.barberia.id), inArray(pagosLinea.id, ids))) : [];
  const base = await origen();
  const pendientes = ahora.filter((p) => p.estado === "pendiente").sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime())
    .map((p) => ({ id: p.id, url: `${base}/pagar/${p.token}`, total: p.monto + p.propina, vence: p.creadoEn.getTime() + VIGENCIA_QR_MIN * 60000, detalle: detalleQr(p.detalle) }));
  const resueltos = await Promise.all(ahora.filter((p) => p.estado !== "pendiente" && seguidos.includes(p.id)).map(async (p) => ({ id: p.id, detalle: detalleQr(p.detalle), ...(await datosQr(p, s.barberia.zonaHoraria)) })));
  // Cobros con QR de hoy ya resueltos (pagados, vencidos o cancelados), para revisar desde Cobro.
  const zona = s.barberia.zonaHoraria;
  const fmt = new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false });
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  const hoyTxt = dia.format(new Date());
  const recientes = await db.select({ id: pagosLinea.id, estado: pagosLinea.estado, monto: pagosLinea.monto, propina: pagosLinea.propina, detalle: pagosLinea.detalle, creadoEn: pagosLinea.creadoEn, folio: schema.ventas.folio })
    .from(pagosLinea).leftJoin(schema.ventas, eq(schema.ventas.id, pagosLinea.ventaId))
    .where(and(eq(pagosLinea.barberiaId, s.barberia.id), eq(pagosLinea.tipo, "venta"), sql`${pagosLinea.creadoEn} > now() - interval '24 hours'`, sql`${pagosLinea.estado} <> 'pendiente'`, ...propios))
    .orderBy(sql`${pagosLinea.creadoEn} desc`).limit(20);
  const hoy = recientes.filter((x) => dia.format(x.creadoEn) === hoyTxt)
    .map((x) => ({ id: x.id, estado: x.estado, total: x.monto + x.propina, detalle: detalleQr(x.detalle), hora: fmt.format(x.creadoEn), folio: x.folio ?? undefined }));
  return { pendientes, resueltos, hoy };
}

/** Cancela un cobro con QR que todavía no se paga (al cerrar la ventana). */
export async function cancelarCobroQr(id: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await requerirSesion();
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return { error: "Cobro no encontrado." };
  const [p] = await db.select().from(pagosLinea).where(and(eq(pagosLinea.id, id), eq(pagosLinea.barberiaId, s.barberia.id))).limit(1);
  if (!p || p.estado !== "pendiente") return { ok: true };
  try {
    if (p.intento && s.barberia.stripeCuenta) await stripe().paymentIntents.cancel(p.intento, {}, { stripeAccount: s.barberia.stripeCuenta });
  } catch (err) {
    // Si Stripe ya lo cobró, el aviso de Stripe registra la venta; no se marca como cancelado.
    const pi = p.intento && s.barberia.stripeCuenta ? await stripe().paymentIntents.retrieve(p.intento, {}, { stripeAccount: s.barberia.stripeCuenta }).catch(() => null) : null;
    if (pi?.status === "succeeded" || pi?.status === "processing") return { error: "El cliente ya pagó; la venta se registrará en unos segundos." };
    console.error(err);
  }
  await db.update(pagosLinea).set({ estado: "cancelado" }).where(and(eq(pagosLinea.id, p.id), eq(pagosLinea.estado, "pendiente")));
  return { ok: true };
}
