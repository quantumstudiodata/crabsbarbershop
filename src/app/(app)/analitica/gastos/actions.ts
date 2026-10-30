"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, esFechaValida, fechaLocal } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto } from "@/lib/volver";

export type EstadoGasto = { ok?: boolean; error?: string; mensaje?: string; n?: number };

const listo = (mensaje: string): EstadoGasto => {
  revalidatePath("/", "layout");
  return { ok: true, mensaje, n: Date.now() };
};

const METODOS = { efectivo: "efectivo", transferencia: "transferencia" } as const;

/**
 * Registra un egreso. Si se paga en efectivo hoy y la caja está abierta, puede salir de la caja:
 * entonces se descuenta del efectivo esperado en el corte. Por transferencia nunca toca la caja.
 */
export async function registrarEgreso(_: EstadoGasto, form: FormData): Promise<EstadoGasto> {
  const s = await requerirSesion();
  if (!s.puede("gastos.registrar")) return { error: "No tienes permiso para registrar egresos." };
  const concepto = texto(form, "concepto", 120);
  const categoria = texto(form, "categoria", 60);
  const descripcion = texto(form, "descripcion", 500);
  const monto = leerPesos(texto(form, "monto"));
  const fecha = texto(form, "fecha", 10);
  const metodo = METODOS[texto(form, "metodo") as keyof typeof METODOS];
  const deCaja = texto(form, "deCaja") === "si";
  const hoy = fechaLocal(new Date(), s.barberia.zonaHoraria);

  if (!concepto) return { error: "Escribe el concepto del egreso." };
  if (!monto || monto <= 0) return { error: "Escribe una cantidad mayor a cero." };
  if (monto > 100_000_000) return { error: "La cantidad es demasiado grande. Revísala." };
  if (!metodo) return { error: "Elige si se pagó en efectivo o por transferencia." };
  if (!esFechaValida(fecha) || fecha > hoy || diasEntre(fecha, hoy) > 400) return { error: "Elige una fecha válida, que no sea futura." };
  const [cat] = await db.select({ nombre: schema.categoriasGasto.nombre }).from(schema.categoriasGasto)
    .where(and(eq(schema.categoriasGasto.barberiaId, s.barberia.id), eq(schema.categoriasGasto.nombre, categoria), eq(schema.categoriasGasto.activo, true)));
  if (!cat) return { error: "Elige una categoría de la lista." };

  let turnoId: string | null = null;
  if (metodo === "efectivo" && deCaja) {
    if (fecha !== hoy) return { error: "Solo los gastos de hoy pueden salir de la caja." };
    const turno = await turnoAbierto(s.barberia.id);
    if (!turno) return { error: "La caja está cerrada. Marca que no salió de la caja, o ábrela primero." };
    turnoId = turno.id;
  }

  // Evita guardar el mismo egreso dos veces si se presiona el botón dos veces.
  const [repetido] = await db.select({ id: schema.gastos.id }).from(schema.gastos).where(and(
    eq(schema.gastos.barberiaId, s.barberia.id), eq(schema.gastos.usuarioId, s.usuario.id), eq(schema.gastos.concepto, concepto),
    eq(schema.gastos.monto, monto), eq(schema.gastos.fecha, fecha), isNull(schema.gastos.canceladoEn),
    sql`${schema.gastos.creadoEn} > now() - interval '20 seconds'`,
  ));
  if (repetido) return { error: "Ese egreso ya se guardó hace unos segundos." };

  await db.transaction(async (tx) => {
    const [g] = await tx.insert(schema.gastos).values({
      barberiaId: s.barberia.id, categoria: cat.nombre, concepto, descripcion, monto, fecha, metodo, turnoId, usuarioId: s.usuario.id,
    }).returning({ id: schema.gastos.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "gasto",
      accion: `${s.usuario.nombre} registró un egreso de ${formatoDinero(monto)}: ${concepto}`,
      detalle: { gastoId: g.id, concepto, categoria: cat.nombre, monto, fecha, metodo, deCaja: !!turnoId, descripcion: descripcion || undefined },
    });
  });
  return listo(`Egreso de ${formatoDinero(monto)} guardado.`);
}

