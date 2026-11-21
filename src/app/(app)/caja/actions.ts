"use server";

import { ventasDeCitasPagadas } from "@/lib/pagos";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { POR_ENTREGAR, liquidarAutomaticos } from "@/lib/pagosAuto";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { CONCEPTO_ACUMULADO, CONCEPTO_DUENA, CONCEPTO_PROPINA, compararConteo, requiereExplicacion } from "@/lib/caja";
import { cuentaDuena, leTocaAlNegocio } from "@/lib/duena";
import { propinasDeTurno } from "@/lib/comisionesCorte";
import { cajaDe, categoriasGasto, folioCorte, movimientosDeTurno } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal } from "@/lib/fechas";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { texto, volver } from "@/lib/volver";
import { MAX_ADJUNTO, TIPOS_ADJUNTO } from "@/lib/archivo";
import { aplicarPendientes, efectoPendientes, pendientesCaja } from "@/lib/pendientesCaja";

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
  const responsable = s.barberia.modeloCaja === "individual" ? s.usuario.id : null;
  let sumados = 0;
  try {
    await db.transaction(async (tx) => {
      // Lo que se registró con la caja cerrada ya está reflejado en lo que se contó: el fondo es lo que había antes de esos movimientos,
      // y los movimientos se suman al turno. Así el corte termina en lo que de verdad hay.
      const pend = await pendientesCaja(s.barberia.id, responsable, tx);
      const fondoInicial = Math.max(0, fondo + efectoPendientes(pend));
      const [t] = await tx.insert(schema.turnosCaja).values({ barberiaId: s.barberia.id, fondoInicial, abiertoPor: s.usuario.id, responsableId: responsable, fechaOperativa: fechaLocal(new Date(), s.barberia.zonaHoraria) }).returning({ id: schema.turnosCaja.id });
      sumados = (await aplicarPendientes(tx, s.barberia.id, t.id, responsable, s.barberia.zonaHoraria)).length;
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} abrió la caja con ${formatoDinero(fondo)}`,
        detalle: { fondo, pendientes: pend.length ? `Se sumaron ${pend.length} movimientos registrados con la caja cerrada` : undefined } });
    });
  } catch {
    return { error: "La caja ya está abierta." };
  }
  // Citas pagadas en línea mientras la caja estaba cerrada: se registran como venta en esta caja.
  await ventasDeCitasPagadas(s.barberia.id).catch((err) => console.error("venta_cita_linea", err));
  return listo(sumados ? `La caja quedó abierta. ${sumados === 1 ? "Se sumó 1 movimiento" : `Se sumaron ${sumados} movimientos`} de cuando estaba cerrada.` : "La caja quedó abierta.");
}

type SesionCaja = Awaited<ReturnType<typeof requerirSesion>>;

/** El mismo movimiento de la misma persona en los últimos segundos: fue un doble toque, no se guarda otra vez. */
async function repetido(s: SesionCaja, tipo: string, monto: number, concepto: string) {
  const hace = sql`now() - interval '30 seconds'`;
  if (tipo === "gasto") {
    const [g] = await db.select({ id: schema.gastos.id }).from(schema.gastos).where(and(eq(schema.gastos.barberiaId, s.barberia.id), eq(schema.gastos.usuarioId, s.usuario.id),
      eq(schema.gastos.monto, monto), eq(schema.gastos.concepto, concepto), sql`${schema.gastos.creadoEn} > ${hace}`)).limit(1);
    if (g) return true;
  } else {
    const [m] = await db.select({ id: schema.movimientosCaja.id }).from(schema.movimientosCaja).where(and(eq(schema.movimientosCaja.barberiaId, s.barberia.id), eq(schema.movimientosCaja.usuarioId, s.usuario.id),
      eq(schema.movimientosCaja.monto, monto), eq(schema.movimientosCaja.concepto, concepto), sql`${schema.movimientosCaja.creadoEn} > ${hace}`)).limit(1);
    if (m) return true;
  }
  const [p] = await db.select({ id: schema.movimientosPendientes.id }).from(schema.movimientosPendientes).where(and(eq(schema.movimientosPendientes.barberiaId, s.barberia.id),
    eq(schema.movimientosPendientes.usuarioId, s.usuario.id), eq(schema.movimientosPendientes.tipo, tipo), eq(schema.movimientosPendientes.monto, monto), eq(schema.movimientosPendientes.concepto, concepto),
    sql`${schema.movimientosPendientes.creadoEn} > ${hace}`)).limit(1);
  return !!p;
}

/** Con la caja cerrada, el movimiento queda pendiente y se suma cuando alguien abra la caja. */
async function guardarPendiente(s: SesionCaja, tipo: string, monto: number, concepto: string, categoria: string | null): Promise<EstadoCaja> {
  await db.transaction(async (tx) => {
    await tx.insert(schema.movimientosPendientes).values({ barberiaId: s.barberia.id, tipo, monto, concepto, categoria, usuarioId: s.usuario.id,
      responsableId: s.barberia.modeloCaja === "individual" ? s.usuario.id : null });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: tipo === "gasto" ? "gasto" : "caja",
      accion: `${s.usuario.nombre} registró con la caja cerrada: ${tipo === "gasto" ? "gasto" : tipo === "entrada" ? "entrada" : "efectivo que se llevó"} de ${formatoDinero(monto)}. Se suma al abrir la caja`, detalle: { concepto, categoria: categoria ?? undefined, pendiente: true } });
  });
  return listo(`Guardado. La caja está cerrada: ${formatoDinero(monto)} se suman cuando alguien la abra.`);
}

/** Quita un movimiento pendiente que se registró por error (antes de que se abra la caja). */
export async function quitarPendiente(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.retiros")) return { error: "No tienes permiso para registrar movimientos de caja." };
  const id = texto(form, "id", 40);
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "No se encontró ese movimiento." };
  const [x] = await db.update(schema.movimientosPendientes).set({ canceladoEn: new Date(), canceladoPor: s.usuario.id })
    .where(and(eq(schema.movimientosPendientes.id, id), eq(schema.movimientosPendientes.barberiaId, s.barberia.id), isNull(schema.movimientosPendientes.aplicadoTurnoId), isNull(schema.movimientosPendientes.canceladoEn)))
    .returning({ monto: schema.movimientosPendientes.monto, concepto: schema.movimientosPendientes.concepto });
  if (!x) return { error: "Ese movimiento ya se sumó a la caja o ya se quitó." };
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} quitó un movimiento pendiente de ${formatoDinero(x.monto)}`, detalle: { concepto: x.concepto } });
  return listo("Se quitó el movimiento pendiente.");
}

