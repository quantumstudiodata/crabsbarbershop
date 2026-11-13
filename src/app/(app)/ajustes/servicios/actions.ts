"use server";

import { and, eq, inArray, sql, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";

export type Resultado = { error?: string; mensaje?: string; id?: string };
const R = "/ajustes/servicios";

async function servicioDe(barberiaId: string, id: string) {
  const [x] = await db.select().from(schema.servicios).where(and(eq(schema.servicios.id, id), eq(schema.servicios.barberiaId, barberiaId), isNull(schema.servicios.eliminadoEn))).limit(1);
  return x ?? null;
}

export async function guardarServicio(d: { id?: string; nombre: string; categoria: string; precio: string; duracion: string; activo?: boolean; comision?: string; descripcion?: string }): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
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
  const descripcion = String(d.descripcion ?? "").trim().slice(0, 160);
  await asegurarCategoria(s.barberia.id, categoria);
  if (d.id) {
    const actual = await servicioDe(s.barberia.id, d.id);
    if (!actual) return { error: "No se encontró el servicio." };
    await db.transaction(async (tx) => {
      await tx.update(schema.servicios).set({ nombre, categoria, precio, duracionMin: duracion, activo, comision, descripcion }).where(eq(schema.servicios.id, actual.id));
      const pct = (c: number | null) => (c === null ? "la de cada barbero" : `${c / 100}%`);
      const desc = (n: string, c: string, p: number, du: number, a: boolean, co: number | null) => `${n}, ${c}, ${formatoDinero(p)}, ${du ? `${du} min` : "sin duración"}, ${a ? "visible" : "oculto"}, comisión ${pct(co)}`;
      const antes = desc(actual.nombre, actual.categoria, actual.precio, actual.duracionMin, actual.activo, actual.comision);
      const ahora = desc(nombre, categoria, precio, duracion, activo, comision);
      if (actual.precio !== precio) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} cambió el precio de ${nombre}`, detalle: { servicio: nombre, antes: formatoDinero(actual.precio), ahora: formatoDinero(precio) } });
      if (antes !== ahora && (actual.precio === precio || actual.nombre !== nombre || actual.categoria !== categoria || actual.duracionMin !== duracion || actual.activo !== activo || actual.comision !== comision))
        if (actual.precio === precio) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó el servicio ${nombre}`, detalle: { servicio: nombre, antes, ahora } });
    });
  } else {
    let nuevoId = "";
    await db.transaction(async (tx) => {
      const [n] = await tx.insert(schema.servicios).values({ barberiaId: s.barberia.id, nombre, categoria, precio, duracionMin: duracion, orden: 1000, activo, comision, descripcion }).returning({ id: schema.servicios.id });
      nuevoId = n.id;
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "precio", accion: `${s.usuario.nombre} agregó el servicio ${nombre} a ${formatoDinero(precio)}` });
    });
    revalidatePath(R);
    return { mensaje: `${nombre} se agregó.`, id: nuevoId };
  }
  revalidatePath(R);
  return { mensaje: "Guardado." };
}

/** Mostrar u ocultar en Cobro. */
export async function alternarServicio(id: string): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  const x = await servicioDe(s.barberia.id, String(id));
  if (!x) return { error: "No se encontró el servicio." };
  await db.update(schema.servicios).set({ activo: !x.activo }).where(eq(schema.servicios.id, x.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${x.activo ? "ocultó" : "volvió a mostrar"} el servicio ${x.nombre}`, detalle: { servicio: x.nombre, antes: x.activo ? "Visible" : "Oculto", ahora: x.activo ? "Oculto" : "Visible" } });
  revalidatePath(R);
  return {};
}

/** Se borra solo si nunca se cobró. Si ya tiene ventas, se oculta para no perder el historial. */
export async function eliminarServicio(id: string): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  const x = await servicioDe(s.barberia.id, String(id));
  if (!x) return { error: "No se encontró el servicio." };
  // Nunca se borra de verdad: sale de Ajustes, Cobro y reservas, pero las ventas, reglas y citas que lo tengan lo conservan.
  await db.update(schema.servicios).set({ activo: false, eliminadoEn: new Date() }).where(eq(schema.servicios.id, x.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} eliminó el servicio ${x.nombre}` });
  revalidatePath(R);
  return { mensaje: `${x.nombre} se eliminó. Su historial se conserva.` };
}

