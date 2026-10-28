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

export type EstadoCaja = { ok?: boolean; error?: string; mensaje?: string; n?: number };

const listo = (mensaje: string): EstadoCaja => {
  revalidatePath("/", "layout");
  return { ok: true, mensaje, n: Date.now() };
};

export async function abrirCaja(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para abrir la caja." };
  const fondo = leerPesos(texto(form, "fondo"));
  if (fondo === null) return { error: "Escribe con cuánto efectivo se abre la caja. Si no hay, escribe 0." };
  if (await turnoAbierto(s.barberia.id)) return { error: "La caja ya está abierta." };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.turnosCaja).values({ barberiaId: s.barberia.id, fondoInicial: fondo, abiertoPor: s.usuario.id, fechaOperativa: fechaLocal(new Date(), s.barberia.zonaHoraria) });
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} abrió la caja con ${formatoDinero(fondo)}`, detalle: { fondo } });
    });
  } catch {
    return { error: "La caja ya está abierta." };
  }
  return listo("La caja quedó abierta.");
}

export async function registrarMovimiento(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para mover la caja." };
  const tipo = texto(form, "tipo");
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  if (tipo !== "entrada" && tipo !== "retiro") return { error: "Elige si es retiro o entrada." };
  if (!monto) return { error: "Escribe el monto." };
  if (!concepto) return { error: "Escribe para qué fue." };
  const turno = await turnoAbierto(s.barberia.id);
  if (!turno) return { error: "La caja está cerrada." };
  await db.transaction(async (tx) => {
    await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo, monto, concepto, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} registró ${tipo === "retiro" ? "un retiro" : "una entrada"} de ${formatoDinero(monto)}`, detalle: { concepto },
    });
  });
  return listo(`${tipo === "retiro" ? "Retiro" : "Entrada"} de ${formatoDinero(monto)} guardado.`);
}

export async function registrarGasto(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para registrar gastos de caja." };
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  const categoria = texto(form, "categoria", 60) || "Otros";
  if (!monto) return { error: "Escribe el monto del gasto." };
  if (!concepto) return { error: "Escribe en qué se gastó." };
  const turno = await turnoAbierto(s.barberia.id);
  if (!turno) return { error: "La caja está cerrada." };
  await db.transaction(async (tx) => {
    await tx.insert(schema.gastos).values({ barberiaId: s.barberia.id, categoria, concepto, monto, turnoId: turno.id, usuarioId: s.usuario.id, fecha: fechaLocal(new Date(), s.barberia.zonaHoraria) });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} registró un gasto de ${formatoDinero(monto)} pagado con la caja`, detalle: { concepto, categoria },
    });
  });
  return listo(`Gasto de ${formatoDinero(monto)} guardado.`);
}

/** Corte de caja: el efectivo se cuenta; transferencias y tarjeta se revisan contra el banco o la terminal. */
export async function cerrarCaja(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para cerrar la caja." };
  const contado = leerPesos(texto(form, "contado"));
  const notas = texto(form, "notas", 500);
  if (contado === null) return { error: "Escribe cuánto efectivo contaste." };
  const turno = await turnoAbierto(s.barberia.id);
  if (!turno) return { error: "La caja ya está cerrada." };
  const datos = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
  const r = compararConteo(datos.esperado, contado, formatoDinero);
  const verificacion: Record<string, { total: number; coincide: boolean }> = {};
  for (const m of datos.otrosPorMetodo) verificacion[m.metodo] = { total: m.total, coincide: form.get(`ver:${m.metodo}`) === "si" };
  const sinRevisar = Object.entries(verificacion).filter(([, v]) => !v.coincide).map(([k]) => k);
  if (requiereExplicacion(r.diferencia, s.barberia.limiteDiferenciaCaja) && !notas) return { error: `${r.texto} Escribe qué pasó antes de cerrar.` };
  if (sinRevisar.length && !notas) return { error: `${sinRevisar.join(" y ")} no coincide. Escribe qué pasó antes de cerrar.` };
  await db.transaction(async (tx) => {
    const filas = await tx.update(schema.turnosCaja)
      .set({ estado: "cerrado", cerradoPor: s.usuario.id, cerradoEn: new Date(), efectivoEsperado: datos.esperado, efectivoContado: contado, diferencia: r.diferencia, notasCierre: notas || null, verificacion })
      .where(and(eq(schema.turnosCaja.id, turno.id), eq(schema.turnosCaja.estado, "abierto")))
      .returning({ id: schema.turnosCaja.id });
    if (filas.length === 0) return;
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} cerró la caja. ${r.texto}`, detalle: { esperado: datos.esperado, contado, diferencia: r.diferencia, notas, verificacion },
    });
  });
  return listo(`Caja cerrada. ${r.texto}`);
}

/** Corrección de un cierre ya hecho: no se edita el cierre, se agrega un ajuste con motivo. */
export async function corregirCierre(form: FormData) {
  const s = await requerirSesion("caja.corregir");
  const R = "/analitica/cortes";
  const turnoId = texto(form, "turnoId", 40);
  const signo = texto(form, "signo") === "menos" ? -1 : 1;
  const monto = leerPesos(texto(form, "monto"));
  const motivo = texto(form, "motivo", 300);
  if (!monto || !motivo) volver(R, { error: "Escribe el monto y el motivo de la corrección." });
  const [t] = await db.select().from(schema.turnosCaja)
    .where(and(eq(schema.turnosCaja.id, turnoId), eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "cerrado"))).limit(1);
  if (!t) volver(R, { error: "No se encontró ese cierre." });
  await db.transaction(async (tx) => {
    await tx.insert(schema.ajustesCierre).values({ barberiaId: s.barberia.id, turnoId: t.id, monto: signo * monto, motivo, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} corrigió el cierre del ${t.fechaOperativa} en ${signo < 0 ? "−" : ""}${formatoDinero(monto)}`, detalle: { motivo },
    });
  });
  revalidatePath(R);
  volver(R, { aviso: "guardado" });
}
