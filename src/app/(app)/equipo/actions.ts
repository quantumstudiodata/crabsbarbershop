"use server";

import { and, asc, eq, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { cajaDe, movimientosDeTurno } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { POR_ENTREGAR } from "@/lib/pagosAuto";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";

/** Autoriza o descarta un faltante en revisión. Solo lo autorizado se resta del pago de la persona. */
export async function decidirFaltante(form: FormData) {
  const s = await requerirSesion("equipo.autorizar");
  if (s.vista) volver("/equipo/pagos", { error: "En la vista previa no se guardan cambios." });
  const id = texto(form, "id", 40);
  const decision = texto(form, "decision") === "autorizar" ? "autorizado" : "descartado";
  const nota = texto(form, "nota", 200);
  const [f] = await db.select({ id: schema.faltantesCaja.id, monto: schema.faltantesCaja.monto, estado: schema.faltantesCaja.estado, nombre: schema.usuarios.nombre })
    .from(schema.faltantesCaja).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.faltantesCaja.usuarioId))
    .where(and(eq(schema.faltantesCaja.id, id), eq(schema.faltantesCaja.barberiaId, s.barberia.id))).limit(1);
  if (!f || f.estado !== "revision") volver("/equipo/pagos", { error: "Ese faltante ya se revisó." });
  await db.transaction(async (tx) => {
    await tx.update(schema.faltantesCaja).set({ estado: decision, autorizadoPor: s.usuario.id, autorizadoEn: new Date(), nota })
      .where(and(eq(schema.faltantesCaja.id, f.id), eq(schema.faltantesCaja.estado, "revision")));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: decision === "autorizado"
        ? `${s.usuario.nombre} autorizó descontar a ${f.nombre} un faltante de ${formatoDinero(f.monto)}`
        : `${s.usuario.nombre} descartó el faltante de ${formatoDinero(f.monto)} asignado a ${f.nombre}`,
      detalle: { nota: nota || undefined },
    });
  });
  revalidatePath("/", "layout");
  volver("/equipo/pagos", { aviso: "guardado" });
}

/** Responde una reseña. La respuesta queda visible para el equipo. */
export async function responderResena(form: FormData) {
  const s = await requerirSesion("resenas.responder");
  const regreso = texto(form, "regreso", 200).startsWith("/clientes/resenas") ? texto(form, "regreso", 200) : "/clientes/resenas";
  if (s.vista) volver(regreso, { error: "En la vista previa no se guardan cambios." });
  const id = texto(form, "id", 40);
  const respuesta = texto(form, "respuesta", 600);
  if (!respuesta) volver(regreso, { error: "Escribe la respuesta." });
  const r = await db.update(schema.resenas).set({ respuesta, respondidaPor: s.usuario.id, respondidaEn: new Date() })
    .where(and(eq(schema.resenas.id, id), eq(schema.resenas.barberiaId, s.barberia.id))).returning({ id: schema.resenas.id });
  if (!r.length) volver(regreso, { error: "No se encontró esa reseña." });
  revalidatePath("/clientes/resenas");
  volver(regreso, { aviso: "guardado" });
}

/**
 * Con pagos automáticos: marca como pagada una comisión pendiente de entregar sin esperar al corte.
 * Por transferencia no toca la caja; en efectivo sale de la caja abierta y queda como salida del turno.
 * Se cubre primero lo más viejo; si se paga solo una parte, lo demás sigue pendiente.
 */
