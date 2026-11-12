"use server";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { leerConfig, montoAPagar } from "@/lib/agenda";
import { pagosLinea } from "@/lib/db/schema";
import { cobraEnLinea, crearIntento, MINIMO_STRIPE } from "@/lib/stripe";
import { cargoEnLinea } from "@/lib/cargo";
import { reembolsarCita } from "@/lib/pagos";
import { avisosDeConfirmacion, crearCita, diasConLugar, disponibilidadDia, encolarAviso, equipoAgenda, serviciosDeCita, telefonoValido, textoCita } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { fechaLocal, sumarDias } from "@/lib/fechas";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El negocio de una página pública, solo si tiene las reservaciones en línea activas. */
async function negocio(slug: string) {
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.slug, String(slug).slice(0, 40))).limit(1);
  if (!b || !b.usaCitas || b.estadoCuenta !== "activa") return null;
  const config = leerConfig(b.citasConfig);
  return config.enLinea ? { b, config } : null;
}

const ids = (xs: unknown) => (Array.isArray(xs) ? xs.slice(0, 6).map(String) : []);

export async function diasPublicos(slug: string, servicioIds: string[], persona: string | null) {
  const n = await negocio(slug);
  if (!n) return {};
  const hoy = fechaLocal(new Date(), n.b.zonaHoraria);
  const svc = await serviciosDeCita(n.b, ids(servicioIds), "linea", hoy, 600);
  if (!svc) return {};
  const fechas = Array.from({ length: Math.min(n.config.anticipacionMaxDias + 1, 60) }, (_, i) => sumarDias(hoy, i));
  return diasConLugar(n.b, fechas, svc.duracion, persona && n.config.elegirBarbero ? persona : null);
}

export async function horariosPublicos(slug: string, fecha: string, servicioIds: string[], persona: string | null) {
  const n = await negocio(slug);
  if (!n || !FECHA.test(fecha)) return [];
  const svc = await serviciosDeCita(n.b, ids(servicioIds), "linea", fecha, 600);
  if (!svc) return [];
  const libres = await disponibilidadDia(n.b, fecha, svc.duracion, persona && n.config.elegirBarbero ? persona : null);
  return libres.map((x) => x.minuto);
}

/** Precio con promociones para el resumen (se recalcula igual al reservar). */
export async function cotizar(slug: string, fecha: string, minuto: number, servicioIds: string[]) {
  const n = await negocio(slug);
  if (!n || !FECHA.test(fecha)) return null;
  const svc = await serviciosDeCita(n.b, ids(servicioIds), "linea", fecha, Number(minuto) || 600);
  return svc ? { filas: svc.filas, total: svc.total, duracion: svc.duracion } : null;
}

type DatosReserva = { servicioIds: string[]; persona: string | null; fecha: string; minuto: number; nombre: string; telefono: string; notas: string; sitio?: string };