/** Guarda el orden en que aparecen los servicios en Cobro. */
export async function ordenarServicios(ids: string[]): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
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

async function asegurarCategoria(barberiaId: string, nombre: string) {
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${schema.categoriasServicio.orden}), 0)::int` }).from(schema.categoriasServicio).where(eq(schema.categoriasServicio.barberiaId, barberiaId));
  await db.insert(schema.categoriasServicio).values({ barberiaId, nombre, orden: m + 10 }).onConflictDoNothing();
}

async function categoriaDe(barberiaId: string, id: string) {
  const [c] = await db.select().from(schema.categoriasServicio).where(and(eq(schema.categoriasServicio.id, String(id)), eq(schema.categoriasServicio.barberiaId, barberiaId), isNull(schema.categoriasServicio.eliminadoEn))).limit(1);
  return c ?? null;
}

/** Crea una categoría (queda al final) o le cambia nombre y descripción. */
export async function guardarCategoria(d: { id?: string; nombre: string; descripcion?: string }): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  const nombre = String(d.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  const descripcion = String(d.descripcion ?? "").trim().slice(0, 160);
  if (nombre.length < 2) return { error: "Escribe el nombre de la categoría." };
  const [igual] = await db.select().from(schema.categoriasServicio).where(and(eq(schema.categoriasServicio.barberiaId, s.barberia.id), isNull(schema.categoriasServicio.eliminadoEn), sql`lower(${schema.categoriasServicio.nombre}) = lower(${nombre})`)).limit(1);
  if (igual && igual.id !== d.id) return { error: "Ya hay una categoría con ese nombre." };
  if (d.id) {
    const c = await categoriaDe(s.barberia.id, d.id);
    if (!c) return { error: "No se encontró la categoría." };
    await db.transaction(async (tx) => {
      await tx.update(schema.categoriasServicio).set({ nombre, descripcion }).where(eq(schema.categoriasServicio.id, c.id));
      if (c.nombre !== nombre) await tx.update(schema.servicios).set({ categoria: nombre }).where(and(eq(schema.servicios.barberiaId, s.barberia.id), eq(schema.servicios.categoria, c.nombre)));
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} editó la categoría ${nombre}`, detalle: { antes: c.nombre, ahora: nombre } });
    });
    revalidatePath(R); revalidatePath("/cobrar");
    return { mensaje: "Categoría guardada.", id: c.id };
  }
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${schema.categoriasServicio.orden}), 0)::int` }).from(schema.categoriasServicio).where(eq(schema.categoriasServicio.barberiaId, s.barberia.id));
  const [c] = await db.insert(schema.categoriasServicio).values({ barberiaId: s.barberia.id, nombre, descripcion, orden: m + 10 }).returning({ id: schema.categoriasServicio.id });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} creó la categoría de servicios ${nombre}` });
  revalidatePath(R);
  return { mensaje: `Categoría ${nombre} creada.`, id: c.id };
}

