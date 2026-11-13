"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";
import { fechaLocal } from "@/lib/fechas";

const R = "/ajustes/cobro";

export type EstadoAjuste = { ok?: boolean; error?: string; n?: number; id?: string };

async function metodoDe(barberiaId: string, id: string) {
  const [m] = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.id, String(id)), eq(schema.metodosPago.barberiaId, barberiaId))).limit(1);
  return m;
}

export async function alternarMetodo(id: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.cobros");
  const m = await metodoDe(s.barberia.id, id);
  if (!m) return { error: "No se encontró esa forma de pago." };
  if (m.activo) {
    const activos = await db.select({ id: schema.metodosPago.id }).from(schema.metodosPago).where(and(eq(schema.metodosPago.barberiaId, s.barberia.id), eq(schema.metodosPago.activo, true)));
    if (activos.length <= 1) return { error: "Debe quedar al menos una forma de pago activa." };
  }
  await db.update(schema.metodosPago).set({ activo: !m.activo }).where(eq(schema.metodosPago.id, m.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${m.activo ? "desactivó" : "activó"} la forma de pago ${m.nombre}` });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export async function renombrarMetodo(id: string, nombre: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.cobros");
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (limpio.length < 2) return { error: "Escribe el nombre." };
  const m = await metodoDe(s.barberia.id, id);
  if (!m) return { error: "No se encontró esa forma de pago." };
  if (m.nombre === limpio) return { ok: true, n: Date.now() };
  // El nombre que quedó guardado en cada cobro no cambia: así el historial dice lo que se usó entonces.
  await db.update(schema.metodosPago).set({ nombre: limpio }).where(eq(schema.metodosPago.id, m.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió el nombre de la forma de pago ${m.nombre}`, detalle: { antes: m.nombre, ahora: limpio } });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

/** Eliminar una forma de pago. Los cobros que ya la usaron conservan su nombre, así que el historial no cambia. */
export async function eliminarMetodo(id: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.cobros");
  const m = await metodoDe(s.barberia.id, id);
  if (!m) return { error: "No se encontró esa forma de pago." };
  if (m.esEfectivo) return { error: "El efectivo no se elimina; si no lo usan, desactívalo." };
  const activos = await db.select({ id: schema.metodosPago.id }).from(schema.metodosPago).where(and(eq(schema.metodosPago.barberiaId, s.barberia.id), eq(schema.metodosPago.activo, true)));
  if (m.activo && activos.length <= 1) return { error: "Debe quedar al menos una forma de pago activa." };
  await db.transaction(async (tx) => {
    await tx.update(schema.pagos).set({ metodoPagoId: null }).where(and(eq(schema.pagos.metodoPagoId, m.id), eq(schema.pagos.barberiaId, s.barberia.id)));
    await tx.delete(schema.metodosPago).where(eq(schema.metodosPago.id, m.id));
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} eliminó la forma de pago ${m.nombre}` });
  });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

/** Caja compartida o una por trabajador. Solo se cambia con todas las cajas cerradas. */
export async function cambiarModeloCaja(valor: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.caja");
  const modelo = valor === "individual" ? "individual" : "compartida";
  if (modelo === s.barberia.modeloCaja) return { ok: true, n: Date.now() };
  const abiertas = await db.select({ id: schema.turnosCaja.id }).from(schema.turnosCaja).where(and(eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "abierto")));
  if (abiertas.length) return { error: "Primero haz el corte de las cajas abiertas; después cambia el modelo de caja." };
  await db.update(schema.barberias).set({ modeloCaja: modelo }).where(eq(schema.barberias.id, s.barberia.id));
  const nombre = (m: string) => (m === "individual" ? "caja individual por trabajador" : "caja compartida");
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió el modelo de caja`, detalle: { antes: nombre(s.barberia.modeloCaja), ahora: nombre(modelo) } });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

const PERIODOS_G = ["diaria", "semanal", "quincenal", "mensual"];
const METODOS_G = ["efectivo", "transferencia", "tarjeta"];

/** Guarda un gasto frecuente (nuevo o editado). Es solo una plantilla: no genera egresos por sí solo. */
export async function agregarConcepto(_: EstadoAjuste, form: FormData): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.egresos");
  const id = texto(form, "id", 40);
  const concepto = texto(form, "concepto", 120);
  const categoria = texto(form, "categoria", 60);
  const monto = leerPesos(texto(form, "monto")) ?? 0;
  const metodo = METODOS_G.includes(texto(form, "metodo")) ? texto(form, "metodo") : "efectivo";
  const periodicidad = PERIODOS_G.includes(texto(form, "periodicidad")) ? texto(form, "periodicidad") : "";
  if (concepto.length < 2) return { error: "Escribe el nombre del gasto." };
  if (monto < 0 || monto > 100_000_000) return { error: "Revisa la cantidad." };
  const automatico = texto(form, "automatico") === "si" && ["semanal", "quincenal", "mensual"].includes(periodicidad);
  const dia = Math.min(Math.max(Number(texto(form, "dia")) || 1, periodicidad === "semanal" ? 0 : 1), periodicidad === "semanal" ? 6 : 28);
  if (automatico && monto <= 0) return { error: "Para que se registre solo necesita un importe fijo." };
  // Al activarlo empieza a contar desde hoy: lo anterior ya se registró a mano.
  const hoyNeg = fechaLocal(new Date(), s.barberia.zonaHoraria);
  const [cat] = await db.select({ id: schema.categoriasGasto.id }).from(schema.categoriasGasto).where(and(eq(schema.categoriasGasto.barberiaId, s.barberia.id), eq(schema.categoriasGasto.nombre, categoria)));
  if (!cat) return { error: "Elige una categoría." };
  if (id) {
    const [c] = await db.select().from(schema.conceptosFrecuentes).where(and(eq(schema.conceptosFrecuentes.id, id), eq(schema.conceptosFrecuentes.barberiaId, s.barberia.id)));
    if (!c) return { error: "No se encontró el gasto frecuente." };
    await db.update(schema.conceptosFrecuentes).set({ concepto, categoria, monto, metodo, periodicidad, automatico, dia, ultimo: automatico ? (c.automatico ? c.ultimo : hoyNeg) : null }).where(eq(schema.conceptosFrecuentes.id, c.id));
    await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó el gasto frecuente ${concepto}`, detalle: { antes: `${c.concepto}, ${c.categoria}, ${c.monto ? formatoDinero(c.monto) : "sin importe"}`, ahora: `${concepto}, ${categoria}, ${monto ? formatoDinero(monto) : "sin importe"}` } });
    revalidatePath("/", "layout");
    return { ok: true, n: Date.now() };
  }
  await db.insert(schema.conceptosFrecuentes).values({ barberiaId: s.barberia.id, concepto, categoria, monto, metodo, periodicidad, automatico, dia, ultimo: automatico ? hoyNeg : null });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} agregó el gasto frecuente ${concepto}`, detalle: { categoria, monto, metodo, periodicidad } });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export async function quitarConcepto(id: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.egresos");
  const [c] = await db.select().from(schema.conceptosFrecuentes).where(and(eq(schema.conceptosFrecuentes.id, String(id)), eq(schema.conceptosFrecuentes.barberiaId, s.barberia.id)));
  if (!c) return { error: "No se encontró." };
  await db.delete(schema.conceptosFrecuentes).where(eq(schema.conceptosFrecuentes.id, c.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} quitó el gasto frecuente ${c.concepto}` });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export async function agregarMetodo(form: FormData) {
  const s = await requerirSesion("configuracion.cobros");
  const nombre = texto(form, "nombre", 40);
  if (!nombre) volver(R, { error: "Escribe el nombre de la forma de pago." });
  await db.insert(schema.metodosPago).values({ barberiaId: s.barberia.id, nombre, esEfectivo: false, orden: 100 });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} agregó la forma de pago ${nombre}` });
  revalidatePath("/", "layout");
  volver(R, { aviso: "guardado" });
}

