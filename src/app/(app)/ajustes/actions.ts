"use server";

import { and, eq, isNull } from "drizzle-orm";
import { describirRegla } from "@/lib/comisiones";
import type { Tx } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { cerrarSesionesDe, hashContrasena, requerirSesion } from "@/lib/auth";
import { cifrar, descifrar, expiraClave } from "@/lib/claves";
import { contrasenaTemporal, sugerirUsuario } from "@/lib/cuentas";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero, leerPesos } from "@/lib/money";
import { NOMBRE_ROL, PERMISOS, PERMISOS_POR_ROL, rolesAsignables, type Rol } from "@/lib/permisos";
import { texto } from "@/lib/volver";

export type ClaveVisible = { nombre: string; usuario: string; clave: string; expira: number };
export type EstadoPersona = { ok?: boolean; error?: string; mensaje?: string; clave?: ClaveVisible; n?: number };

async function personaDeMiBarberia(barberiaId: string, id: string) {
  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.barberiaId, barberiaId))).limit(1);
  return u ?? null;
}

type ReglaNueva = { tipo: "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto"; porcentaje: number; montoFijo: number; montoSemanal: number; periodo: string };

/** Lee la forma de pago del formulario. null si no aplica; texto si hay un error. */
/** Permisos extra en palabras, para el antes y después del historial. */
const permisosTexto = (xs: string[]) => (xs.length ? `además puede: ${xs.map((x) => PERMISOS[x as keyof typeof PERMISOS] ?? x).join(", ").toLowerCase()}` : "solo los permisos de su rol");

function leerForma(form: FormData, rol: Rol): ReglaNueva | null | string {
  if (rol !== "barbera" && rol !== "encargada") return null;
  const tipo = texto(form, "pagoTipo") as ReglaNueva["tipo"];
  if (!["porcentaje", "fijo", "renta", "sueldo", "mixto"].includes(tipo)) return null;
  const pct = Number(texto(form, "pagoPorcentaje", 6) || "0");
  const fijo = leerPesos(texto(form, "pagoFijo")) ?? 0;
  const semanal = leerPesos(texto(form, "pagoSemanal")) ?? 0;
  if ((tipo === "porcentaje" || tipo === "mixto") && (!(pct > 0) || pct >= 100)) return "Escribe el porcentaje, de 1 a 99.";
  if (tipo === "fijo" && fijo <= 0) return "Escribe cuánto gana por servicio.";
  if ((tipo === "renta" || tipo === "sueldo" || tipo === "mixto") && semanal <= 0) return tipo === "renta" ? "Escribe el monto de la renta." : "Escribe el sueldo base.";
  const periodo = ["semana", "quincena", "mes"].includes(texto(form, "pagoPeriodo")) ? texto(form, "pagoPeriodo") : "semana";
  return {
    tipo, porcentaje: tipo === "porcentaje" || tipo === "mixto" ? Math.round(pct * 100) : 0,
    montoFijo: tipo === "fijo" ? fijo : 0, montoSemanal: ["renta", "sueldo", "mixto"].includes(tipo) ? semanal : 0,
    periodo: ["renta", "sueldo", "mixto"].includes(tipo) ? periodo : "semana",
  };
}

/** Guarda la forma de pago general. La anterior deja de aplicar desde ahora; lo ya cobrado conserva la suya. */
async function guardarForma(tx: Tx, barberiaId: string, usuarioId: string, r: ReglaNueva) {
  const [actual] = await tx.select().from(schema.reglasComision).where(and(eq(schema.reglasComision.barberiaId, barberiaId), eq(schema.reglasComision.barberoId, usuarioId), isNull(schema.reglasComision.vigenteHasta), isNull(schema.reglasComision.servicioId))).limit(1);
  if (actual && actual.tipo === r.tipo && actual.porcentaje === r.porcentaje && actual.montoFijo === r.montoFijo && actual.montoSemanal === r.montoSemanal && actual.periodo === r.periodo) return false;
  const ahora = new Date();
  if (actual) await tx.update(schema.reglasComision).set({ vigenteHasta: ahora }).where(eq(schema.reglasComision.id, actual.id));
  await tx.insert(schema.reglasComision).values({ barberiaId, barberoId: usuarioId, servicioId: null, ...r, vigenteDesde: ahora });
  return true;
}

