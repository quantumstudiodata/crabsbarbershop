"use server";

import { and, eq, sql } from "drizzle-orm";
import { formatoDinero } from "@/lib/money";
import { reembolsarCita } from "@/lib/pagos";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { aMin, instante, leerConfig, type Horario, type ModoPago } from "@/lib/agenda";
import { crearCita, disponibilidadDia, encolarAviso, equipoAgenda, serviciosDeCita, telefonoValido, textoCita } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { leerPesos } from "@/lib/money";

export type Res = { error?: string; mensaje?: string; id?: string };
export type CitaLista = Res & { folio?: string; enlace?: string; con?: string; total?: number; negocio?: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horarios libres para agendar desde el negocio (sin la anticipación mínima del público). */
export async function horariosAgenda(fecha: string, servicioIds: string[], persona: string | null) {
  const s = await requerirSesion("citas.ver");
  if (!FECHA.test(fecha)) return [];
  const svc = await serviciosDeCita(s.barberia, servicioIds.slice(0, 6), "cobro", fecha, 600);
  if (!svc) return [];
  return disponibilidadDia(s.barberia, fecha, svc.duracion, persona, db, { sinAnticipacion: true });
}

/** Horarios libres para mover una cita (no choca consigo misma). */
export async function horariosCita(id: string, fecha: string, persona: string) {
  const s = await requerirSesion("citas.modificar");
  if (!FECHA.test(fecha)) return [];
  const [c] = await db.select({ duracion: schema.citas.duracionMin }).from(schema.citas).where(and(eq(schema.citas.id, id), eq(schema.citas.barberiaId, s.barberia.id))).limit(1);
  if (!c) return [];
  return disponibilidadDia(s.barberia, fecha, c.duracion, persona || null, db, { ignorarCita: id, sinAnticipacion: true });
}

export async function agendarCita(d: { servicioIds: string[]; persona: string | null; fecha: string; minuto: number; nombre: string; telefono: string; observaciones: string }): Promise<CitaLista> {
  const s = await requerirSesion("citas.modificar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const nombre = String(d.nombre ?? "").trim().slice(0, 80);
  const tel = telefonoValido(String(d.telefono ?? ""));
  if (!nombre) return { error: "Escribe el nombre del cliente." };
  if (!tel) return { error: "Escribe un teléfono de 10 dígitos." };
  if (!d.servicioIds?.length) return { error: "Elige al menos un servicio." };
  if (!FECHA.test(d.fecha) || !Number.isInteger(d.minuto)) return { error: "Elige el día y la hora." };
  const r = await crearCita(s.barberia, { ...d, nombre, telefono: tel, origen: "negocio", creadoPor: s.usuario.id, servicioIds: d.servicioIds.slice(0, 6) });
  if ("error" in r) return { error: r.error };
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "venta", accion: `${s.usuario.nombre} agendó la cita ${r.cita.folio} de ${nombre}` });
  revalidatePath("/citas");
  const [con] = await db.select({ nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.id, r.cita.barberoId)).limit(1);
  return { mensaje: "Cita agendada.", id: r.cita.id, folio: r.cita.folio, enlace: s.barberia.slug ? `/reservar/${s.barberia.slug}/cita/${r.cita.token}` : "", con: con?.nombre.split(" ")[0] ?? "", total: r.cita.total, negocio: s.barberia.nombre };
}

const SIGUIENTE: Record<string, string[]> = {
  en_espera: ["llego", "en_atencion", "completada", "no_asistio"],
  llego: ["en_atencion", "completada", "en_espera"],
  en_atencion: ["completada", "llego"],
  completada: ["en_atencion"],
  no_asistio: ["en_espera"],
};