export type EstadoReglas = { ok?: boolean; error?: string; n?: number };

/** Guarda sin recargar la página: el botón pasa a "Guardado". */
export async function guardarReglas(_: EstadoReglas, form: FormData): Promise<EstadoReglas> {
  const s = await requerirSesion();
  // Cada apartado se protege con su propio permiso.
  if (form.has("descuento") && !s.puede("configuracion.cobros")) return { error: "No tienes permiso para cambiar las reglas de cobro." };
  if ((form.has("diferencia") || form.has("fondo")) && !s.puede("configuracion.caja")) return { error: "No tienes permiso para cambiar la caja." };
  if ((form.has("meta") || form.has("metaMensual")) && !s.puede("configuracion.metas")) return { error: "No tienes permiso para cambiar las metas." };
  const num = (k: string) => Number(texto(form, k, 9).replace(/\D/g, ""));
  const b = s.barberia;
  const cambios: Partial<typeof schema.barberias.$inferInsert> = {};
  if (form.has("descuento")) {
    const pct = num("descuento");
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { error: "La autorización de descuentos va de 0 a 100%." };
    cambios.limiteDescuentoPct = pct;
  }
  if (form.has("diferencia")) cambios.limiteDiferenciaCaja = num("diferencia") * 100;
  if (form.has("meta")) cambios.metaDiaria = num("meta") * 100;
  if (form.has("metaMensual")) {
    const m = num("metaMensual");
    if (!Number.isInteger(m) || m < 0 || m > 10_000_000) return { error: "Revisa la meta mensual." };
    cambios.metaMensual = m * 100;
  }
  if (form.has("fondo")) cambios.fondoPredeterminado = num("fondo") * 100;
  if (Object.keys(cambios).length === 0) return { ok: true, n: Date.now() };
  await db.update(schema.barberias).set(cambios).where(eq(schema.barberias.id, b.id));
  // Antes y después, para el historial.
  const txt = (pct: number, dif: number, meta: number, fondo: number) => `descuento sin autorización hasta ${pct}%, diferencia ${formatoDinero(dif)}, meta mensual ${meta ? formatoDinero(meta) : "sin meta"}, fondo ${formatoDinero(fondo)}`;
  await registrar(db, {
    barberiaId: b.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió las reglas de cobro y caja`,
    detalle: {
      antes: txt(b.limiteDescuentoPct, b.limiteDiferenciaCaja, b.metaMensual, b.fondoPredeterminado),
      ahora: txt(cambios.limiteDescuentoPct ?? b.limiteDescuentoPct, cambios.limiteDiferenciaCaja ?? b.limiteDiferenciaCaja, cambios.metaMensual ?? b.metaMensual, cambios.fondoPredeterminado ?? b.fondoPredeterminado),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

const FUNCIONES = {
  propinas: ["usaPropinas", "Propinas", "configuracion.cobros"],
  descuentos: ["usaDescuentos", "Descuentos", "configuracion.cobros"],
  dividir: ["usaDividirPago", "Dividir pago", "configuracion.cobros"],
  metas: ["usaMetas", "Metas de ventas", "configuracion.metas"],
  promociones: ["usaPromociones", "Promociones", "configuracion.cobros"],
  reembolsos: ["aceptaReembolsos", "Aceptar reembolsos", "configuracion.cobros"],
  apertura: ["aperturaManual", "Apertura de caja", "configuracion.caja"],
  corte: ["corteObligatorio", "Cierre de caja obligatorio", "configuracion.caja"],
  evidencia: ["usaEvidenciaCorte", "Evidencias del corte de caja", "configuracion.caja"],
  comprobantes: ["usaComprobantes", "Registro de comprobantes", "configuracion.egresos"],
  obligatorio: ["comprobanteObligatorio", "Comprobante obligatorio en egresos", "configuracion.egresos"],
  periodicidad: ["usaPeriodicidad", "Periodicidad de gastos", "configuracion.egresos"],
  pagosAuto: ["pagosEquipoAuto", "Pagos al equipo automáticos", "configuracion.egresos"],
  rentasAuto: ["rentasAuto", "Renta de silla automática", "configuracion.egresos"],
} as const;

export async function alternarFuncion(clave: string) {
  const f = FUNCIONES[clave as keyof typeof FUNCIONES];
  if (!f) return;
  const [campo, nombre, permiso] = f;
  const s = await requerirSesion(permiso);
  const antes = s.barberia[campo];
  // Al encender los pagos automáticos, la cuenta del equipo empieza desde hoy: lo anterior no se paga solo.
  const hoy = fechaLocal(new Date(), s.barberia.zonaHoraria);
  const extra = antes ? {} : campo === "pagosEquipoAuto" ? { pagosEquipoDesde: hoy } : campo === "rentasAuto" ? { rentasDesde: hoy } : {};
  await db.update(schema.barberias).set({ [campo]: !antes, ...extra }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, {
    barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste",
    accion: `${s.usuario.nombre} ${antes ? "apagó" : "encendió"} la función ${nombre}`,
    detalle: { antes: antes ? "Encendida" : "Apagada", ahora: antes ? "Apagada" : "Encendida" },
  });
  revalidatePath("/", "layout");
}

/** Formas de pago que se pueden usar al registrar un egreso. Siempre queda al menos una. */
export async function alternarMetodoEgreso(metodo: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.egresos");
  if (!METODOS_G.includes(metodo)) return { error: "Método no válido." };
  const actual = s.barberia.metodosEgreso;
  const nuevo = actual.includes(metodo) ? actual.filter((m) => m !== metodo) : METODOS_G.filter((m) => m === metodo || actual.includes(m));
  if (nuevo.length === 0) return { error: "Deja al menos una forma de pago para los egresos." };
  await db.update(schema.barberias).set({ metodosEgreso: nuevo }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${actual.includes(metodo) ? "apagó" : "encendió"} ${metodo} para egresos`, detalle: { antes: actual.join(", "), ahora: nuevo.join(", ") } });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

/** Crear o editar una forma de pago (nombre y descripción opcional). */
export async function guardarMetodo(d: { id?: string; nombre: string; descripcion?: string }): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.cobros");
  const nombre = String(d.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  const descripcion = String(d.descripcion ?? "").trim().slice(0, 120);
  if (nombre.length < 2) return { error: "Escribe el nombre de la forma de pago." };
  if (d.id) {
    const m = await metodoDe(s.barberia.id, d.id);
    if (!m) return { error: "No se encontró esa forma de pago." };
    // El nombre que quedó guardado en cada cobro no cambia: así el historial dice lo que se usó entonces.
    await db.update(schema.metodosPago).set({ nombre, descripcion }).where(eq(schema.metodosPago.id, m.id));
    if (m.nombre !== nombre) await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió el nombre de la forma de pago ${m.nombre}`, detalle: { antes: m.nombre, ahora: nombre } });
    revalidatePath("/", "layout");
    return { ok: true, n: Date.now(), id: m.id };
  }
  const [m] = await db.insert(schema.metodosPago).values({ barberiaId: s.barberia.id, nombre, descripcion, esEfectivo: false, orden: 100 }).returning({ id: schema.metodosPago.id });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} agregó la forma de pago ${nombre}` });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now(), id: m.id };
}

