"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

const R = "/ajustes/servicios";

export async function guardarServicio(form: FormData) {
  const s = await requerirSesion("ajustes.negocio");
  const id = texto(form, "id", 40);
  const nombre = texto(form, "nombre", 60);
  const descripcion = texto(form, "descripcion", 200);
  const precio = leerPesos(texto(form, "precio"));
  const duracion = Number(texto(form, "duracion", 4));
  const activo = form.get("activo") !== "no";
  if (!nombre || precio === null || precio <= 0) volver(R, { error: "Escribe el nombre y el precio del servicio." });
  if (!Number.isInteger(duracion) || duracion < 5 || duracion > 480) volver(R, { error: "La duración va de 5 a 480 minutos." });
  if (id) {
    const [actual] = await db.select().from(schema.servicios).where(and(eq(schema.servicios.id, id), eq(schema.servicios.barberiaId, s.barberia.id))).limit(1);
    if (!actual) volver(R, { error: "No se encontró el servicio." });
    await db.transaction(async (tx) => {
      await tx.update(schema.servicios).set({ nombre, descripcion, precio, duracionMin: duracion, activo }).where(eq(schema.servicios.id, id));
      if (actual.precio !== precio) {
        await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} cambió el precio de ${nombre}`, detalle: { antes: formatoDinero(actual.precio), ahora: formatoDinero(precio) } });
      }
      if (actual.activo !== activo || actual.nombre !== nombre) {
        await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó el servicio ${nombre}${actual.activo !== activo ? (activo ? " y lo activó" : " y lo ocultó") : ""}` });
      }
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(schema.servicios).values({ barberiaId: s.barberia.id, nombre, descripcion, precio, duracionMin: duracion, orden: 100 });
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} agregó el servicio ${nombre} a ${formatoDinero(precio)}` });
    });
  }
  revalidatePath(R);
  volver(R, { aviso: "guardado" });
}

export async function guardarMetodo(form: FormData) {
  const s = await requerirSesion("ajustes.negocio");
  const id = texto(form, "id", 40);
  const nombre = texto(form, "nombre", 40);
  const esEfectivo = form.get("efectivo") === "si";
  const activo = form.get("activo") !== "no";
  if (!nombre) volver(R, { error: "Escribe el nombre de la forma de pago." });
  if (id) {
    await db.update(schema.metodosPago).set({ nombre, esEfectivo, activo }).where(and(eq(schema.metodosPago.id, id), eq(schema.metodosPago.barberiaId, s.barberia.id)));
  } else {
    await db.insert(schema.metodosPago).values({ barberiaId: s.barberia.id, nombre, esEfectivo, orden: 100 });
  }
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} guardó la forma de pago ${nombre}` });
  revalidatePath(R);
  volver(R, { aviso: "guardado" });
}

export async function guardarNegocio(form: FormData) {
  const s = await requerirSesion("ajustes.negocio");
  const pct = Number(texto(form, "limiteDescuento", 3));
  const dif = leerPesos(texto(form, "limiteDiferencia"));
  const meta = leerPesos(texto(form, "meta")) ?? 0;
  if (!Number.isInteger(pct) || pct < 0 || pct > 100 || dif === null) volver(R, { error: "Revisa los límites: el descuento va de 0 a 100%." });
  await db.update(schema.barberias).set({ limiteDescuentoPct: pct, limiteDiferenciaCaja: dif, metaDiaria: meta }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió los límites del negocio`, detalle: { descuentoMaximo: `${pct}%`, diferenciaCaja: formatoDinero(dif) } });
  revalidatePath("/", "layout");
  volver(R, { aviso: "guardado" });
}