async function atenderSolicitudes(usuarioId: string) {
  await db.update(schema.solicitudesClave).set({ atendida: true }).where(and(eq(schema.solicitudesClave.usuarioId, usuarioId), eq(schema.solicitudesClave.atendida, false)));
}

/** Da de alta a una persona. La contraseña temporal se puede volver a ver durante 30 minutos. */
export async function darDeAlta(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ");
  const rol = texto(form, "rol") as Rol;
  if (nombre.split(" ").length < 2) return { error: "Escribe nombre y apellido." };
  if (!rolesAsignables(s.usuario.rol).includes(rol)) return { error: "Elige un rol." };
  const forma = leerForma(form, rol);
  if (typeof forma === "string") return { error: forma };
  if (forma?.tipo === "renta" && !s.barberia.usaRentaSilla) return { error: "La renta de silla está apagada en Ajustes." };
  const existentes = (await db.select({ u: schema.usuarios.usuario }).from(schema.usuarios)).map((x) => x.u);
  const usuario = sugerirUsuario(nombre, existentes);
  const clave = contrasenaTemporal(nombre);
  const expira = expiraClave();
  await db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(schema.usuarios).values({ barberiaId: s.barberia.id, nombre, usuario, rol, hash: await hashContrasena(clave), debeCambiar: true, claveTemporal: cifrar(clave), claveTemporalExpira: expira }).returning({ id: schema.usuarios.id });
    if (forma) await guardarForma(tx, s.barberia.id, nuevo.id, forma);
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} dio de alta a ${nombre} como ${NOMBRE_ROL[rol]}`, detalle: { usuario, formaDePago: forma ? describirRegla(forma, formatoDinero) : undefined } });
  });
  revalidatePath("/ajustes");
  return { ok: true, clave: { nombre, usuario, clave, expira: expira.getTime() }, n: Date.now() };
}

export async function restablecer(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "Tu propia contraseña se cambia desde tu menú." };
  if (!rolesAsignables(s.usuario.rol).includes(u.rol === "encargada" ? "barbera" : u.rol)) return { error: "No puedes restablecer la contraseña de esa persona." };
  const clave = contrasenaTemporal(u.nombre);
  const expira = expiraClave();
  await db.update(schema.usuarios).set({ hash: await hashContrasena(clave), debeCambiar: true, intentosFallidos: 0, bloqueadoHasta: null, claveTemporal: cifrar(clave), claveTemporalExpira: expira }).where(eq(schema.usuarios.id, u.id));
  await cerrarSesionesDe(u.id);
  await atenderSolicitudes(u.id);
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} restableció la contraseña de ${u.nombre}` });
  revalidatePath("/ajustes");
  return { ok: true, clave: { nombre: u.nombre, usuario: u.usuario, clave, expira: expira.getTime() }, n: Date.now() };
}

/** Vuelve a mostrar la contraseña temporal mientras no pasen los 30 minutos. */
export async function verClave(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u || !rolesAsignables(s.usuario.rol).includes(u.rol === "encargada" ? "barbera" : u.rol)) return { error: "No se encontró a esa persona." };
  if (!u.claveTemporal || !u.claveTemporalExpira || u.claveTemporalExpira < new Date() || !u.debeCambiar) return { error: "Ya pasaron los 30 minutos. Restablécela otra vez para ver una nueva." };
  const clave = descifrar(u.claveTemporal);
  if (!clave) return { error: "No se pudo leer la contraseña. Restablécela otra vez." };
  return { ok: true, clave: { nombre: u.nombre, usuario: u.usuario, clave, expira: u.claveTemporalExpira.getTime() } };
}

