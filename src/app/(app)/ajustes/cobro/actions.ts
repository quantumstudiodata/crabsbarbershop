"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

const R = "/ajustes/cobro";

export type EstadoAjuste = { ok?: boolean; error?: string; n?: number };

async function metodoDe(barberiaId: string, id: string) {
  const [m] = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.id, String(id)), eq(schema.metodosPago.barberiaId, barberiaId))).limit(1);
  return m;
}

export async function alternarMetodo(id: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("ajustes.funciones");
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
  const s = await requerirSesion("ajustes.funciones");
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
  const s = await requerirSesion("ajustes.funciones");
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
  const s = await requerirSesion("ajustes.funciones");
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

const PERIODOS_G = ["semanal", "quincenal", "mensual"];
const METODOS_G = ["efectivo", "transferencia", "tarjeta"];

export async function agregarConcepto(_: EstadoAjuste, form: FormData): Promise<EstadoAjuste> {
  const s = await requerirSesion("ajustes.funciones");
  const concepto = texto(form, "concepto", 120);
  const categoria = texto(form, "categoria", 60);
  const monto = leerPesos(texto(form, "monto")) ?? 0;
  const metodo = METODOS_G.includes(texto(form, "metodo")) ? texto(form, "metodo") : "efectivo";
  const periodicidad = PERIODOS_G.includes(texto(form, "periodicidad")) ? texto(form, "periodicidad") : "mensual";
  if (concepto.length < 2) return { error: "Escribe el concepto." };
  if (monto < 0 || monto > 100_000_000) return { error: "Revisa la cantidad." };
  const [cat] = await db.select({ id: schema.categoriasGasto.id }).from(schema.categoriasGasto).where(and(eq(schema.categoriasGasto.barberiaId, s.barberia.id), eq(schema.categoriasGasto.nombre, categoria)));
  if (!cat) return { error: "Elige una categoría." };
  await db.insert(schema.conceptosFrecuentes).values({ barberiaId: s.barberia.id, concepto, categoria, monto, metodo, periodicidad });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} agregó el concepto frecuente ${concepto}`, detalle: { categoria, monto, metodo, periodicidad } });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export async function quitarConcepto(id: string): Promise<EstadoAjuste> {
  const s = await requerirSesion("ajustes.funciones");
  const [c] = await db.select().from(schema.conceptosFrecuentes).where(and(eq(schema.conceptosFrecuentes.id, String(id)), eq(schema.conceptosFrecuentes.barberiaId, s.barberia.id)));
  if (!c) return { error: "No se encontró." };
  await db.delete(schema.conceptosFrecuentes).where(eq(schema.conceptosFrecuentes.id, c.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} quitó el concepto frecuente ${c.concepto}` });
  revalidatePath("/", "layout");
  return { ok: true, n: Date.now() };
}

export async function agregarMetodo(form: FormData) {
  const s = await requerirSesion("ajustes.funciones");
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
  const s = await requerirSesion("ajustes.funciones");
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
  propinas: ["usaPropinas", "Propinas"],
  descuentos: ["usaDescuentos", "Descuentos"],
  dividir: ["usaDividirPago", "Dividir pago"],
  metas: ["usaMetas", "Metas de ventas"],
  renta: ["usaRentaSilla", "Renta de silla"],
  apertura: ["aperturaManual", "Apertura de caja"],
  comprobantes: ["usaComprobantes", "Registro de comprobantes"],
  periodicidad: ["usaPeriodicidad", "Periodicidad de gastos"],
} as const;

export async function alternarFuncion(clave: string) {
  const s = await requerirSesion("ajustes.funciones");
  const f = FUNCIONES[clave as keyof typeof FUNCIONES];
  if (!f) return;
  const [campo, nombre] = f;
  const antes = s.barberia[campo];
  await db.update(schema.barberias).set({ [campo]: !antes }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, {
    barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste",
    accion: `${s.usuario.nombre} ${antes ? "apagó" : "encendió"} la función ${nombre}`,
    detalle: { antes: antes ? "Encendida" : "Apagada", ahora: antes ? "Apagada" : "Encendida" },
  });
  revalidatePath("/", "layout");
}