export async function registrarMovimiento(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  if (!s.puede("caja.retiros")) return { error: "No tienes permiso para registrar retiros." };
  const tipo = texto(form, "tipo");
  const monto = leerPesos(texto(form, "monto"));
  // Sacar efectivo sin gastarlo solo lo hace Titular ("Me llevo efectivo"): cuenta como lo del negocio.
  // Lo demás que sale de la caja (la parte de la dueña, los pagos al equipo) se hace en el corte.
  const llevo = tipo === "retiro";
  if (llevo && s.usuario.rol !== "duena") return { error: "Solo Titular puede sacar efectivo de la caja. Lo de la dueña se saca en el corte." };
  const quien = texto(form, "quien", 80).trim();
  const concepto = llevo ? `${CONCEPTO_DUENA}${quien ? `, lo recogió ${quien}` : ""}` : texto(form, "concepto");
  if (tipo !== "entrada" && tipo !== "retiro") return { error: "Elige qué pasó con el dinero." };
  if (!monto) return { error: "Escribe el monto." };
  if (!concepto) return { error: "Escribe para qué fue." };
  const turno = await cajaDe(s);
  // Si se presiona varias veces, se guarda una sola.
  if (await repetido(s, tipo, monto, concepto)) return listo(llevo ? `Se registró que te llevaste ${formatoDinero(monto)}.` : `Entrada de ${formatoDinero(monto)} guardada.`);
  if (!turno) return guardarPendiente(s, tipo, monto, concepto, null);
  if (llevo) {
    const d = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
    if (monto > d.esperado) return { error: `En la caja solo hay ${formatoDinero(Math.max(0, d.esperado))}.` };
  }
  await db.transaction(async (tx) => {
    await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo, monto, concepto, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: llevo ? `${s.usuario.nombre} se llevó ${formatoDinero(monto)} de la caja${quien ? ` (lo recogió ${quien})` : ""}` : `${s.usuario.nombre} registró una entrada de ${formatoDinero(monto)}`, detalle: { concepto },
    });
  });
  return listo(llevo ? `Se registró que te llevaste ${formatoDinero(monto)}.` : `Entrada de ${formatoDinero(monto)} guardada.`);
}

