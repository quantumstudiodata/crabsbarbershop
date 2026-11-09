"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { leerPesos } from "@/lib/money";
import { NOMBRE_TIPO, type TipoPromo } from "@/lib/promociones";

export type ResultadoPromo = { error?: string; mensaje?: string; id?: string };

export type BorradorPromo = {
  id?: string; nombre: string; descripcion: string; tipo: TipoPromo; valor: string;
  servicioIds: string[]; categorias: string[];
  desde: string; hasta: string; dias: number[]; conHorario: boolean; horaDesde: string; horaHasta: string;
  aplicacion: "auto" | "codigo"; codigo: string; enCobro: boolean; enLinea: boolean; conLimite: boolean; limite: string;
};

const TIPOS: TipoPromo[] = ["precio", "fijo", "porcentaje", "paquete", "horario"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function guardarPromocion(d: BorradorPromo): Promise<ResultadoPromo> {
  const s = await requerirSesion("servicios.editar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const b = s.barberia.id;
  const nombre = String(d.nombre ?? "").trim().slice(0, 60);
  const descripcion = String(d.descripcion ?? "").trim().slice(0, 200);
  if (!nombre) return { error: "Escribe el nombre de la promoción." };
  if (!TIPOS.includes(d.tipo)) return { error: "Elige el tipo de promoción." };
  const porcentual = d.tipo === "porcentaje" || d.tipo === "horario";
  let valor: number | null;
  if (porcentual) {
    const n = Number(String(d.valor).replace("%", "").trim());
    valor = Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) : null;
    if (valor === null) return { error: "El porcentaje va de 1 a 100." };
  } else {
    valor = leerPesos(String(d.valor ?? ""));
    if (valor === null || valor <= 0) return { error: d.tipo === "fijo" ? "Escribe cuánto se descuenta." : "Escribe el precio de la promoción." };
  }

  const servicios = await db.select({ id: schema.servicios.id, precio: schema.servicios.precio, categoria: schema.servicios.categoria }).from(schema.servicios).where(eq(schema.servicios.barberiaId, b));
  const servicioIds = [...new Set((d.servicioIds ?? []).map(String))].filter((id) => servicios.some((x) => x.id === id));
  const nombresCat = new Set(servicios.map((x) => x.categoria));
  const categorias = d.tipo === "paquete" ? [] : [...new Set((d.categorias ?? []).map(String))].filter((c) => nombresCat.has(c));
  if (d.tipo === "paquete") {
    if (servicioIds.length < 2) return { error: "Un paquete necesita al menos dos servicios." };
    const suma = servicioIds.reduce((a, id) => a + (servicios.find((x) => x.id === id)?.precio ?? 0), 0);
    if (valor >= suma) return { error: "El precio del paquete tiene que ser menor que la suma de sus servicios." };
  } else if (!servicioIds.length && !categorias.length) return { error: "Elige al menos un servicio o una categoría." };
  if (d.tipo === "precio") {
    const precios = servicios.filter((x) => servicioIds.includes(x.id) || categorias.includes(x.categoria)).map((x) => x.precio);
    if (precios.every((p) => valor! >= p)) return { error: "El precio especial tiene que ser menor que el precio normal." };
  }

  if (!FECHA.test(d.desde)) return { error: "Elige la fecha de inicio." };
  const hasta = d.hasta ? d.hasta : null;
  if (hasta && (!FECHA.test(hasta) || hasta < d.desde)) return { error: "La fecha de finalización no puede ser antes del inicio." };
  const dias = [...new Set((d.dias ?? []).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).sort();
  if (!dias.length) return { error: "Elige al menos un día." };
  let horaDesde: string | null = null, horaHasta: string | null = null;
  if (d.conHorario) {
    if (!HORA.test(d.horaDesde) || !HORA.test(d.horaHasta) || d.horaDesde >= d.horaHasta) return { error: "Revisa el horario: la hora de inicio va antes que la de fin." };
    horaDesde = d.horaDesde; horaHasta = d.horaHasta;
  }
  const aplicacion = d.aplicacion === "codigo" ? "codigo" : "auto";
  let codigo: string | null = null;
  if (aplicacion === "codigo") {
    codigo = String(d.codigo ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(codigo)) return { error: "El código lleva de 3 a 20 letras o números, sin espacios." };
    const [otro] = await db.select({ id: schema.promociones.id }).from(schema.promociones)
      .where(and(eq(schema.promociones.barberiaId, b), sql`upper(${schema.promociones.codigo}) = ${codigo}`, d.id ? ne(schema.promociones.id, d.id) : sql`true`)).limit(1);
    if (otro) return { error: "Ese código ya lo usa otra promoción." };
  }
  if (!d.enCobro && !d.enLinea) return { error: "Elige al menos dónde estará disponible." };
  let limiteUsos: number | null = null;
  if (d.conLimite) {
    const n = Number(d.limite);
    if (!Number.isInteger(n) || n < 1 || n > 100000) return { error: "El límite de usos es un número entero mayor que cero." };
    limiteUsos = n;
  }

  const datos = {
    nombre, descripcion, tipo: d.tipo, valor, servicioIds, categorias, desde: d.desde, hasta, dias, horaDesde, horaHasta,
    aplicacion, codigo, enCobro: !!d.enCobro, enLinea: !!d.enLinea, limiteUsos,
  };
  let id = d.id;
  if (id) {
    const [actual] = await db.select({ id: schema.promociones.id }).from(schema.promociones).where(and(eq(schema.promociones.id, id), eq(schema.promociones.barberiaId, b))).limit(1);
    if (!actual) return { error: "No se encontró la promoción." };
    await db.update(schema.promociones).set(datos).where(eq(schema.promociones.id, id));
  } else {
    [{ id }] = await db.insert(schema.promociones).values({ ...datos, barberiaId: b, creadoPor: s.usuario.id }).returning({ id: schema.promociones.id });
  }
  await registrar(db, {
    barberiaId: b, usuarioId: s.usuario.id, tipo: "ajuste",
    accion: `${s.usuario.nombre} ${d.id ? "editó" : "creó"} la promoción ${nombre}`,
    detalle: { tipo: NOMBRE_TIPO[d.tipo], desde: d.desde, hasta: hasta ?? "Sin fecha de fin" },
  });
  revalidatePath("/", "layout");
  return { mensaje: d.id ? "Promoción actualizada." : "Promoción creada.", id };
}

export async function pausarPromocion(id: string): Promise<ResultadoPromo> {
  const s = await requerirSesion("servicios.editar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const [p] = await db.select().from(schema.promociones).where(and(eq(schema.promociones.id, id), eq(schema.promociones.barberiaId, s.barberia.id))).limit(1);
  if (!p) return { error: "No se encontró la promoción." };
  await db.update(schema.promociones).set({ pausada: !p.pausada }).where(eq(schema.promociones.id, id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${p.pausada ? "reanudó" : "pausó"} la promoción ${p.nombre}`, detalle: {} });
  revalidatePath("/", "layout");
  return { mensaje: p.pausada ? "Promoción reanudada." : "Promoción pausada." };
}

/** Si ya se usó en alguna venta solo se pausa, para conservar el historial. */
export async function eliminarPromocion(id: string): Promise<ResultadoPromo> {
  const s = await requerirSesion("servicios.editar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const [p] = await db.select().from(schema.promociones).where(and(eq(schema.promociones.id, id), eq(schema.promociones.barberiaId, s.barberia.id))).limit(1);
  if (!p) return { error: "No se encontró la promoción." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.conceptos).where(and(eq(schema.conceptos.barberiaId, s.barberia.id), eq(schema.conceptos.promocionId, id)));
  if (n > 0) {
    await db.update(schema.promociones).set({ pausada: true }).where(eq(schema.promociones.id, id));
    revalidatePath("/", "layout");
    return { mensaje: "Ya se usó en ventas, así que se pausó en lugar de eliminarse." };
  }
  await db.delete(schema.promociones).where(eq(schema.promociones.id, id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} eliminó la promoción ${p.nombre}`, detalle: {} });
  revalidatePath("/", "layout");
  return { mensaje: "Promoción eliminada." };
}
