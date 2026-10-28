"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";

export type Resultado = { error?: string; mensaje?: string };
const R = "/ajustes/servicios";

async function servicioDe(barberiaId: string, id: string) {
  const [x] = await db.select().from(schema.servicios).where(and(eq(schema.servicios.id, id), eq(schema.servicios.barberiaId, barberiaId))).limit(1);
  return x ?? null;
}

export async function guardarServicio(d: { id?: string; nombre: string; categoria: string; precio: string; duracion: string }): Promise<Resultado> {
  const s = await requerirSesion("ajustes.negocio");
  const nombre = String(d.nombre ?? "").trim().slice(0, 60);
  const categoria = String(d.categoria ?? "").trim().slice(0, 40) || "Cortes";
  const precio = leerPesos(String(d.precio ?? ""));
  const duracion = Number(d.duracion);
  if (!nombre || precio === null || precio <= 0) return { error: "Escribe el nombre y el precio." };
  if (!Number.isInteger(duracion) || duracion < 5 || duracion > 480) return { error: "La duración va de 5 a 480 minutos." };
  if (d.id) {
    const actual = await servicioDe(s.barberia.id, d.id);
    if (!actual) return { error: "No se encontró el servicio." };
    await db.transaction(async (tx) => {
      await tx.update(schema.servicios).set({ nombre, categoria, precio, duracionMin: duracion }).where(eq(schema.servicios.id, actual.id));
      if (actual.precio !== precio) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} cambió el precio de ${nombre}`, detalle: { antes: formatoDinero(actual.precio), ahora: formatoDinero(precio) } });
      else if (actual.nombre !== nombre || actual.categoria !== categoria || actual.duracionMin !== duracion) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó el servicio ${nombre}` });
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(schema.servicios).values({ barberiaId: s.barberia.id, nombre, categoria, precio, duracionMin: duracion, orden: 100 });
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} agregó el servicio ${nombre} a ${formatoDinero(precio)}` });
    });
  }
  revalidatePath(R);
  return { mensaje: "Guardado." };
}

/** Mostrar u ocultar en Cobro. */
export async function alternarServicio(id: string): Promise<Resultado> {
  const s = await requerirSesion("ajustes.negocio");
  const x = await servicioDe(s.barberia.id, String(id));
  if (!x) return { error: "No se encontró el servicio." };
  await db.update(schema.servicios).set({ activo: !x.activo }).where(eq(schema.servicios.id, x.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${x.activo ? "ocultó" : "volvió a mostrar"} el servicio ${x.nombre}` });
  revalidatePath(R);
  return {};
}

/** Se borra solo si nunca se cobró. Si ya tiene ventas, se oculta para no perder el historial. */
export async function eliminarServicio(id: string): Promise<Resultado> {
  const s = await requerirSesion("ajustes.negocio");
  const x = await servicioDe(s.barberia.id, String(id));
  if (!x) return { error: "No se encontró el servicio." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.conceptos).where(eq(schema.conceptos.servicioId, x.id));
  const [{ r }] = await db.select({ r: sql<number>`count(*)::int` }).from(schema.reglasComision).where(eq(schema.reglasComision.servicioId, x.id));
  if (n > 0 || r > 0) {
    await db.update(schema.servicios).set({ activo: false }).where(eq(schema.servicios.id, x.id));
    await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ocultó el servicio ${x.nombre}` });
    revalidatePath(R);
    return { mensaje: `${x.nombre} ya tiene ventas, así que se ocultó en lugar de borrarse.` };
  }
  await db.delete(schema.servicios).where(eq(schema.servicios.id, x.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} eliminó el servicio ${x.nombre}` });
  revalidatePath(R);
  return { mensaje: `${x.nombre} se eliminó.` };
}