/** Conectar la cuenta de Stripe del negocio: crea su cuenta (la primera vez) y devuelve el enlace para completar sus datos en Stripe. */
export async function conectarStripe(): Promise<{ url?: string; error?: string }> {
  const s = await requerirSesion("configuracion.cobros");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const { pagosDisponibles, origen, crearCuentaNegocio, enlaceAltaNegocio } = await import("@/lib/stripe");
  if (!pagosDisponibles()) return { error: "Los pagos en línea todavía no están disponibles." };
  try {
    let cuenta = s.barberia.stripeCuenta;
    if (!cuenta) {
      cuenta = await crearCuentaNegocio({ id: s.barberia.id, nombre: s.barberia.nombre });
      await db.update(schema.barberias).set({ stripeCuenta: cuenta, stripeEstado: "pendiente" }).where(eq(schema.barberias.id, s.barberia.id));
      await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} empezó a conectar la cuenta de Stripe del negocio` });
    }
    const base = await origen();
    return { url: await enlaceAltaNegocio(cuenta, `${base}${R}?stripe=volver`, `${base}${R}?stripe=reintentar`) };
  } catch (err) {
    console.error(err);
    return { error: "No se pudo abrir Stripe. Intenta de nuevo en un momento." };
  }
}

/** Consulta en Stripe si la cuenta del negocio ya puede cobrar (al regresar de Stripe). */
export async function revisarStripe(): Promise<{ estado?: string; error?: string }> {
  const s = await requerirSesion("configuracion.cobros");
  if (!s.barberia.stripeCuenta) return { estado: "sin" };
  const { pagosDisponibles, estadoCuentaNegocio } = await import("@/lib/stripe");
  if (!pagosDisponibles()) return { estado: s.barberia.stripeEstado };
  try {
    const estado = await estadoCuentaNegocio(s.barberia.stripeCuenta);
    if (estado !== s.barberia.stripeEstado) {
      await db.update(schema.barberias).set({ stripeEstado: estado }).where(eq(schema.barberias.id, s.barberia.id));
      if (estado === "activa") await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} conectó la cuenta de Stripe: ya se pueden cobrar pagos en línea` });
      revalidatePath("/", "layout");
    }
    return { estado };
  } catch (err) {
    console.error(err);
    return { error: "No se pudo consultar Stripe." };
  }
}

