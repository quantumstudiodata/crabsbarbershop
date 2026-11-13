"use server";

import { ventasDeCitasPagadas } from "@/lib/pagos";
import { and, eq, like, sql } from "drizzle-orm";
import { POR_ENTREGAR, liquidarAutomaticos } from "@/lib/pagosAuto";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { compararConteo, requiereExplicacion } from "@/lib/caja";
import { cajaDe, categoriasGasto, folioCorte, movimientosDeTurno } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";
import { MAX_ADJUNTO, TIPOS_ADJUNTO } from "@/lib/archivo";

export type ResumenCorte = {
  folio: string; desde: string; hasta: string; metodos: { metodo: string; total: number }[]; total: number; ventas: number;
  propinas: number; esperado: number; contado: number; diferencia: number;
};
export type EstadoCaja = { ok?: boolean; error?: string; mensaje?: string; n?: number; resumen?: ResumenCorte };

const listo = (mensaje: string): EstadoCaja => {
  revalidatePath("/", "layout");
  return { ok: true, mensaje, n: Date.now() };
};

const EN_LINEA = ["Pago con QR", "Anticipo en línea", "Pago en línea"];

export async function abrirCaja(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para abrir la caja." };
  const fondo = leerPesos(texto(form, "fondo"));
  if (fondo === null) return { error: "Escribe con cuánto efectivo se abre la caja. Si no hay, escribe 0." };
  if (await cajaDe(s)) return { error: "La caja ya está abierta." };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.turnosCaja).values({ barberiaId: s.barberia.id, fondoInicial: fondo, abiertoPor: s.usuario.id, responsableId: s.barberia.modeloCaja === "individual" ? s.usuario.id : null, fechaOperativa: fechaLocal(new Date(), s.barberia.zonaHoraria) });
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} abrió la caja con ${formatoDinero(fondo)}`, detalle: { fondo } });
    });
  } catch {
    return { error: "La caja ya está abierta." };
  }
  // Citas pagadas en línea mientras la caja estaba cerrada: se registran como venta en esta caja.
  await ventasDeCitasPagadas(s.barberia.id).catch((err) => console.error("venta_cita_linea", err));
  return listo("La caja quedó abierta.");
}

export async function registrarMovimiento(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.retiros")) return { error: "No tienes permiso para registrar retiros." };
  const tipo = texto(form, "tipo");
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  if (tipo !== "entrada" && tipo !== "retiro") return { error: "Elige si es retiro o entrada." };
  if (!monto) return { error: "Escribe el monto." };
  if (!concepto) return { error: "Escribe para qué fue." };
  const turno = await cajaDe(s);
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
  if (!s.puede("caja.retiros")) return { error: "No tienes permiso para registrar gastos de caja." };
  const monto = leerPesos(texto(form, "monto"));
  const concepto = texto(form, "concepto");
  const elegida = texto(form, "categoria", 60);
  const cats = await categoriasGasto(s.barberia.id);
  const categoria = cats.find((c) => c.nombre === elegida)?.nombre ?? "Otros";
  if (!monto) return { error: "Escribe el monto del gasto." };
  if (!concepto) return { error: "Escribe en qué se gastó." };
  const turno = await cajaDe(s);
  if (!turno) return { error: "La caja está cerrada." };
  await db.transaction(async (tx) => {
    await tx.insert(schema.gastos).values({ barberiaId: s.barberia.id, categoria, concepto, monto, metodo: "efectivo", turnoId: turno.id, usuarioId: s.usuario.id, fecha: fechaLocal(new Date(), s.barberia.zonaHoraria) });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "gasto",
      accion: `${s.usuario.nombre} registró un gasto de ${formatoDinero(monto)} pagado con la caja`, detalle: { concepto, categoria, monto, metodo: "efectivo", deCaja: true },
    });
  });
  return listo(`Gasto de ${formatoDinero(monto)} guardado.`);
}

/**
 * Corte de caja, como en un punto de venta: se suman todos los cobros por método (esa es la venta total)
 * y se concilia solo el efectivo físico contra lo que debería haber.
 */
export async function cerrarCaja(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.operar")) return { error: "No tienes permiso para cerrar la caja." };
  const contado = leerPesos(texto(form, "contado"));
  const notas = texto(form, "notas", 500);
  if (contado === null) return { error: "Escribe cuánto efectivo contaste." };
  const turno = await cajaDe(s);
  if (!turno) return { error: "La caja ya está cerrada." };
  // Evidencias opcionales (solo si el negocio las tiene activadas): fotos o PDF de transferencias, tarjetas, etc.
  const evidencias: { etiqueta: string; nombre: string; tipo: string; datos: string }[] = [];
  if (s.barberia.usaEvidenciaCorte) {
    const datosE = form.getAll("evidencia").map(String), nombres = form.getAll("evidenciaNombre").map(String), etiquetas = form.getAll("evidenciaEtiqueta").map(String);
    if (datosE.length > 6) return { error: "Se pueden adjuntar hasta 6 archivos." };
    for (let i = 0; i < datosE.length; i++) {
      if (!datosE[i]) continue;
      if (!TIPOS_ADJUNTO.test(datosE[i]) || datosE[i].length > MAX_ADJUNTO) return { error: "Cada evidencia debe ser una foto o un PDF de máximo 1 MB." };
      evidencias.push({ etiqueta: (etiquetas[i] ?? "").slice(0, 60), nombre: (nombres[i] ?? "evidencia").slice(0, 120), tipo: datosE[i].slice(5, datosE[i].indexOf(";")), datos: datosE[i] });
    }
  }
  const datos = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
  // Comisiones automáticas: lo que se paga hoy se liquida al cerrar; cada entrega en efectivo se decide aquí
  // (de la caja, mañana o por transferencia). Lo que sale de la caja se descuenta del efectivo esperado.
  type Entrega = { id: string; barberoId: string; monto: number; nota: string; nombre: string; decision: string };
  let entregas: Entrega[] = [];
  if (s.barberia.pagosEquipoAuto) {
    await liquidarAutomaticos(s.barberia.id, true);
    const pend = await db.select({ id: schema.pagosComision.id, barberoId: schema.pagosComision.barberoId, monto: schema.pagosComision.monto, nota: schema.pagosComision.nota, nombre: schema.usuarios.nombre })
      .from(schema.pagosComision).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pagosComision.barberoId))
      .where(and(eq(schema.pagosComision.barberiaId, s.barberia.id), eq(schema.pagosComision.tipo, "pago"), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`), sql`${schema.pagosComision.monto} > 0`));
    // Solo se tocan las que se mostraron en el corte; las demás siguen pendientes.
    const verTodo = s.puede("ventas.ver_todas") || s.puede("equipo.pagar");
    entregas = pend.filter((x) => verTodo || x.barberoId === s.usuario.id)
      .map((x) => ({ ...x, decision: texto(form, `entrega:${x.barberoId}`) })).filter((x) => ["caja", "transferencia"].includes(x.decision));
  }
  const deCaja = entregas.filter((x) => x.decision === "caja").reduce((a, x) => a + x.monto, 0);
  datos.esperado -= deCaja;
  // Con la función activa, cada forma de pago (que no sea efectivo) con cobros necesita su evidencia.
  if (s.barberia.usaEvidenciaCorte) {
    // Los cobros con QR y los anticipos en línea ya están verificados por Stripe: no piden comprobante.
    const faltan = datos.otrosPorMetodo.filter((x) => x.total > 0 && !EN_LINEA.includes(x.metodo) && !evidencias.some((e) => e.etiqueta === x.metodo)).map((x) => x.metodo.toLowerCase());
    if (faltan.length) return { error: `Adjunta la evidencia de ${faltan.join(" y ")} para cerrar la caja.` };
  }
  const r = compararConteo(datos.esperado, contado, formatoDinero);
  if (requiereExplicacion(r.diferencia, s.barberia.limiteDiferenciaCaja) && !notas) return { error: `${r.texto} Escribe en observaciones qué pasó.` };
  const metodos = [{ metodo: "Efectivo", total: datos.m.cobrosEfectivo }, ...datos.otrosPorMetodo.map((x) => ({ metodo: x.metodo, total: x.total }))];
  const verificacion = Object.fromEntries(datos.otrosPorMetodo.map((x) => [x.metodo, { total: x.total }]));
  const cerradoEn = new Date();
  await db.transaction(async (tx) => {
    const filas = await tx.update(schema.turnosCaja)
      .set({ estado: "cerrado", cerradoPor: s.usuario.id, cerradoEn, efectivoEsperado: datos.esperado, efectivoContado: contado, diferencia: r.diferencia, notasCierre: notas || null, verificacion })
      .where(and(eq(schema.turnosCaja.id, turno.id), eq(schema.turnosCaja.estado, "abierto")))
      .returning({ id: schema.turnosCaja.id });
    if (filas.length === 0) return;
    for (const e of entregas) {
      const resto = e.nota.slice(POR_ENTREGAR.length + 2);
      if (e.decision === "caja") {
        await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo: "retiro", monto: e.monto, concepto: `Pago de comisiones a ${e.nombre.split(" ")[0]}`, usuarioId: s.usuario.id });
        await tx.update(schema.pagosComision).set({ nota: `Efectivo de caja: ${resto} (entregado en el corte)`.slice(0, 200) }).where(eq(schema.pagosComision.id, e.id));
      } else {
        await tx.update(schema.pagosComision).set({ nota: `Transferencia: ${resto}`.slice(0, 200) }).where(eq(schema.pagosComision.id, e.id));
      }
    }
    if (evidencias.length) await tx.insert(schema.evidenciasCorte).values(evidencias.map((e) => ({ ...e, barberiaId: s.barberia.id, turnoId: turno.id, subidoPor: s.usuario.id })));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} hizo el corte de caja. ${r.texto}`, detalle: { esperado: datos.esperado, contado, diferencia: r.diferencia, notas, verificacion, evidencias: evidencias.length || undefined,
        comisiones: entregas.length ? entregas.map((e) => `${e.nombre.split(" ")[0]} ${formatoDinero(e.monto)} ${e.decision === "caja" ? "de la caja" : "por transferencia"}`).join(", ") : undefined },
    });
  });
  const zona = s.barberia.zonaHoraria;
  const hora = (d: Date) => new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  revalidatePath("/", "layout");
  return {
    ok: true, n: Date.now(), mensaje: r.texto,
    resumen: {
      folio: await folioCorte(s.barberia.id, turno.abiertoEn), desde: hora(turno.abiertoEn), hasta: hora(cerradoEn),
      metodos, total: metodos.reduce((a, x) => a + x.total, 0), ventas: datos.ventas, propinas: datos.propinasTotal,
      esperado: datos.esperado, contado, diferencia: r.diferencia,
    },
  };
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

/** Marca como revisado un corte en el que faltó dinero. */
export async function marcarRevisado(form: FormData) {
  const s = await requerirSesion("caja.corregir");
  const R = "/analitica/cortes";
  const turnoId = texto(form, "turnoId", 40);
  const [t] = await db.update(schema.turnosCaja).set({ revisadoPor: s.usuario.id, revisadoEn: new Date() })
    .where(and(eq(schema.turnosCaja.id, turnoId), eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "cerrado")))
    .returning({ fecha: schema.turnosCaja.fechaOperativa });
  if (!t) volver(R, { error: "No se encontró ese corte." });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} marcó como revisado el corte del ${fechaLarga(t.fecha).toLowerCase()}` });
  revalidatePath(R);
}