export async function cambiarEstadoCita(id: string, estado: string): Promise<Res> {
  const s = await requerirSesion("citas.modificar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const [c] = await db.select().from(schema.citas).where(and(eq(schema.citas.id, id), eq(schema.citas.barberiaId, s.barberia.id))).limit(1);
  if (!c) return { error: "No se encontró la cita." };
  if (!SIGUIENTE[c.estado]?.includes(estado)) return { error: "Ese cambio no se puede hacer." };
  await db.update(schema.citas).set({ estado, actualizadoEn: new Date() }).where(eq(schema.citas.id, id));
  if (estado === "no_asistio") await db.update(schema.notificacionesCita).set({ estado: "omitida" }).where(and(eq(schema.notificacionesCita.citaId, id), eq(schema.notificacionesCita.estado, "pendiente")));
  revalidatePath("/citas");
  return {};
}

export async function cancelarCita(id: string, motivo: string): Promise<Res> {
  const s = await requerirSesion("citas.cancelar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const [c] = await db.select().from(schema.citas).where(and(eq(schema.citas.id, id), eq(schema.citas.barberiaId, s.barberia.id))).limit(1);
  if (!c || ["cancelada", "completada", "expirada"].includes(c.estado)) return { error: "Esa cita ya no se puede cancelar." };
  await db.transaction(async (tx) => {
    await tx.update(schema.citas).set({ estado: "cancelada", motivoCancelacion: String(motivo ?? "").slice(0, 200) || "Cancelada por el negocio", actualizadoEn: new Date() }).where(eq(schema.citas.id, id));
    await tx.update(schema.notificacionesCita).set({ estado: "omitida" }).where(and(eq(schema.notificacionesCita.citaId, id), eq(schema.notificacionesCita.estado, "pendiente")));
    await encolarAviso(tx, { barberiaId: s.barberia.id, citaId: id, tipo: "cita_cancelada", para: "cliente", destino: c.clienteTelefono, mensaje: `Tu cita ${c.folio} en ${s.barberia.nombre} fue cancelada.` });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "venta", accion: `${s.usuario.nombre} canceló la cita ${c.folio} de ${c.clienteNombre}`, detalle: { motivo } });
  });
  // Si el cliente pagó en línea, se le devuelve lo pagado.
  let devuelto = 0;
  if (c.pagado > 0) {
    const r = await reembolsarCita(id, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, nombre: s.usuario.nombre }).catch((err) => { console.error("reembolso", err); return { monto: 0, error: "No se pudo devolver el anticipo; devuélvelo desde el panel de Stripe." }; });
    if ("error" in r && r.error) { revalidatePath("/citas"); return { mensaje: `Cita cancelada. ${r.error}` }; }
    devuelto = r.monto;
  }
  revalidatePath("/citas");
  return { mensaje: devuelto ? `Cita cancelada. Se devolvieron ${formatoDinero(devuelto)} pagados en línea.` : "Cita cancelada." };
}