/** Un egreso no se borra: se cancela con motivo, queda tachado y deja de contar. */
export async function cancelarEgreso(_: EstadoGasto, form: FormData): Promise<EstadoGasto> {
  const s = await requerirSesion();
  if (!s.puede("gastos.registrar")) return { error: "No tienes permiso para cancelar egresos." };
  const id = texto(form, "id", 40);
  const motivo = texto(form, "motivo", 300);
  if (!motivo) return { error: "Escribe por qué se cancela." };
  const [g] = await db.select({ g: schema.gastos, estadoTurno: schema.turnosCaja.estado }).from(schema.gastos)
    .leftJoin(schema.turnosCaja, eq(schema.turnosCaja.id, schema.gastos.turnoId))
    .where(and(eq(schema.gastos.id, id), eq(schema.gastos.barberiaId, s.barberia.id)));
  if (!g) return { error: "No se encontró el egreso." };
  if (g.g.canceladoEn) return { error: "Ese egreso ya estaba cancelado." };
  if (g.estadoTurno === "cerrado") return { error: "Ese egreso ya entró en un corte cerrado. Corrígelo con un ajuste en Cortes de caja." };
  await db.transaction(async (tx) => {
    await tx.update(schema.gastos).set({ canceladoEn: new Date(), canceladoPor: s.usuario.id, motivoCancelacion: motivo })
      .where(and(eq(schema.gastos.id, id), isNull(schema.gastos.canceladoEn)));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "gasto",
      accion: `${s.usuario.nombre} canceló un egreso de ${formatoDinero(g.g.monto)}: ${g.g.concepto}`,
      detalle: { gastoId: id, concepto: g.g.concepto, monto: g.g.monto, fecha: g.g.fecha, motivo },
    });
  });
  return listo("Egreso cancelado. Queda en el historial.");
}

/** Crea una categoría, o vuelve a mostrar una que estaba oculta. */
export async function crearCategoria(_: EstadoGasto, form: FormData): Promise<EstadoGasto> {
  const s = await requerirSesion();
  if (!s.puede("gastos.registrar")) return { error: "No tienes permiso para cambiar categorías." };
  const nombre = texto(form, "nombre", 40).replace(/\s+/g, " ");
  if (nombre.length < 2) return { error: "Escribe el nombre de la categoría." };
  const nombreBonito = nombre[0].toUpperCase() + nombre.slice(1);
  const existentes = await db.select().from(schema.categoriasGasto).where(eq(schema.categoriasGasto.barberiaId, s.barberia.id));
  const igual = existentes.find((c) => c.nombre.toLowerCase() === nombreBonito.toLowerCase());
  if (igual?.activo) return { error: "Esa categoría ya existe." };
  await db.transaction(async (tx) => {
    if (igual) await tx.update(schema.categoriasGasto).set({ activo: true }).where(eq(schema.categoriasGasto.id, igual.id));
    else await tx.insert(schema.categoriasGasto).values({ barberiaId: s.barberia.id, nombre: nombreBonito, orden: 60 });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste",
      accion: `${s.usuario.nombre} agregó la categoría de egresos ${nombreBonito}`, detalle: { categoria: nombreBonito },
    });
  });
  return listo(`Categoría ${nombreBonito} agregada.`);
}

/** Ocultar una categoría no toca los egresos que ya la usan. */
export async function alternarCategoria(id: string): Promise<EstadoGasto> {
  const s = await requerirSesion();
  if (!s.puede("gastos.registrar")) return { error: "No tienes permiso para cambiar categorías." };
  const [c] = await db.select().from(schema.categoriasGasto).where(and(eq(schema.categoriasGasto.id, id), eq(schema.categoriasGasto.barberiaId, s.barberia.id)));
  if (!c) return { error: "No se encontró la categoría." };
  await db.transaction(async (tx) => {
    await tx.update(schema.categoriasGasto).set({ activo: !c.activo }).where(eq(schema.categoriasGasto.id, id));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste",
      accion: `${s.usuario.nombre} ${c.activo ? "ocultó" : "volvió a mostrar"} la categoría de egresos ${c.nombre}`,
      detalle: { categoria: c.nombre, antes: { visible: c.activo }, ahora: { visible: !c.activo } },
    });
  });
  return listo(c.activo ? `${c.nombre} ya no aparece al registrar.` : `${c.nombre} vuelve a aparecer.`);
}