export async function actualizarPersona(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, texto(form, "id", 40));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "No puedes cambiar tu propio rol." };
  const asignables = rolesAsignables(s.usuario.rol);
  if (!asignables.includes(u.rol === "encargada" ? "barbera" : u.rol)) return { error: "No puedes cambiar a esa persona." };
  const rol = texto(form, "rol") as Rol;
  if (!asignables.includes(rol)) return { error: "Elige un rol." };
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ") || u.nombre;
  const forma = leerForma(form, rol);
  if (typeof forma === "string") return { error: forma };
  const base = new Set<string>(PERMISOS_POR_ROL[rol]);
  const extra = form.getAll("permisos").map(String).filter((p) => p in PERMISOS && !base.has(p) && !p.startsWith("ajustes."));
  const meta = leerPesos(texto(form, "meta")) ?? 0;
  await db.transaction(async (tx) => {
    await tx.update(schema.usuarios).set({ nombre, rol, permisosExtra: extra, metaSemanal: meta }).where(eq(schema.usuarios.id, u.id));
    const cambios: string[] = [];
    if (nombre !== u.nombre) cambios.push(`nombre a ${nombre}`);
    if (rol !== u.rol) cambios.push(`rol a ${NOMBRE_ROL[rol]}`);
    if (forma && (await guardarForma(tx, s.barberia.id, u.id, forma))) cambios.push(`forma de pago a ${describirRegla(forma, formatoDinero)}`);
    if ([...extra].sort().join() !== [...u.permisosExtra].sort().join()) cambios.push("permisos");
    if (meta !== u.metaSemanal) cambios.push("meta semanal");
    if (cambios.length) await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} cambió a ${u.nombre}: ${cambios.join(", ")}`,
      detalle: {
        usuario: u.usuario,
        antes: [u.nombre, NOMBRE_ROL[u.rol], u.metaSemanal ? `meta ${formatoDinero(u.metaSemanal)}` : "", permisosTexto(u.permisosExtra)].filter(Boolean).join(", "),
        ahora: [nombre, NOMBRE_ROL[rol], meta ? `meta ${formatoDinero(meta)}` : "", permisosTexto(extra)].filter(Boolean).join(", "),
        permisosExtra: extra,
      },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Cambios guardados.", n: Date.now() };
}

/** Elimina al usuario de la lista. Si nunca registró nada, se borra; si tiene movimientos, se desactiva y su historial se conserva. */
export async function darDeBaja(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "No puedes darte de baja a ti mismo." };
  if (!rolesAsignables(s.usuario.rol).includes(u.rol === "encargada" ? "barbera" : u.rol)) return { error: "No puedes eliminar a esa persona." };
  let borrada = false;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.solicitudesClave).where(eq(schema.solicitudesClave.usuarioId, u.id));
      await tx.delete(schema.reglasComision).where(eq(schema.reglasComision.barberoId, u.id));
      await tx.delete(schema.usuarios).where(eq(schema.usuarios.id, u.id));
    });
    borrada = true;
  } catch {
    return { error: `${u.nombre} ya tiene ventas o movimientos, así que no se puede eliminar. Queda desactivado.` };
  }
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} eliminó a ${u.nombre}` });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${u.nombre} se eliminó.`, n: Date.now() };
}

async function personaEditable(id: string) {
  const s = await requerirSesion("ajustes.usuarios");
  const u = await personaDeMiBarberia(s.barberia.id, String(id));
  if (!u || u.id === s.usuario.id || !rolesAsignables(s.usuario.rol).includes(u.rol === "encargada" ? "barbera" : u.rol)) return { s, u: null };
  return { s, u };
}

/** Desactivar impide entrar, pero conserva sus ventas y todo lo que hizo. */
export async function desactivar(id: string): Promise<EstadoPersona> {
  const { s, u } = await personaEditable(id);
  if (!u) return { error: "No puedes desactivar a esa persona." };
  await db.update(schema.usuarios).set({ activo: false, claveTemporal: null, claveTemporalExpira: null }).where(eq(schema.usuarios.id, u.id));
  await cerrarSesionesDe(u.id);
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} desactivó a ${u.nombre}`, detalle: { usuario: u.usuario, antes: "Activo", ahora: "Desactivado" } });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${u.nombre} ya no puede entrar. Su historial se conserva.`, n: Date.now() };
}

export async function reactivar(id: string): Promise<EstadoPersona> {
  const { s, u } = await personaEditable(id);
  if (!u) return { error: "No puedes reactivar a esa persona." };
  await db.update(schema.usuarios).set({ activo: true }).where(eq(schema.usuarios.id, u.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} reactivó a ${u.nombre}`, detalle: { usuario: u.usuario, antes: "Desactivado", ahora: "Activo" } });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${u.nombre} puede volver a entrar.`, n: Date.now() };
}
