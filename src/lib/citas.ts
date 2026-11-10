// Citas: lectura de la agenda, disponibilidad con datos reales y alta de citas sin empalmes.
// Módulo de servidor (no son acciones): lo usan las páginas y las acciones.

import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "./db";
import { aplicarPromos, type Promo } from "./promociones";
import { diaSemana, horariosLibres, instante, leerConfig, type Ocupado, type Rotacion, ventanaDelDia, type Horario } from "./agenda";
import { formatoDinero } from "./money";

export const ESTADOS_ACTIVOS = ["apartada", "en_espera", "llego", "en_atencion", "completada"] as const;
export const NOMBRE_ESTADO: Record<string, string> = {
  apartada: "Apartada", en_espera: "En espera", llego: "Llegó", en_atencion: "En atención", completada: "Completada",
  no_asistio: "No asistió", cancelada: "Cancelada", expirada: "Sin confirmar",
};
export const NOMBRE_PAGO: Record<string, string> = { sin_pago: "Sin pago", anticipo: "Anticipo pagado", pagada: "Pagada" };

type Barberia = typeof schema.barberias.$inferSelect;
type Conn = Tx | typeof db;

/** Personas que atienden citas, con su horario propio. */
export async function equipoAgenda(barberiaId: string, conn: Conn = db) {
  return conn.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar, horario: schema.usuarios.horario })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.barberiaId, barberiaId), eq(schema.usuarios.activo, true), eq(schema.usuarios.atiendeCitas, true), inArray(schema.usuarios.rol, ["barbera", "encargada"])))
    .orderBy(asc(schema.usuarios.nombre));
}

export async function rotacionesDe(barberiaId: string, conn: Conn = db): Promise<Rotacion[]> {
  return conn.select({ persona1: schema.rotacionesDescanso.persona1, persona2: schema.rotacionesDescanso.persona2, dia1: schema.rotacionesDescanso.dia1, dia2: schema.rotacionesDescanso.dia2, semanaInicio: schema.rotacionesDescanso.semanaInicio, activo: schema.rotacionesDescanso.activo })
    .from(schema.rotacionesDescanso).where(eq(schema.rotacionesDescanso.barberiaId, barberiaId));
}

/** Citas que ocupan horario y bloqueos entre dos instantes. Las apartadas vencidas ya no cuentan. */
export async function ocupadosEntre(barberiaId: string, desde: number, hasta: number, conn: Conn = db, ignorar?: string, conBloqueos = true): Promise<Ocupado[]> {
  const ahora = new Date();
  const [cs, bs] = await Promise.all([
    conn.select({ persona: schema.citas.barberoId, inicio: schema.citas.inicio, fin: schema.citas.fin, id: schema.citas.id }).from(schema.citas)
      .where(and(eq(schema.citas.barberiaId, barberiaId), lt(schema.citas.inicio, new Date(hasta)), gt(schema.citas.fin, new Date(desde)),
        inArray(schema.citas.estado, [...ESTADOS_ACTIVOS]),
        or(sql`${schema.citas.estado} <> 'apartada'`, gt(schema.citas.expiraEn, ahora)))),
    conn.select({ persona: schema.bloqueosAgenda.usuarioId, inicio: schema.bloqueosAgenda.inicio, fin: schema.bloqueosAgenda.fin }).from(schema.bloqueosAgenda)
      .where(and(eq(schema.bloqueosAgenda.barberiaId, barberiaId), lt(schema.bloqueosAgenda.inicio, new Date(hasta)), gt(schema.bloqueosAgenda.fin, new Date(desde)))),
  ]);
  return [
    ...cs.filter((c) => c.id !== ignorar).map((c) => ({ persona: c.persona, inicio: c.inicio.getTime(), fin: c.fin.getTime() })),
    ...(conBloqueos ? bs : []).map((b) => ({ persona: b.persona, inicio: b.inicio.getTime(), fin: b.fin.getTime() })),
  ];
}

export type Disponibilidad = { minuto: number; personas: string[] }[];

/** Horarios libres de un día. Con persona, solo los suyos; sin persona, los de cualquiera (y quién está libre). */
export async function disponibilidadDia(b: Barberia, fecha: string, duracion: number, persona: string | null, conn: Conn = db, opciones: { ignorarCita?: string; sinAnticipacion?: boolean } = {}): Promise<Disponibilidad> {
  const config = leerConfig(b.citasConfig);
  if (opciones.sinAnticipacion) config.anticipacionMinMin = 0;
  const zona = b.zonaHoraria;
  const [equipo, rots, ocupados] = await Promise.all([
    equipoAgenda(b.id, conn), rotacionesDe(b.id, conn),
    ocupadosEntre(b.id, instante(fecha, 0, zona), instante(fecha, 24 * 60, zona), conn, opciones.ignorarCita, config.usaBloqueos),
  ]);
  const ahora = Date.now();
  const mapa = new Map<number, string[]>();
  for (const e of equipo) {
    if (persona && e.id !== persona) continue;
    const ventana = ventanaDelDia(fecha, b.horario as Horario, b.diasCerrados, config.usaHorarioPersona ? (e.horario as Horario | null) : null, config.usaRotacion ? rots : [], e.id);
    for (const m of horariosLibres({ fecha, zona, ahora, duracion, config, ventana, persona: e.id, ocupados })) mapa.set(m, [...(mapa.get(m) ?? []), e.id]);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([minuto, personas]) => ({ minuto, personas }));
}