export async function reservar(slug: string, d: DatosReserva, apartar = false): Promise<{ error?: string; token?: string; citaId?: string }> {
  // Campo trampa: las personas no lo ven; los robots lo llenan.
  if (d.sitio) return { error: "No se pudo completar la reservación." };
  const n = await negocio(slug);
  if (!n) return { error: "Las reservaciones en línea no están disponibles." };
  const nombre = String(d.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const tel = telefonoValido(String(d.telefono ?? ""));
  if (nombre.length < 2) return { error: "Escribe tu nombre." };
  if (!tel) return { error: "Escribe tu teléfono a 10 dígitos." };
  if (!FECHA.test(d.fecha) || !Number.isInteger(d.minuto)) return { error: "Elige el día y la hora." };
  const servicioIds = ids(d.servicioIds);
  if (!servicioIds.length) return { error: "Elige un servicio." };
  if (d.persona && !n.config.elegirBarbero) d.persona = null;
  if (!d.persona && !n.config.cualquierBarbero) return { error: "Elige quién te atiende." };
  // Un mismo teléfono no puede tener más de 3 citas pendientes.
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(schema.citas)
    .where(and(eq(schema.citas.barberiaId, n.b.id), eq(schema.citas.clienteTelefono, tel), inArray(schema.citas.estado, ["en_espera", "llego"]), gt(schema.citas.inicio, new Date())));
  if (c >= 3) return { error: "Ya tienes 3 citas pendientes con nosotros. Para otra, comunícate al negocio." };
  void (await headers());
  const r = await crearCita(n.b, { servicioIds, persona: d.persona, fecha: d.fecha, minuto: d.minuto, nombre, telefono: tel, observaciones: String(d.notas ?? ""), origen: "linea", apartar });
  if ("error" in r) return { error: r.error };
  return { token: r.cita.token, citaId: r.cita.id };
}

/**
 * Reservar pagando en línea: aparta el horario unos minutos y crea el intento de pago en la cuenta del negocio.
 * La cita se confirma solo cuando Stripe avisa que el pago entró; si no se paga, el apartado vence solo.
 */
export async function prepararPagoReserva(slug: string, d: DatosReserva, forma: "anticipo" | "total"): Promise<{ error?: string; secreto?: string; token?: string; monto?: number }> {
  const n = await negocio(slug);
  if (!n || !cobraEnLinea(n.b)) return { error: "El pago en línea no está disponible. Puedes reservar y pagar en el negocio." };
  if (n.config.pago.modo === "sin_pago") return { error: "Este negocio no pide pago al reservar." };
  const r = await reservar(slug, d, true);
  if (r.error || !r.citaId) return { error: r.error ?? "No se pudo apartar el horario." };
  const [c] = await db.select().from(schema.citas).where(eq(schema.citas.id, r.citaId)).limit(1);
  const anticipo = montoAPagar(c.total, n.config.pago).minimo;
  const monto = forma === "total" || n.config.pago.modo === "completo" || n.config.pago.modo === "opcional" ? c.total : anticipo;
  const cargo = cargoEnLinea(monto);
  if (monto + cargo < MINIMO_STRIPE) return { error: "El monto es muy bajo para pagar en línea. Reserva y paga en el negocio." };
  try {
    const [pago] = await db.insert(pagosLinea).values({
      barberiaId: n.b.id, tipo: "cita", token: randomBytes(12).toString("base64url"), citaId: c.id, monto,
      detalle: { negocio: n.b.nombre, folio: c.folio, servicios: c.servicios.map((x) => x.nombre), total: c.total, cargo },
    }).returning();
    const pi = await crearIntento(n.b.stripeCuenta!, {
      monto: monto + cargo, descripcion: `${n.b.nombre}: ${monto < c.total ? "anticipo de " : ""}cita ${c.folio}`,
      metadata: { pagoId: pago.id, barberiaId: n.b.id, tipo: "cita", citaId: c.id }, clave: `cita-${c.id}`,
    });
    await db.update(pagosLinea).set({ intento: pi.id }).where(eq(pagosLinea.id, pago.id));
    return { secreto: pi.client_secret ?? undefined, token: c.token, monto };
  } catch (err) {
    console.error(err);
    // Sin intento de pago no hay nada que pagar: se libera el horario.
    await db.update(schema.citas).set({ estado: "expirada" }).where(and(eq(schema.citas.id, c.id), eq(schema.citas.estado, "apartada")));
    return { error: "No se pudo preparar el pago. Intenta otra vez en un momento." };
  }
}

async function citaPorToken(token: string) {
  const [c] = await db.select().from(schema.citas).where(eq(schema.citas.token, String(token).slice(0, 60))).limit(1);
  if (!c) return null;
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, c.barberiaId)).limit(1);
  return b ? { c, b, config: leerConfig(b.citasConfig) } : null;
}

const puedeCambiar = (inicio: Date, horas: number) => inicio.getTime() - Date.now() >= horas * 3600e3;