/** Ocultar una categoría la quita de Cobro con todos sus servicios; no borra nada. */
export async function alternarCategoria(id: string): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  const c = await categoriaDe(s.barberia.id, id);
  if (!c) return { error: "No se encontró la categoría." };
  await db.update(schema.categoriasServicio).set({ activo: !c.activo }).where(eq(schema.categoriasServicio.id, c.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${c.activo ? "ocultó" : "volvió a mostrar"} la categoría ${c.nombre}`, detalle: { antes: c.activo ? "Visible" : "Oculta", ahora: c.activo ? "Oculta" : "Visible" } });
  revalidatePath(R); revalidatePath("/cobrar");
  return {};
}

export async function ordenarCategorias(ids: string[]): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.slice(0, 100).map(String).entries())
      await tx.update(schema.categoriasServicio).set({ orden: (i + 1) * 10 }).where(and(eq(schema.categoriasServicio.id, id), eq(schema.categoriasServicio.barberiaId, s.barberia.id)));
  });
  revalidatePath(R); revalidatePath("/cobrar");
  return {};
}

/** Servicios de una categoría que ya tienen ventas (o comisiones especiales): esos no se pueden borrar. */
async function conHistorial(barberiaId: string, nombre: string) {
  const suyos = await db.select({ id: schema.servicios.id, nombre: schema.servicios.nombre }).from(schema.servicios).where(and(eq(schema.servicios.barberiaId, barberiaId), eq(schema.servicios.categoria, nombre), isNull(schema.servicios.eliminadoEn)));
  if (!suyos.length) return { suyos, usados: [] as { id: string; nombre: string }[] };
  const ids = suyos.map((x) => x.id);
  const vendidos = await db.selectDistinct({ id: schema.conceptos.servicioId }).from(schema.conceptos).where(inArray(schema.conceptos.servicioId, ids));
  const reglas = await db.selectDistinct({ id: schema.reglasComision.servicioId }).from(schema.reglasComision).where(inArray(schema.reglasComision.servicioId, ids));
  const usados = new Set([...vendidos, ...reglas].map((x) => x.id));
  return { suyos, usados: suyos.filter((x) => usados.has(x.id)) };
}

export async function revisarCategoria(id: string): Promise<{ error?: string; servicios: number; conVentas: string[] }> {
  const s = await requerirSesion("servicios.editar");
  const c = await categoriaDe(s.barberia.id, id);
  if (!c) return { error: "No se encontró la categoría.", servicios: 0, conVentas: [] };
  const { suyos, usados } = await conHistorial(s.barberia.id, c.nombre);
  return { servicios: suyos.length, conVentas: usados.map((x) => x.nombre) };
}

/**
 * Eliminar una categoría.
 * Sin ventas: se borra con sus servicios. Con ventas: sus servicios pasan a otra categoría (destino) o se archiva (destino null).
 * Las ventas pasadas nunca cambian: guardan su propio nombre y precio.
 */
export async function eliminarCategoria(id: string, destino: string | null): Promise<Resultado> {
  const s = await requerirSesion("servicios.editar");
  const c = await categoriaDe(s.barberia.id, id);
  if (!c) return { error: "No se encontró la categoría." };
  const { suyos } = await conHistorial(s.barberia.id, c.nombre);
  if (destino === null) {
    // Archivar: la categoría y sus servicios dejan de estar disponibles para cobrar, sin borrar nada.
    await db.transaction(async (tx) => {
      await tx.update(schema.categoriasServicio).set({ activo: false }).where(eq(schema.categoriasServicio.id, c.id));
      if (suyos.length) await tx.update(schema.servicios).set({ activo: false }).where(inArray(schema.servicios.id, suyos.map((x) => x.id)));
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} archivó la categoría ${c.nombre}`, detalle: { servicios: suyos.length } });
    });
    revalidatePath(R); revalidatePath("/cobrar");
    return { mensaje: `${c.nombre} se archivó. Su historial se conserva.` };
  }
  const ahora = new Date();
  if (destino) {
    const d = await categoriaDe(s.barberia.id, destino);
    if (!d || d.id === c.id) return { error: "Elige a qué categoría pasan sus servicios." };
    if (suyos.length) await db.update(schema.servicios).set({ categoria: d.nombre }).where(inArray(schema.servicios.id, suyos.map((x) => x.id)));
  } else if (suyos.length) {
    // Sus servicios se eliminan con ella, sin perder el historial.
    await db.update(schema.servicios).set({ activo: false, eliminadoEn: ahora }).where(inArray(schema.servicios.id, suyos.map((x) => x.id)));
  }
  await db.update(schema.categoriasServicio).set({ activo: false, eliminadoEn: ahora }).where(eq(schema.categoriasServicio.id, c.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} eliminó la categoría de servicios ${c.nombre}`, detalle: { servicios: suyos.length, reasignados: destino ? suyos.length : 0 } });
  revalidatePath(R); revalidatePath("/cobrar");
  return { mensaje: `${c.nombre} se eliminó.` };
}