/** Servicios elegidos con su precio y la promoción en línea que les toque. */
export async function serviciosDeCita(b: Barberia, ids: string[], canal: "linea" | "cobro", fecha: string, minuto: number) {
  const svc = await db.select().from(schema.servicios).where(and(eq(schema.servicios.barberiaId, b.id), eq(schema.servicios.activo, true), inArray(schema.servicios.id, ids)));
  const lista = ids.map((id) => svc.find((s) => s.id === id)).filter(Boolean) as typeof svc;
  if (lista.length !== ids.length) return null;
  const promos = b.usaPromociones ? (await db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, b.id))) as unknown as Promo[] : [];
  const momento = { fecha, dia: diaSemana(fecha), hora: `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}` };
  const ap = aplicarPromos(promos, lista.map((s) => ({ servicioId: s.id, categoria: s.categoria, precio: s.precio })), momento, "", canal);
  const filas = lista.map((s, i) => ({ servicioId: s.id, nombre: s.nombre, precio: s.precio, duracionMin: s.duracionMin || 30, descuento: ap.porLinea[i]?.descuento ?? 0, promocionId: ap.porLinea[i]?.promocionId ?? null }));
  return { filas, duracion: filas.reduce((a, f) => a + f.duracionMin, 0), total: filas.reduce((a, f) => a + f.precio - f.descuento, 0) };
}

export function telefonoValido(t: string) {
  const d = t.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13 ? d : null;
}

/** Guarda un aviso para enviarlo después (WhatsApp u otro medio, cuando se conecte). */
export async function encolarAviso(conn: Conn, a: { barberiaId: string; citaId: string; tipo: string; para: "cliente" | "negocio"; destino?: string; mensaje: string; programadaPara?: Date }) {
  await conn.insert(schema.notificacionesCita).values({ barberiaId: a.barberiaId, citaId: a.citaId, tipo: a.tipo, para: a.para, destino: a.destino ?? "", mensaje: a.mensaje, programadaPara: a.programadaPara ?? new Date() });
}