/** Cambia el día, la hora o la persona de una cita, revisando que el nuevo horario esté libre. */
export async function reprogramarCita(id: string, fecha: string, minuto: number, persona: string): Promise<Res> {
  const s = await requerirSesion("citas.modificar");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const b = s.barberia;
  const [c] = await db.select().from(schema.citas).where(and(eq(schema.citas.id, id), eq(schema.citas.barberiaId, b.id))).limit(1);
  if (!c || !["en_espera", "llego"].includes(c.estado)) return { error: "Esa cita ya no se puede cambiar." };
  if (!FECHA.test(fecha) || !Number.isInteger(minuto)) return { error: "Elige el día y la hora." };
  const equipo = await equipoAgenda(b.id);
  if (!equipo.some((e) => e.id === persona)) return { error: "Elige quién atiende." };
  const inicio = new Date(instante(fecha, minuto, b.zonaHoraria));
  const ok = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`citas:${b.id}`}))`);
    const libres = await disponibilidadDia(b, fecha, c.duracionMin, persona, tx, { ignorarCita: id, sinAnticipacion: true });
    if (!libres.some((x) => x.minuto === minuto)) return false;
    await tx.update(schema.citas).set({ inicio, fin: new Date(inicio.getTime() + c.duracionMin * 60000), barberoId: persona, indiferente: false, actualizadoEn: new Date() }).where(eq(schema.citas.id, id));
    await tx.update(schema.notificacionesCita).set({ estado: "omitida" }).where(and(eq(schema.notificacionesCita.citaId, id), eq(schema.notificacionesCita.estado, "pendiente"), eq(schema.notificacionesCita.tipo, "recordatorio")));
    const quien = equipo.find((e) => e.id === persona)!.nombre.split(" ")[0];
    const txt = textoCita(b, { inicio, folio: c.folio }, quien, c.servicios.map((x) => x.nombre).join(", "));
    await encolarAviso(tx, { barberiaId: b.id, citaId: id, tipo: "cita_modificada", para: "cliente", destino: c.clienteTelefono, mensaje: `Tu cita en ${b.nombre} cambió: ${txt}` });
    const antes = inicio.getTime() - Date.now() > 26 * 3600e3 ? 24 * 3600e3 : 2 * 3600e3;
    if (inicio.getTime() - antes > Date.now()) await encolarAviso(tx, { barberiaId: b.id, citaId: id, tipo: "recordatorio", para: "cliente", destino: c.clienteTelefono, mensaje: `Te recordamos tu cita en ${b.nombre}: ${txt}`, programadaPara: new Date(inicio.getTime() - antes) });
    await registrar(tx, { barberiaId: b.id, usuarioId: s.usuario.id, tipo: "venta", accion: `${s.usuario.nombre} cambió la cita ${c.folio} de ${c.clienteNombre}` });
    return true;
  });
  if (!ok) return { error: "Ese horario no está libre. Elige otro." };
  revalidatePath("/citas");
  return { mensaje: "Cita cambiada." };
}

// ---------- Horarios y disponibilidad ----------

function leerHorario(h: unknown): Horario | null {
  if (!h || typeof h !== "object") return null;
  const r: Horario = {};
  for (const [d, v] of Object.entries(h as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(d) || !Array.isArray(v) || v.length !== 2) continue;
    const [a, b] = v.map(String);
    if (!HORA.test(a) || !HORA.test(b) || aMin(a) >= aMin(b)) return null;
    r[d] = [a, b];
  }
  return r;
}

export async function guardarHorarioPersona(usuarioId: string, horario: Record<string, [string, string]> | null, atiende: boolean): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const h = horario === null ? null : leerHorario(horario);
  if (horario !== null && !h) return { error: "Revisa los horarios: la hora de entrada va antes que la de salida." };
  const r = await db.update(schema.usuarios).set({ horario: h, atiendeCitas: !!atiende }).where(and(eq(schema.usuarios.id, usuarioId), eq(schema.usuarios.barberiaId, s.barberia.id))).returning({ nombre: schema.usuarios.nombre });
  if (!r.length) return { error: "No se encontró a esa persona." };
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió el horario de ${r[0].nombre}` });
  revalidatePath("/citas");
  return { mensaje: "Horario guardado." };
}

/** Descanso rotativo: la semana de inicio la persona 1 descansa el día 1; cada semana se alterna. */
export async function guardarRotacion(d: { persona1: string; persona2: string; dia1: number; dia2: number; semanaInicio: string; activo: boolean }): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  if (!d.persona1 || !d.persona2 || d.persona1 === d.persona2) return { error: "Elige dos personas distintas." };
  if (![d.dia1, d.dia2].every((x) => Number.isInteger(x) && x >= 0 && x <= 6) || d.dia1 === d.dia2) return { error: "Elige dos días distintos." };
  if (!FECHA.test(d.semanaInicio)) return { error: "Elige la semana de inicio." };
  const equipo = await equipoAgenda(s.barberia.id);
  if (![d.persona1, d.persona2].every((p) => equipo.some((e) => e.id === p))) return { error: "Elige personas que atiendan citas." };
  // Una persona tiene un solo modo de descanso.
  const fijo = leerConfig(s.barberia.citasConfig).descansosFijos.find((f) => f.persona === d.persona1 || f.persona === d.persona2);
  if (fijo) return { error: `${equipo.find((e) => e.id === fijo.persona)?.nombre.split(" ")[0] ?? "Esa persona"} ya tiene descanso fijo. Quítaselo para incluirla en la rotación.` };
  const x = new Date(`${d.semanaInicio}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  const lunes = x.toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.delete(schema.rotacionesDescanso).where(eq(schema.rotacionesDescanso.barberiaId, s.barberia.id));
    await tx.insert(schema.rotacionesDescanso).values({ barberiaId: s.barberia.id, persona1: d.persona1, persona2: d.persona2, dia1: d.dia1, dia2: d.dia2, semanaInicio: lunes, activo: d.activo });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} configuró el descanso rotativo` });
  });
  revalidatePath("/citas");
  return { mensaje: "Descanso rotativo guardado." };
}

