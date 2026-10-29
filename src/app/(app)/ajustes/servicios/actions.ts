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

export async function guardarServicio(d: { id?: string; nombre: string; categoria: string; precio: string; duracion: string; activo?: boolean; comision?: string }): Promise<Resultado> {
  const s = await requerirSesion("ajustes.negocio");
  const nombre = String(d.nombre ?? "").trim().slice(0, 60);
  const categoria = String(d.categoria ?? "").trim().slice(0, 40) || "Cortes";
  const precio = leerPesos(String(d.precio ?? ""));
  // La duración es opcional; sin ella se guarda 0.
  const duracion = String(d.duracion ?? "").trim() === "" ? 0 : Number(d.duracion);
  const comisionTxt = String(d.comision ?? "").trim();
  const comision = comisionTxt === "" ? null : Math.round(Number(comisionTxt) * 100);
  if (!nombre || precio === null || precio <= 0) return { error: "Escribe el nombre y el precio." };
  if (!Number.isInteger(duracion) || duracion < 0 || duracion > 480) return { error: "La duración va de 0 a 480 minutos." };
  if (comision !== null && (!Number.isFinite(comision) || comision < 0 || comision > 10000)) return { error: "La comisión va de 0 a 100%." };
  const activo = d.activo ?? true;
  if (d.id) {
    const actual = await servicioDe(s.barberia.id, d.id);
    if (!actual) return { error: "No se encontró el servicio." };
    await db.transaction(async (tx) => {
      await tx.update(schema.servicios).set({ nombre, categoria, precio, duracionMin: duracion, activo, comision }).where(eq(schema.servicios.id, actual.id));
      const pct = (c: number | null) => (c === null ? "la de cada barbero" : `${c / 100}%`);
      const desc = (n: string, c: string, p: number, du: number, a: boolean, co: number | null) => `${n}, ${c}, ${formatoDinero(p)}, ${du ? `${du} min` : "sin duración"}, ${a ? "visible" : "oculto"}, comisión ${pct(co)}`;
      const antes = desc(actual.nombre, actual.categoria, actual.precio, actual.duracionMin, actual.activo, actual.comision);
      const ahora = desc(nombre, categoria, precio, duracion, activo, comision);
      if (actual.precio !== precio) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} cambió el precio de ${nombre}`, detalle: { servicio: nombre, antes: formatoDinero(actual.precio), ahora: formatoDinero(precio) } });
      if (antes !== ahora && (actual.precio === precio || actual.nombre !== nombre || actual.categoria !== categoria || actual.duracionMin !== duracion || actual.activo !== activo || actual.comision !== comision))
        if (actual.precio === precio) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó el servicio ${nombre}`, detalle: { servicio: nombre, antes, ahora } });
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(schema.servicios).values({ barberiaId: s.barberia.id, nombre, categoria, precio, duracionMin: duracion, orden: 1000, activo, comision });
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
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${x.activo ? "ocultó" : "volvió a mostrar"} el servicio ${x.nombre}`, detalle: { servicio: x.nombre, antes: x.activo ? "Visible" : "Oculto", ahora: x.activo ? "Oculto" : "Visible" } });
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

/** Guarda el orden en que aparecen los servicios en Cobro. */
export async function ordenarServicios(ids: string[]): Promise<Resultado> {
  const s = await requerirSesion("ajustes.negocio");
  const lista = ids.slice(0, 300).map(String);
  await db.transaction(async (tx) => {
    for (const [i, id] of lista.entries()) {
      await tx.update(schema.servicios).set({ orden: i }).where(and(eq(schema.servicios.id, id), eq(schema.servicios.barberiaId, s.barberia.id)));
    }
  });
  revalidatePath(R);
  revalidatePath("/cobrar");
  return {};
}