/**
 * Depósito a la dueña de lo acumulado del negocio. Lo puede registrar cualquiera del equipo, con su comprobante.
 * No toca la caja (ese dinero ya salió en los cortes): solo baja lo que se le debe, cubriendo primero lo más viejo.
 */
export async function registrarDeposito(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  const monto = leerPesos(texto(form, "monto"));
  if (!monto) return { error: "Escribe cuánto depositaste." };
  const archivo = String(form.get("comprobante") ?? "");
  const nombre = texto(form, "comprobanteNombre", 120) || "comprobante";
  if (!archivo) return { error: "Adjunta el comprobante del depósito." };
  if (!TIPOS_ADJUNTO.test(archivo) || archivo.length > MAX_ADJUNTO) return { error: "El comprobante debe ser una foto o un PDF de máximo 1 MB." };
  // Si se presiona varias veces, se guarda una sola.
  const [ya] = await db.select({ id: schema.negocioDuena.id }).from(schema.negocioDuena).where(and(eq(schema.negocioDuena.barberiaId, s.barberia.id), eq(schema.negocioDuena.tipo, "deposito"),
    eq(schema.negocioDuena.monto, monto), eq(schema.negocioDuena.usuarioId, s.usuario.id), isNull(schema.negocioDuena.anuladoEn), sql`${schema.negocioDuena.creadoEn} > now() - interval '30 seconds'`)).limit(1);
  if (ya) return listo(`Depósito de ${formatoDinero(monto)} guardado.`);
  const { saldo } = await cuentaDuena(s.barberia.id);
  if (saldo <= 0) return { error: "No hay nada pendiente de depositar a la dueña." };
  if (monto > saldo) return { error: `Solo hay ${formatoDinero(saldo)} pendientes de depositar. Revisa el monto.` };
  await db.transaction(async (tx) => {
    await tx.insert(schema.negocioDuena).values({ barberiaId: s.barberia.id, tipo: "deposito", monto, usuarioId: s.usuario.id,
      comprobanteNombre: nombre, comprobanteTipo: archivo.slice(5, archivo.indexOf(";")), comprobanteDatos: archivo });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} registró un depósito a la dueña de ${formatoDinero(monto)}`, detalle: { depositoDuena: monto, quedan: saldo - monto } });
  });
  revalidatePath("/", "layout");
  return listo(saldo - monto > 0 ? `Depósito de ${formatoDinero(monto)} guardado. Quedan ${formatoDinero(saldo - monto)} pendientes de depositar.` : `Depósito de ${formatoDinero(monto)} guardado. Ya no hay nada pendiente de depositar.`);
}

/** Anula un depósito a la dueña que se registró por error. Lo puede hacer cualquiera del equipo, con el motivo. Lo pendiente vuelve a subir. */
export async function anularDeposito(_: EstadoCaja, form: FormData): Promise<EstadoCaja> {
  const s = await requerirSesion();
  const id = texto(form, "id", 40);
  const motivo = texto(form, "motivo", 200).trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "No se encontró el depósito." };
  if (!motivo) return { error: "Escribe por qué se anula." };
  const ok = await db.transaction(async (tx) => {
    const [d] = await tx.update(schema.negocioDuena).set({ anuladoEn: new Date(), anuladoPor: s.usuario.id })
      .where(and(eq(schema.negocioDuena.id, id), eq(schema.negocioDuena.barberiaId, s.barberia.id), eq(schema.negocioDuena.tipo, "deposito"), isNull(schema.negocioDuena.anuladoEn)))
      .returning({ monto: schema.negocioDuena.monto });
    if (!d) return false;
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} anuló un depósito a la dueña de ${formatoDinero(d.monto)}`, detalle: { depositoAnulado: id, monto: d.monto, motivo } });
    return true;
  });
  if (!ok) return { error: "Ese depósito ya estaba anulado." };
  revalidatePath("/", "layout");
  return listo("Depósito anulado. Lo pendiente de depositar volvió a subir.");
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
  if (await repetido(s, "gasto", monto, concepto)) return listo(`Gasto de ${formatoDinero(monto)} guardado.`);
  if (!turno) return guardarPendiente(s, "gasto", monto, concepto, categoria);
  // No puede salir más efectivo del que hay en la caja; lo pagado con transferencia o tarjeta es un egreso.
  const d = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
  if (monto > d.esperado) return { error: `En la caja solo hay ${formatoDinero(Math.max(0, d.esperado))}. Si lo pagaste con transferencia o tarjeta, regístralo como egreso.` };
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
const MES_CORTO: Record<string, string> = { enero: "ene", febrero: "feb", marzo: "mar", abril: "abr", mayo: "may", junio: "jun", julio: "jul", agosto: "ago", septiembre: "sep", octubre: "oct", noviembre: "nov", diciembre: "dic" };
/** "Pago automático del 10 de noviembre al 15 de noviembre" pasa a "10 al 15 nov". Sin comas ni paréntesis, para que el resumen se pueda leer. */
const diasCortos = (t: string) => t.replace(/^\s*Pago automático\s*/i, "").replace(/^(de|del)\s+/i, "")
  .replace(/ de ([a-záéíóú]+)/gi, (_, m: string) => ` ${MES_CORTO[m.toLowerCase()] ?? m}`).replace(/(\d+) (\w+) al (\d+) \2\b/, "$1 al $3 $2").replace(/[(),]/g, "").trim();

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
  {
    const datosE = form.getAll("evidencia").map(String), nombres = form.getAll("evidenciaNombre").map(String), etiquetas = form.getAll("evidenciaEtiqueta").map(String);
    if (datosE.length > 6) return { error: "Se pueden adjuntar hasta 6 archivos." };
    for (let i = 0; i < datosE.length; i++) {
      if (!datosE[i]) continue;
      if (!TIPOS_ADJUNTO.test(datosE[i]) || datosE[i].length > MAX_ADJUNTO) return { error: "Cada evidencia debe ser una foto o un PDF de máximo 1 MB." };
      evidencias.push({ etiqueta: (etiquetas[i] ?? "").slice(0, 60), nombre: (nombres[i] ?? "evidencia").slice(0, 120), tipo: datosE[i].slice(5, datosE[i].indexOf(";")), datos: datosE[i] });
    }
  }
  const datos = await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial);
  // Comisiones automáticas: lo que se paga hoy se liquida al cerrar. La pantalla dice cuánto efectivo se le dio a cada quien
  // (lo que alcanzó en la caja); lo que falta queda para el próximo corte o se pasa a transferencia.
  type Pend = { id: string; barberoId: string; monto: number; nota: string; nombre: string; semana: string; usuarioId: string; creadoEn: Date };
  let pend: Pend[] = [];
  // Caja compartida: el corte es uno para todo el equipo, así que se entrega lo de todos, cierre quien cierre.
  const verTodo = s.puede("ventas.ver_todas") || s.puede("equipo.pagar") || s.barberia.modeloCaja !== "individual";
  if (s.barberia.pagosEquipoAuto) {
    await liquidarAutomaticos(s.barberia.id, true);
    pend = (await db.select({ id: schema.pagosComision.id, barberoId: schema.pagosComision.barberoId, monto: schema.pagosComision.monto, nota: schema.pagosComision.nota, nombre: schema.usuarios.nombre,
      semana: schema.pagosComision.semana, usuarioId: schema.pagosComision.usuarioId, creadoEn: schema.pagosComision.creadoEn })
      .from(schema.pagosComision).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pagosComision.barberoId))
      .where(and(eq(schema.pagosComision.barberiaId, s.barberia.id), eq(schema.pagosComision.tipo, "pago"), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`), sql`${schema.pagosComision.monto} > 0`))
      .orderBy(schema.pagosComision.creadoEn))
      // Solo se tocan las que se mostraron en el corte; las demás siguen pendientes.
      .filter((x) => verTodo || x.barberoId === s.usuario.id);
  }
  // Propinas del turno: se calculan aquí con lo guardado, no con lo que mande la pantalla.
  // Solo las propinas que se mostraron: quien no ve al equipo entrega solo las suyas; las demás siguen en la caja.
  const propTurno = (await propinasDeTurno(s.barberia.id, turno.id)).filter((p) => verTodo || p.id === s.usuario.id);
  // Lo que se decidió para cada persona. "efectivo" es lo que se le dio de la caja (en centavos); si falta (pantalla anterior), se usa la decisión vieja.
  type Parte = { fila: Pend; deCaja: number; resto: number; transf: boolean };
  const partes: Parte[] = [];
  const resumenCom: string[] = [];
  const porPersona = new Map<string, { nombre: string; comCaja: number; propCaja: number; propTransf: number; efectivo: number }>();
  for (const id of new Set([...pend.map((x) => x.barberoId), ...propTurno.map((p) => p.id)])) {
    const filas = pend.filter((x) => x.barberoId === id);
    const prop = propTurno.find((p) => p.id === id);
    const otro = prop?.otro ?? 0;
    const totalCom = filas.reduce((a, x) => a + x.monto, 0);
    const crudo = form.get(`efectivo:${id}`);
    const decision = texto(form, `entrega:${id}`);
    const restoTransf = decision === "transferencia";
    let dar: number;
    let propTransf = 0;
    if (crudo === null) {
      // Pantalla vieja: "caja" daba todo de la caja; lo demás no sacaba comisión. Las propinas con tarjeta, según su campo.
      propTransf = texto(form, `propina:${id}`) === "transferencia" ? otro : 0;
      dar = (decision === "caja" ? totalCom : 0) + (otro - propTransf);
    } else {
      dar = Math.max(0, Math.min(Math.round(Number(crudo) || 0), totalCom + otro));
    }
    // Primero las propinas con tarjeta (salen de la caja), después la comisión más vieja.
    const propCaja = Math.min(otro - propTransf, dar);
    propTransf = otro - propCaja;
    let queda = dar - propCaja;
    let comCaja = 0;
    for (const f of filas) {
      const deCaja = Math.min(f.monto, queda);
      queda -= deCaja; comCaja += deCaja;
      partes.push({ fila: f, deCaja, resto: f.monto - deCaja, transf: restoTransf });
    }
    const nombre = (filas[0]?.nombre ?? prop?.nombre ?? "").split(" ")[0];
    // Un renglón por pago, con sus días: así cada pago se encuentra después en su corte y un pendiente se puede seguir de corte en corte.
    for (const p of partes.filter((x) => x.fila.barberoId === id)) {
      const dias = diasCortos(p.fila.nota.slice(POR_ENTREGAR.length + 2));
      if (p.deCaja) resumenCom.push(`${nombre} ${formatoDinero(p.deCaja)} de la caja`);
      if (p.resto) resumenCom.push(`${nombre} ${formatoDinero(p.resto)} ${restoTransf ? "por transferencia" : "para el próximo corte"}${dias ? ` (${dias})` : ""}`);
    }
    porPersona.set(id, { nombre, comCaja, propCaja, propTransf, efectivo: prop?.efectivo ?? 0 });
  }
  const deCaja = [...porPersona.values()].reduce((a, x) => a + x.comCaja, 0);
  const propinasSalen = [...porPersona.values()].reduce((a, x) => a + x.efectivo + x.propCaja, 0);
  datos.esperado -= deCaja + propinasSalen;
  // Lo del negocio se acumula solo para la dueña: le toca lo cobrado menos lo del equipo, lo que ya le llegó por otras formas de pago,
  // los gastos de caja y lo que ya se llevó. Sale de la caja lo que alcance arriba del fondo; si no alcanza, lo demás se le sigue debiendo.
  // Nunca se da por depositado: el depósito se registra aparte en Movimiento de caja.
  const leToca = await leTocaAlNegocio(s.barberia.id, turno.id, datos);
  const enCajaNegocio = Math.min(leToca, Math.max(0, datos.esperado - turno.fondoInicial));
  datos.esperado -= enCajaNegocio;
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
    for (const p of partes) {
      const f = p.fila;
      const de = f.nota.slice(POR_ENTREGAR.length + 2);
      if (p.deCaja > 0) {
        // Lo que se dio de la caja queda como entregado; si fue solo una parte, lo que falta sigue como pago aparte.
        await tx.update(schema.pagosComision).set({ monto: p.deCaja, nota: `Efectivo de caja: ${de} (entregado en el corte)`.slice(0, 200) })
          .where(and(eq(schema.pagosComision.id, f.id), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`)));
        if (p.resto > 0) await tx.insert(schema.pagosComision).values({ barberiaId: s.barberia.id, barberoId: f.barberoId, tipo: "pago", monto: p.resto, semana: f.semana,
          nota: `${p.transf ? "Transferencia" : POR_ENTREGAR}: ${de}`.slice(0, 200), usuarioId: f.usuarioId, creadoEn: f.creadoEn });
      } else if (p.transf) {
        await tx.update(schema.pagosComision).set({ nota: `Transferencia: ${de}`.slice(0, 200) })
          .where(and(eq(schema.pagosComision.id, f.id), like(schema.pagosComision.nota, `${POR_ENTREGAR}:%`)));
      }
    }
    if (enCajaNegocio > 0) await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo: "retiro", monto: enCajaNegocio,
      concepto: CONCEPTO_ACUMULADO, usuarioId: s.usuario.id });
    if (leToca > 0) await tx.insert(schema.negocioDuena).values({ barberiaId: s.barberia.id, tipo: "acumulado", turnoId: turno.id, monto: leToca, enCaja: enCajaNegocio, usuarioId: s.usuario.id, creadoEn: cerradoEn });
    for (const [id, x] of porPersona) {
      if (x.comCaja > 0) await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo: "retiro", monto: x.comCaja, concepto: `Pago de comisiones a ${x.nombre}`, usuarioId: s.usuario.id });
      // La propina con tarjeta que se manda por transferencia no toca la caja, pero queda como movimiento.
      if (x.propTransf > 0) await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "equipo",
        accion: `Propina por transferencia a ${x.nombre}: ${formatoDinero(x.propTransf)}`, detalle: { propinaTransferencia: x.propTransf, barberoId: id, turnoId: turno.id } });
      if (x.efectivo + x.propCaja > 0) await tx.insert(schema.movimientosCaja).values({ barberiaId: s.barberia.id, turnoId: turno.id, tipo: "retiro", monto: x.efectivo + x.propCaja, concepto: `${CONCEPTO_PROPINA} ${x.nombre}`, usuarioId: s.usuario.id });
    }
    if (evidencias.length) await tx.insert(schema.evidenciasCorte).values(evidencias.map((e) => ({ ...e, barberiaId: s.barberia.id, turnoId: turno.id, subidoPor: s.usuario.id })));
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} hizo el corte de caja. ${r.texto}`, detalle: { esperado: datos.esperado, contado, diferencia: r.diferencia, notas, verificacion, evidencias: evidencias.length || undefined,
        propinas: [...porPersona.values()].some((x) => x.efectivo + x.propCaja + x.propTransf) ? [...porPersona.values()].filter((x) => x.efectivo + x.propCaja + x.propTransf)
          .map((x) => `${x.nombre} ${[x.efectivo ? `${formatoDinero(x.efectivo)} en efectivo, aparte` : "", x.propCaja ? `${formatoDinero(x.propCaja)} con tarjeta de la caja` : "", x.propTransf ? `${formatoDinero(x.propTransf)} con tarjeta por transferencia` : ""].filter(Boolean).join(" y ")}`).join(", ") : undefined,
        comisiones: resumenCom.length ? resumenCom.join(", ") : undefined,
        negocio: leToca > 0 ? `Pendiente de depositar a la dueña ${formatoDinero(leToca)}${enCajaNegocio < leToca ? `, ${formatoDinero(enCajaNegocio)} salieron de la caja y ${formatoDinero(leToca - enCajaNegocio)} no alcanzaron` : ""}` : undefined },
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
  const R = "/analitica/finanzas?tipo=cortes";
  const turnoId = texto(form, "turnoId", 40);
  const signo = texto(form, "signo") === "menos" ? -1 : 1;
  const monto = leerPesos(texto(form, "monto"));
  const motivo = texto(form, "motivo", 300);
  if (!monto || !motivo) volver(R, { error: "Escribe el monto y el motivo de la corrección." });
  const [t] = await db.select().from(schema.turnosCaja)
    .where(and(eq(schema.turnosCaja.id, turnoId), eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "cerrado"))).limit(1);
  if (!t) volver(R, { error: "No se encontró ese cierre." });
  // Un doble toque no registra el mismo ajuste dos veces.
  const [ya] = await db.select({ id: schema.ajustesCierre.id }).from(schema.ajustesCierre).where(and(eq(schema.ajustesCierre.turnoId, t.id), eq(schema.ajustesCierre.monto, signo * monto!),
    eq(schema.ajustesCierre.usuarioId, s.usuario.id), sql`${schema.ajustesCierre.creadoEn} > now() - interval '30 seconds'`)).limit(1);
  if (ya) volver(R, { aviso: "guardado" });
  await db.transaction(async (tx) => {
    await tx.insert(schema.ajustesCierre).values({ barberiaId: s.barberia.id, turnoId: t.id, monto: signo * monto, motivo, usuarioId: s.usuario.id });
    await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja",
      accion: `${s.usuario.nombre} corrigió el cierre del ${t.fechaOperativa} en ${signo < 0 ? "−" : ""}${formatoDinero(monto)}`, detalle: { motivo },
    });
  });
  revalidatePath("/analitica/finanzas");
  volver(R, { aviso: "guardado" });
}

/** Marca como revisado un corte en el que faltó dinero. */
export async function marcarRevisado(form: FormData) {
  const s = await requerirSesion("caja.corregir");
  const R = "/analitica/finanzas?tipo=cortes";
  const turnoId = texto(form, "turnoId", 40);
  const [t] = await db.update(schema.turnosCaja).set({ revisadoPor: s.usuario.id, revisadoEn: new Date() })
    .where(and(eq(schema.turnosCaja.id, turnoId), eq(schema.turnosCaja.barberiaId, s.barberia.id), eq(schema.turnosCaja.estado, "cerrado")))
    .returning({ fecha: schema.turnosCaja.fechaOperativa });
  if (!t) volver(R, { error: "No se encontró ese corte." });
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "caja", accion: `${s.usuario.nombre} marcó como revisado el corte del ${fechaLarga(t.fecha).toLowerCase()}` });
  revalidatePath("/analitica/finanzas");
}