export async function quitarRotacion(): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  await db.delete(schema.rotacionesDescanso).where(eq(schema.rotacionesDescanso.barberiaId, s.barberia.id));
  revalidatePath("/citas");
  return { mensaje: "Se quitó el descanso rotativo." };
}

/** Descanso fijo por persona. Quien está en el descanso rotativo no puede tener también descanso fijo. */
export async function guardarDescansosFijos(lista: { persona: string; dias: number[] }[]): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const equipo = await equipoAgenda(s.barberia.id);
  const [rot] = await db.select({ p1: schema.rotacionesDescanso.persona1, p2: schema.rotacionesDescanso.persona2 }).from(schema.rotacionesDescanso).where(eq(schema.rotacionesDescanso.barberiaId, s.barberia.id)).limit(1);
  const limpia: { persona: string; dias: number[] }[] = [];
  for (const x of (Array.isArray(lista) ? lista : []).slice(0, 50)) {
    const e = equipo.find((p) => p.id === x?.persona);
    if (!e) return { error: "Elige personas que atiendan citas." };
    const dias = [...new Set((x.dias ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    if (!dias.length) return { error: `Elige al menos un día de descanso para ${e.nombre.split(" ")[0]}.` };
    if (dias.length > 5) return { error: "Deja al menos dos días de trabajo a la semana." };
    if (rot && (rot.p1 === e.id || rot.p2 === e.id)) return { error: `${e.nombre.split(" ")[0]} ya está en el descanso rotativo.` };
    if (limpia.some((y) => y.persona === e.id)) continue;
    limpia.push({ persona: e.id, dias });
  }
  const config = leerConfig({ ...leerConfig(s.barberia.citasConfig), descansosFijos: limpia });
  await db.update(schema.barberias).set({ citasConfig: config }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió los descansos fijos` });
  revalidatePath("/", "layout");
  return { mensaje: "Descanso fijo guardado." };
}

export async function bloquearHorario(d: { usuarioId: string | null; fecha: string; desde: string; hasta: string; motivo: string }): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  if (!FECHA.test(d.fecha) || !HORA.test(d.desde) || !(HORA.test(d.hasta) || d.hasta === "24:00") || aMin(d.desde) >= aMin(d.hasta)) return { error: "Revisa el día y las horas." };
  if (d.usuarioId) {
    const equipo = await equipoAgenda(s.barberia.id);
    if (!equipo.some((e) => e.id === d.usuarioId)) return { error: "Elige a quién se le bloquea." };
  }
  const z = s.barberia.zonaHoraria;
  await db.insert(schema.bloqueosAgenda).values({ barberiaId: s.barberia.id, usuarioId: d.usuarioId, inicio: new Date(instante(d.fecha, aMin(d.desde), z)), fin: new Date(instante(d.fecha, aMin(d.hasta), z)), motivo: String(d.motivo ?? "").slice(0, 120), creadoPor: s.usuario.id });
  revalidatePath("/citas");
  return { mensaje: "Horario bloqueado." };
}

export async function quitarBloqueo(id: string): Promise<Res> {
  const s = await requerirSesion("citas.horarios");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  await db.delete(schema.bloqueosAgenda).where(and(eq(schema.bloqueosAgenda.id, id), eq(schema.bloqueosAgenda.barberiaId, s.barberia.id)));
  revalidatePath("/citas");
  return { mensaje: "Bloqueo quitado." };
}

// ---------- Configuración (Configurar negocio, apartado Citas y agenda) ----------

export async function guardarConfigCitas(d: {
  usaCitas: boolean; enLinea: boolean; slug: string; horario: Record<string, [string, string]>; diasCerrados: string[];
  anticipacionMinHoras: string; anticipacionMaxDias: string; margenMin: string;
  elegirBarbero: boolean; cualquierBarbero: boolean; variosServicios: boolean;
  pagoModo: ModoPago; pagoValor: string; cancelarHorasAntes: string; politicaCancelacion: string; politicaReembolso: string;
}): Promise<Res> {
  const s = await requerirSesion("configuracion.citas");
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  const slug = String(d.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return { error: "La dirección lleva de 3 a 40 letras, números o guiones, sin espacios." };
  const [otro] = await db.select({ id: schema.barberias.id }).from(schema.barberias).where(and(eq(schema.barberias.slug, slug), sql`${schema.barberias.id} <> ${s.barberia.id}`)).limit(1);
  if (otro) return { error: "Esa dirección ya la usa otro negocio." };
  const horario = leerHorario(d.horario);
  if (!horario) return { error: "Revisa el horario del negocio: la apertura va antes que el cierre." };
  const cerrados = [...new Set((d.diasCerrados ?? []).filter((x) => FECHA.test(x)))].sort().slice(0, 60);
  const n = (t: string, min: number, max: number) => { const v = Number(String(t).trim()); return Number.isFinite(v) && v >= min && v <= max ? v : null; };
  const antMin = n(d.anticipacionMinHoras, 0, 168), antMax = n(d.anticipacionMaxDias, 1, 180), margen = n(d.margenMin, 0, 120), cancelar = n(d.cancelarHorasAntes, 0, 168);
  if (antMin === null || antMax === null || margen === null || cancelar === null) return { error: "Revisa las cantidades de anticipación, margen y cancelación." };
  let valor = 0;
  if (d.pagoModo === "anticipo_pct") { const v = n(d.pagoValor, 1, 100); if (v === null) return { error: "El porcentaje de anticipo va de 1 a 100." }; valor = Math.round(v * 100); }
  if (d.pagoModo === "anticipo_fijo") { const v = leerPesos(d.pagoValor); if (!v || v <= 0) return { error: "Escribe la cantidad del anticipo." }; valor = v; }
  const config = leerConfig({
    ...leerConfig(s.barberia.citasConfig), enLinea: !!d.enLinea,
    anticipacionMinMin: Math.round(antMin * 60), anticipacionMaxDias: antMax, margenMin: margen,
    elegirBarbero: !!d.elegirBarbero, cualquierBarbero: !!d.cualquierBarbero, variosServicios: !!d.variosServicios,
    pago: { modo: d.pagoModo, valor }, cancelarHorasAntes: cancelar,
    politicaCancelacion: String(d.politicaCancelacion ?? "").trim(), politicaReembolso: String(d.politicaReembolso ?? "").trim(),
  });
  if (!config.elegirBarbero && !config.cualquierBarbero) return { error: "Deja al menos una forma de elegir quién atiende." };
  await db.update(schema.barberias).set({ usaCitas: !!d.usaCitas, slug, horario, diasCerrados: cerrados, citasConfig: config }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} cambió la configuración de citas y reservaciones` });
  revalidatePath("/", "layout");
  return { mensaje: "Configuración guardada." };
}

/** Interruptores de Ajustes, Horarios. Apagar uno no borra lo configurado: solo deja de aplicarse en la agenda y en las reservaciones. */
export async function guardarInterruptorHorarios(clave: "usaHorarioPersona" | "usaRotacion" | "usaBloqueos" | "usaDescansoFijo", valor: boolean): Promise<Res> {
  const s = await requerirSesion();
  if (!s.puede("citas.horarios") && !s.puede("configuracion.citas")) return { error: "No tienes permiso para cambiar los horarios." };
  if (s.vista) return { error: "En la vista previa no se guardan cambios." };
  if (!["usaHorarioPersona", "usaRotacion", "usaBloqueos", "usaDescansoFijo"].includes(clave)) return { error: "Opción no válida." };
  const config = leerConfig({ ...leerConfig(s.barberia.citasConfig), [clave]: !!valor });
  await db.update(schema.barberias).set({ citasConfig: config }).where(eq(schema.barberias.id, s.barberia.id));
  const nombre = { usaHorarioPersona: "los horarios por persona", usaRotacion: "el descanso rotativo", usaBloqueos: "el bloqueo de horarios", usaDescansoFijo: "el descanso fijo por persona" }[clave];
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} ${valor ? "activó" : "desactivó"} ${nombre}` });
  revalidatePath("/", "layout");
  return { mensaje: valor ? "Activado." : "Desactivado. Lo configurado se conserva." };
}