export async function entregarPendiente(_: { error?: string; ok?: number; mensaje?: string } | null, form: FormData): Promise<{ error?: string; ok?: number; mensaje?: string }> {
  const s = await requerirSesion("equipo.pagar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const barberoId = texto(form, "barberoId", 40);
  const forma = texto(form, "forma") === "efectivo" ? "efectivo" : "transferencia";
  const monto = leerPesos(texto(form, "monto"));
  if (!monto || monto <= 0) return { error: "Escribe el monto." };
  const [u] = await db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre }).from(schema.usuarios)
    .where(and(eq(schema.usuarios.id, barberoId), eq(schema.usuarios.barberiaId, s.barberia.id))).limit(1);
  if (!u) return { error: "No se encontró a esa persona." };
  // Si se presiona varias veces, el pago se guarda una sola vez.
  const [ya] = await db.select({ suma: sql<number>`coalesce(sum(${schema.pagosComision.monto}), 0)::int` }).from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, s.barberia.id), eq(schema.pagosComision.barberoId, u.id),
    eq(schema.pagosComision.usuarioId, s.usuario.id), eq(schema.pagosComision.tipo, "pago"), sql`${schema.pagosComision.nota} not like ${`${POR_ENTREGAR}:%`}`,
    sql`${schema.pagosComision.creadoEn} > now() - interval '30 seconds'`));
  if (ya && ya.suma === monto) return { ok: Date.now(), mensaje: "El pago ya se había guardado." };
  const filas = await db.select({ id: schema.pagosComision.id, monto: schema.pagosComision.monto, nota: schema.pagosComision.nota, semana: schema.pagosComision.semana, creadoEn: schema.pagosComision.creadoEn })
    .from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, s.barberia.id), eq(schema.pagosComision.barberoId, u.id), eq(schema.pagosComision.tipo, "pago"),
      like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`), sql`${schema.pagosComision.monto} > 0`)).orderBy(asc(schema.pagosComision.creadoEn));
  const total = filas.reduce((a, x) => a + x.monto, 0);
  if (!total) return { error: "Ya no tiene pagos pendientes." };
  if (monto > total) return { error: `Solo tiene ${formatoDinero(total)} pendientes.` };
  const turno = forma === "efectivo" ? await cajaDe(s) : null;
  if (forma === "efectivo") {
    if (!turno) return { error: "La caja está cerrada. Ábrela en Cobro o registra el pago por transferencia." };
    const d = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
    if (monto > d.esperado) return { error: `En la caja solo hay ${formatoDinero(Math.max(0, d.esperado))}.` };
  }
  const nombre = u.nombre.split(" ")[0];
  const ahora = new Date();
  const hechos: string[] = [];
  const res = await db.transaction(async (tx) => {
    let falta = monto;
    for (const f of filas) {
      if (falta <= 0) break;
      const usa = Math.min(f.monto, falta);
      falta -= usa;
      const de = f.nota.slice(POR_ENTREGAR.length + 2);
      const nota = `${forma === "efectivo" ? "Efectivo de caja" : "Transferencia"}: ${de}`.slice(0, 200);
      // Se cambia solo si sigue pendiente (por si dos personas lo registran a la vez).
      const r = usa === f.monto
        ? await tx.update(schema.pagosComision).set({ nota, usuarioId: s.usuario.id, creadoEn: ahora })
          .where(and(eq(schema.pagosComision.id, f.id), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`), eq(schema.pagosComision.monto, f.monto))).returning({ id: schema.pagosComision.id })
        : await tx.update(schema.pagosComision).set({ monto: f.monto - usa })
          .where(and(eq(schema.pagosComision.id, f.id), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`), eq(schema.pagosComision.monto, f.monto))).returning({ id: schema.pagosComision.id });
      if (!r.length) throw new Error("cambio");
      if (usa < f.monto) await tx.insert(schema.pagosComision).values({ barberiaId: s.barberia.id, barberoId: u.id, tipo: "pago", monto: usa, semana: f.semana, nota, usuarioId: s.usuario.id, creadoEn: ahora });
      // Una salida por pago, con el mismo monto: así Movimientos encuentra cada pago en su turno.
      if (turno) await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo: "retiro", monto: usa, concepto: `Pago de comisiones a ${nombre}`, usuarioId: s.usuario.id, creadoEn: ahora });
      hechos.push(`${formatoDinero(usa)} ${de}`);
    }
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
      accion: `${s.usuario.nombre} registró el pago de ${formatoDinero(monto)} a ${u.nombre} ${forma === "efectivo" ? "en efectivo, de la caja" : "por transferencia"}`,
      detalle: { comisiones: hechos.join(", "), quedaPendiente: total - monto || undefined },
    });
  }).catch((e) => { if (e instanceof Error && e.message === "cambio") return "cambio" as const; throw e; });
  if (res === "cambio") return { error: "Ese pago ya cambió. Vuelve a abrir la ventana." };
  revalidatePath("/", "layout");
  return { ok: Date.now(), mensaje: `Pago de ${formatoDinero(monto)} a ${nombre} guardado${total - monto > 0 ? `. Quedan ${formatoDinero(total - monto)} pendientes` : ""}.` };
}
