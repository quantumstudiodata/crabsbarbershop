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
  const b = s.barberia;
  const cambios: Partial<typeof schema.barberias.$inferInsert> = {};
  if (form.has("descuento")) {
    const pct = num("descuento");
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) volver(R, { error: "El descuento va de 0 a 100%." });
    cambios.limiteDescuentoPct = pct;
  }
  if (form.has("diferencia")) cambios.limiteDiferenciaCaja = num("diferencia") * 100;
  if (form.has("meta")) cambios.metaDiaria = num("meta") * 100;
  if (form.has("fondo")) cambios.fondoPredeterminado = num("fondo") * 100;
  await db.update(schema.barberias).set(cambios).where(eq(schema.barberias.id, b.id));
  // Antes y después, para el historial.
  const txt = (pct: number, dif: number, meta: number, fondo: number) => `descuento máximo ${pct}%, diferencia ${formatoDinero(dif)}, meta diaria ${formatoDinero(meta)}, fondo ${formatoDinero(fondo)}`;
  await registrar(db, {
    barberiaId: b.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió las reglas de cobro y caja`,
    detalle: {
      antes: txt(b.limiteDescuentoPct, b.limiteDiferenciaCaja, b.metaDiaria, b.fondoPredeterminado),
      ahora: txt(cambios.limiteDescuentoPct ?? b.limiteDescuentoPct, cambios.limiteDiferenciaCaja ?? b.limiteDiferenciaCaja, cambios.metaDiaria ?? b.metaDiaria, cambios.fondoPredeterminado ?? b.fondoPredeterminado),
    },
  });
  revalidatePath("/", "layout");
  volver(R, { aviso: "guardado" });
}
