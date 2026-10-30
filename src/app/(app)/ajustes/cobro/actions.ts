"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

const R = "/ajustes/cobro";

export async function alternarMetodo(id: string) {
  const s = await requerirSesion("ajustes.negocio");
  const [m] = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.id, String(id)), eq(schema.metodosPago.barberiaId, s.barberia.id))).limit(1);
  if (!m || m.esEfectivo) return; // El efectivo siempre está activo.
  await db.update(schema.metodosPago).set({ activo: !m.activo }).where(eq(schema.metodosPago.id, m.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${m.activo ? "desactivó" : "activó"} la forma de pago ${m.nombre}` });
  revalidatePath("/", "layout");
}

export async function agregarMetodo(form: FormData) {
  const s = await requerirSesion("ajustes.negocio");
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
  const s = await requerirSesion("ajustes.negocio");
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
} as const;

export async function alternarFuncion(clave: string) {
  const s = await requerirSesion("ajustes.negocio");
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
