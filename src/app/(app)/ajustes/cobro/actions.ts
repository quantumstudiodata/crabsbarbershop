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

export async function guardarReglas(form: FormData) {
  const s = await requerirSesion("ajustes.negocio");
  const num = (k: string) => Number(texto(form, k, 9).replace(/\D/g, ""));
  const pct = num("descuento"), dif = num("diferencia") * 100, meta = num("meta") * 100;
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) volver(R, { error: "El descuento va de 0 a 100%." });
  await db.update(schema.barberias).set({ limiteDescuentoPct: pct, limiteDiferenciaCaja: dif, metaDiaria: meta }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió las reglas de cobro y caja`, detalle: { descuentoMaximo: `${pct}%`, diferenciaCaja: formatoDinero(dif), metaDiaria: formatoDinero(meta) } });
  revalidatePath("/", "layout");
  volver(R, { aviso: "guardado" });
}