export function textoCita(b: { nombre: string; zonaHoraria: string }, c: { inicio: Date; folio: string }, quien: string, servicios: string) {
  const f = new Intl.DateTimeFormat("es-MX", { timeZone: b.zonaHoraria, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(c.inicio);
  return `${servicios} con ${quien}, ${f}. Folio ${c.folio}.`;
}

export type NuevaCita = {
  servicioIds: string[]; persona: string | null; fecha: string; minuto: number;
  nombre: string; telefono: string; observaciones?: string; origen: "linea" | "negocio"; creadoPor?: string | null;
  apartar?: boolean; // guardarla unos minutos mientras se paga
};

/**
 * Crea una cita revisando de nuevo, dentro de una transacción con candado por negocio,
 * que el horario siga libre. Así dos clientes no pueden tomar el mismo horario con la misma persona.
 */
export async function crearCita(b: Barberia, d: NuevaCita): Promise<{ error: string } | { cita: typeof schema.citas.$inferSelect }> {
  const config = leerConfig(b.citasConfig);
  const svc = await serviciosDeCita(b, d.servicioIds, d.origen === "linea" ? "linea" : "cobro", d.fecha, d.minuto);
  if (!svc || !svc.filas.length) return { error: "Uno de los servicios ya no está disponible." };
  if (d.origen === "linea" && svc.filas.length > 1 && !config.variosServicios) return { error: "Solo se puede reservar un servicio a la vez." };
  const equipo = await equipoAgenda(b.id);
  const nombres = new Map(equipo.map((e) => [e.id, e.nombre.split(" ")[0]]));
  const inicio = new Date(instante(d.fecha, d.minuto, b.zonaHoraria));
  const fin = new Date(inicio.getTime() + svc.duracion * 60000);
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`citas:${b.id}`}))`);
    // Apartados vencidos dejan de contar.
    await tx.update(schema.citas).set({ estado: "expirada" }).where(and(eq(schema.citas.barberiaId, b.id), eq(schema.citas.estado, "apartada"), lt(schema.citas.expiraEn, new Date())));
    const libres = await disponibilidadDia(b, d.fecha, svc.duracion, d.persona, tx, { sinAnticipacion: d.origen === "negocio" });
    const slot = libres.find((x) => x.minuto === d.minuto);
    if (!slot) return null;
    // Con "cualquier barbero" se asigna a quien tenga menos citas ese día.
    let persona = d.persona ?? slot.personas[0];
    if (!d.persona && slot.personas.length > 1) {
      const cuentas = await tx.select({ id: schema.citas.barberoId, n: sql<number>`count(*)::int` }).from(schema.citas)
        .where(and(eq(schema.citas.barberiaId, b.id), inArray(schema.citas.estado, [...ESTADOS_ACTIVOS]), gte(schema.citas.inicio, new Date(instante(d.fecha, 0, b.zonaHoraria))), lt(schema.citas.inicio, new Date(instante(d.fecha, 1440, b.zonaHoraria)))))
        .groupBy(schema.citas.barberoId);
      persona = [...slot.personas].sort((x, y) => (cuentas.find((c) => c.id === x)?.n ?? 0) - (cuentas.find((c) => c.id === y)?.n ?? 0))[0];
    }
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.citas).where(eq(schema.citas.barberiaId, b.id));
    const [cita] = await tx.insert(schema.citas).values({
      barberiaId: b.id, folio: `A-${String(n + 1).padStart(5, "0")}`, clienteNombre: d.nombre, clienteTelefono: d.telefono,
      barberoId: persona, indiferente: !d.persona, inicio, fin, duracionMin: svc.duracion, servicios: svc.filas, total: svc.total,
      estado: d.apartar ? "apartada" : "en_espera", expiraEn: d.apartar ? new Date(Date.now() + config.apartarMin * 60000) : null,
      observaciones: (d.observaciones ?? "").slice(0, 300), origen: d.origen, token: randomBytes(18).toString("base64url"), creadoPor: d.creadoPor ?? null,
    }).returning();
    if (!d.apartar) await avisosDeConfirmacion(tx, b, cita, nombres.get(persona) ?? "");
    return cita;
  });
  if (!resultado) return { error: "Ese horario se acaba de ocupar. Elige otro." };
  return { cita: resultado };
}

/** Avisos al confirmar: al cliente, al negocio y el recordatorio (un día antes, o dos horas antes si es pronto). */
export async function avisosDeConfirmacion(conn: Conn, b: Barberia, c: typeof schema.citas.$inferSelect, quien: string) {
  const servicios = c.servicios.map((s) => s.nombre).join(", ");
  const txt = textoCita(b, c, quien, servicios);
  await encolarAviso(conn, { barberiaId: b.id, citaId: c.id, tipo: "reserva_confirmada", para: "cliente", destino: c.clienteTelefono, mensaje: `Tu cita en ${b.nombre} quedó confirmada: ${txt}` });
  if (c.origen === "linea") await encolarAviso(conn, { barberiaId: b.id, citaId: c.id, tipo: "nueva_reserva", para: "negocio", mensaje: `Nueva reservación de ${c.clienteNombre}: ${txt} Total ${formatoDinero(c.total)}.` });
  const antes = c.inicio.getTime() - Date.now() > 26 * 3600e3 ? 24 * 3600e3 : 2 * 3600e3;
  const cuando = new Date(c.inicio.getTime() - antes);
  if (cuando.getTime() > Date.now()) await encolarAviso(conn, { barberiaId: b.id, citaId: c.id, tipo: "recordatorio", para: "cliente", destino: c.clienteTelefono, mensaje: `Te recordamos tu cita en ${b.nombre}: ${txt}`, programadaPara: cuando });
}

/** Qué días (de una lista) tienen al menos un horario libre. Carga todo de una vez. */
export async function diasConLugar(b: Barberia, fechas: string[], duracion: number, persona: string | null): Promise<Record<string, boolean>> {
  if (!fechas.length) return {};
  const config = leerConfig(b.citasConfig);
  const zona = b.zonaHoraria;
  const [equipo, rots, ocupados] = await Promise.all([
    equipoAgenda(b.id), rotacionesDe(b.id),
    ocupadosEntre(b.id, instante(fechas[0], 0, zona), instante(fechas[fechas.length - 1], 24 * 60, zona), db, undefined, config.usaBloqueos),
  ]);
  const ahora = Date.now();
  const r: Record<string, boolean> = {};
  for (const fecha of fechas) {
    r[fecha] = equipo.some((e) => (!persona || e.id === persona)
      && horariosLibres({ fecha, zona, ahora, duracion, config, ventana: ventanaDelDia(fecha, b.horario as Horario, b.diasCerrados, config.usaHorarioPersona ? (e.horario as Horario | null) : null, config.usaRotacion ? rots : [], e.id), persona: e.id, ocupados }).length > 0);
  }
  return r;
}