/** La cuenta propia del negocio para recibir transferencias. La CLABE se valida con su dígito de control. */
export async function guardarCuentaTransferencia(d: { banco: string; clabe: string; titular: string; whatsapp?: string }): Promise<EstadoAjuste> {
  const s = await requerirSesion("configuracion.cobros");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const clabe = String(d.clabe ?? "").replace(/\D/g, "");
  const banco = String(d.banco ?? "").trim().slice(0, 40);
  const titular = String(d.titular ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  // Se acepta la CLABE (18 dígitos) o el número de una tarjeta de débito (16 dígitos): las dos reciben transferencias.
  const problema = clabe ? revisarCuenta(clabe) : null;
  if (problema) return { error: problema };
  if (clabe && (!banco || titular.length < 3)) return { error: "Escribe el banco y el nombre del titular de la cuenta." };
  const wa = String(d.whatsapp ?? "").replace(/\D/g, "");
  if (wa && (wa.length < 10 || wa.length > 13)) return { error: "El WhatsApp debe tener 10 dígitos." };
  await db.update(schema.barberias).set({ whatsapp: wa, transferenciaClabe: clabe, transferenciaBanco: clabe ? banco : "", transferenciaTitular: clabe ? titular : "" }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: clabe ? `${s.usuario.nombre} guardó la cuenta para transferencias (termina en ${clabe.slice(-4)})` : `${s.usuario.nombre} quitó la cuenta para transferencias` });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

function revisarCuenta(c: string): string | null {
  if (c.length === 18) return clabeValida(c) ? null : "Esa CLABE no es válida: el último dígito no coincide. Cópiala de nuevo desde tu banco.";
  if (c.length === 16) return tarjetaValida(c) ? null : "Ese número de tarjeta no es válido. Revisa que esté bien escrito.";
  return `Escribiste ${c.length} dígitos. La CLABE tiene 18 y el número de tarjeta 16.`;
}

/** Algoritmo de Luhn: el que usan todas las tarjetas para su último dígito. */
function tarjetaValida(c: string) {
  let suma = 0;
  for (let i = 0; i < c.length; i++) {
    let d = Number(c[c.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
  }
  return suma % 10 === 0;
}

function clabeValida(c: string) {
  if (!/^\d{18}$/.test(c)) return false;
  const pesos = [3, 7, 1];
  const suma = c.slice(0, 17).split("").reduce((a, x, i) => a + ((Number(x) * pesos[i % 3]) % 10), 0);
  return (10 - (suma % 10)) % 10 === Number(c[17]);
}
