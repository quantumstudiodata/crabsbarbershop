"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { compararConteo, requiereExplicacion } from "@/lib/caja";
import { movimientosDeTurno, turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

export async function abrirCaja(form: FormData) {
  const s = await requerirSesion("caja.operar");
  const fondo = leerPesos(texto(form, "fondo"));
  if (fondo === null) volver("/caja", { error: "Escribe con cuánto efectivo abres la caja. Si no hay, escribe 0." });
  if (await turnoAbierto(s.barberia.id)) volver("/caja", { error: "Ya hay una caja abierta." });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.turnosCaja).values({
        barberiaId: s.barberia.id, fondoInicial: fondo, abiertoPor: s.usuario.id,
        fechaOperativa: fechaLocal(new Date(), s.barberia.zonaHoraria),
      });
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} abrió la caja`, detalle: { fondo } });
    });
  } catch {
    volver("/caja", { error: "Ya hay una caja abierta." });
  }
  revalidatePath("/", "layout");
  volver("/caja", { aviso: "caja-abierta" });
}

export async function registrarMovimiento(form: FormData) {
  const s = await requerirSesion("caja.operar");
  const tipo = texto(form, "tipo");
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  if (tipo !== "entrada" && tipo !== "retiro") volver("/caja", { error: "Movimiento no válido." });
  if (!monto) volver("/caja", { error: "Escribe el monto." });
  if (!concepto) volver("/caja", { error: "Escribe para qué fue el movimiento." });
  const turno = await turnoAbierto(s.barberia.id);
  if (!turno) volver("/caja", { error: "La caja está cerrada." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo, monto, concepto, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} registró ${tipo === "retiro" ? "un retiro" : "una entrada"} de ${formatoDinero(monto)}`, detalle: { concepto },
    });
  });
  revalidatePath("/caja");
  volver("/caja", { aviso: "guardado" });
}

export async function registrarGasto(form: FormData) {
  const s = await requerirSesion();
  const desdeCaja = form.get("desdeCaja") === "si";
  if (!s.puede(desdeCaja ? "caja.operar" : "ajustes.negocio")) volver("/caja", { error: "No tienes permiso para registrar ese gasto." });
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  const categoria = texto(form, "categoria", 60) || "Otros";
  if (!monto) volver("/caja", { error: "Escribe el monto del gasto." });
  if (!concepto) volver("/caja", { error: "Escribe en qué se gastó." });
  const turno = desdeCaja ? await turnoAbierto(s.barberia.id) : null;
  if (desdeCaja && !turno) volver("/caja", { error: "La caja está cerrada." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.gastos).values({
      barberiaId: s.barberia.id, categoria, concepto, monto, turnoId: turno?.id ?? null, usuarioId: s.usuario.id,
      fecha: fechaLocal(new Date(), s.barberia.zonaHoraria),
    });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} registró un gasto de ${formatoDinero(monto)}${desdeCaja ? " pagado con la caja" : ""}`, detalle: { concepto, categoria },
    });
  });
  revalidatePath("/caja");
  volver("/caja", { aviso: "guardado" });
}

export async function cerrarCaja(form: FormData) {
  const s = await requerirSesion("caja.operar");
  const contado = leerPesos(texto(form, "contado"));
  const notas = texto(form, "notas", 500);
  if (contado === null) volver("/caja", { error: "Escribe cuánto efectivo contaste." });
  const turno = await turnoAbierto(s.barberia.id);
  if (!turno) volver("/caja", { error: "No hay caja abierta." });
  const { esperado } = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
  const r = compararConteo(esperado, contado, formatoDinero);
  if (requiereExplicacion(r.diferencia, s.barberia.limiteDiferenciaCaja) && !notas) {
    volver("/caja", { error: `${r.texto} Escribe qué pasó antes de cerrar.` });
  }
  await db.transaction(async (tx) => {
    const filas = await tx.update(schema.turnosCaja)
      .set({ estado: "cerrado", cerradoPor: s.usuario.id, cerradoEn: new Date(), efectivoEsperado: esperado, efectivoContado: contado, diferencia: r.diferencia, notasCierre: notas || null })
      .where(and(eq(schema.turnosCaja.id, turno.id), eq(schema.turnosCaja.estado, "abierto")))
      .returning({ id: schema.turnosCaja.id });
    if (filas.length === 0) return;
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} cerró la caja. ${r.texto}`, detalle: { esperado, contado, diferencia: r.diferencia, notas },
    });
  });
  revalidatePath("/", "layout");
  volver("/caja", { aviso: "caja-cerrada" });
}

/** Corrección de un cierre ya hecho: no se edita el cierre, se agrega un ajuste con motivo. */
export async function corregirCierre(form: FormData) {
  const s = await requerirSesion("caja.corregir");
  const turnoId = texto(form, "turnoId", 40);
  const signo = texto(form, "signo") === "menos" ? -1 : 1;
  const monto = leerPesos(texto(form, "monto"));
  const motivo = texto(form, "motivo", 300);
  if (!monto || !motivo) volver("/caja", { error: "Escribe el monto y el motivo de la corrección." });
  const [t] = await db.select().from(schema.turnosCaja)
    .where(and(eq(schema.turnosCaja.id, turnoId), eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "cerrado"))).limit(1);
  if (!t) volver("/caja", { error: "No se encontró ese cierre." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.ajustesCierre).values({ barberiaId: s.barberia.id, turnoId: t.id, monto: signo * monto, motivo, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} corrigió el cierre del ${t.fechaOperativa} en ${signo < 0 ? "−" : ""}${formatoDinero(monto)}`, detalle: { motivo },
    });
  });
  revalidatePath("/caja");
  volver("/caja", { aviso: "guardado" });
}