export async function cancelarPorCliente(token: string): Promise<{ error?: string }> {
  const x = await citaPorToken(token);
  if (!x || !["en_espera", "apartada"].includes(x.c.estado)) return { error: "Esta cita ya no se puede cancelar." };
  if (!puedeCambiar(x.c.inicio, x.config.cancelarHorasAntes)) return { error: `Solo se puede cancelar hasta ${x.config.cancelarHorasAntes} horas antes. Comunícate al negocio.` };
  await db.transaction(async (tx) => {
    await tx.update(schema.citas).set({ estado: "cancelada", motivoCancelacion: "Cancelada por el cliente", actualizadoEn: new Date() }).where(eq(schema.citas.id, x.c.id));
    await tx.update(schema.notificacionesCita).set({ estado: "omitida" }).where(and(eq(schema.notificacionesCita.citaId, x.c.id), eq(schema.notificacionesCita.estado, "pendiente")));
    await encolarAviso(tx, { barberiaId: x.b.id, citaId: x.c.id, tipo: "cita_cancelada", para: "cliente", destino: x.c.clienteTelefono, mensaje: `Tu cita ${x.c.folio} en ${x.b.nombre} quedó cancelada.` });
    await encolarAviso(tx, { barberiaId: x.b.id, citaId: x.c.id, tipo: "cita_cancelada", para: "negocio", mensaje: `${x.c.clienteNombre} canceló su cita ${x.c.folio}.` });
  });
  // Lo pagado en línea se devuelve solo (la cancelación ya está dentro del tiempo permitido).
  if (x.c.pagado > 0) await reembolsarCita(x.c.id, { barberiaId: x.b.id, usuarioId: null, nombre: x.c.clienteNombre }).catch((err) => console.error("reembolso", err));
  return {};
}

/** Con quién queda la cita al cambiarla: la misma persona, otra que el negocio deje elegir o quien esté libre. */
async function personaCambio(x: NonNullable<Awaited<ReturnType<typeof citaPorToken>>>, persona: string | undefined) {
  if (persona === undefined) return x.c.indiferente ? null : x.c.barberoId;
  if (persona === "") return x.config.cualquierBarbero ? null : x.c.barberoId;
  if (!x.config.elegirBarbero) return x.c.barberoId;
  const equipo = await equipoAgenda(x.b.id);
  return equipo.some((e) => e.id === persona) ? persona : x.c.barberoId;
}

export async function horariosParaCambio(token: string, fecha: string, persona?: string) {
  const x = await citaPorToken(token);
  if (!x || !FECHA.test(fecha)) return [];
  const libres = await disponibilidadDia(x.b, fecha, x.c.duracionMin, await personaCambio(x, persona), db, { ignorarCita: x.c.id });
  return libres.map((l) => l.minuto);
}

export async function cambiarPorCliente(token: string, fecha: string, minuto: number, personaElegida?: string): Promise<{ error?: string }> {
  const x = await citaPorToken(token);
  if (!x || x.c.estado !== "en_espera") return { error: "Esta cita ya no se puede cambiar." };
  if (!puedeCambiar(x.c.inicio, x.config.cancelarHorasAntes)) return { error: `Solo se puede cambiar hasta ${x.config.cancelarHorasAntes} horas antes. Comunícate al negocio.` };
  if (!FECHA.test(fecha) || !Number.isInteger(minuto)) return { error: "Elige el día y la hora." };
  const { instante } = await import("@/lib/agenda");
  const inicio = new Date(instante(fecha, minuto, x.b.zonaHoraria));
  const equipo = await equipoAgenda(x.b.id);
  const quiere = await personaCambio(x, personaElegida);
  const ok = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`citas:${x.b.id}`}))`);
    const libres = await disponibilidadDia(x.b, fecha, x.c.duracionMin, quiere, tx, { ignorarCita: x.c.id });
    const slot = libres.find((l) => l.minuto === minuto);
    if (!slot) return null;
    const persona = quiere ?? (slot.personas.includes(x.c.barberoId) ? x.c.barberoId : slot.personas[0]);
    const [c] = await tx.update(schema.citas).set({ inicio, fin: new Date(inicio.getTime() + x.c.duracionMin * 60000), barberoId: persona, indiferente: quiere === null, actualizadoEn: new Date() }).where(eq(schema.citas.id, x.c.id)).returning();
    await tx.update(schema.notificacionesCita).set({ estado: "omitida" }).where(and(eq(schema.notificacionesCita.citaId, x.c.id), eq(schema.notificacionesCita.estado, "pendiente")));
    const quien = equipo.find((e) => e.id === persona)?.nombre.split(" ")[0] ?? "";
    await encolarAviso(tx, { barberiaId: x.b.id, citaId: c.id, tipo: "cita_modificada", para: "negocio", mensaje: `${c.clienteNombre} cambió su cita ${c.folio}: ${textoCita(x.b, c, quien, c.servicios.map((s) => s.nombre).join(", "))}` });
    await avisosDeConfirmacion(tx, x.b, { ...c, origen: "negocio" }, quien);
    return c;
  });
  return ok ? {} : { error: "Ese horario se acaba de ocupar. Elige otro." };
}

