"use server";

import { randomUUID } from "node:crypto";
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
import { expandirPermisos, NOMBRE_ROL, PERMISOS, PERMISOS_POR_ROL, type Permiso, permisosDe, rolesAsignables, type Rol } from "@/lib/permisos";
import { esTotal, puedeEditarA, puedeManejar } from "@/lib/puestos";
import type { Sesion } from "@/lib/auth";
import { texto } from "@/lib/volver";

export type ClaveVisible = { nombre: string; usuario: string; clave: string; expira: number };
export type EstadoPersona = { ok?: boolean; error?: string; mensaje?: string; clave?: ClaveVisible; n?: number; conMovimientos?: boolean };

async function personaDeMiBarberia(barberiaId: string, id: string) {
  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.barberiaId, barberiaId))).limit(1);
  return u ?? null;
}

/** La persona y si quien edita puede tocarla. */
async function objetivo(s: Sesion, id: string) {
  const u = await personaDeMiBarberia(s.barberia.id, id);
  if (!u) return { u: null, puede: false };
  const [p] = u.puestoId ? await db.select().from(schema.puestos).where(eq(schema.puestos.id, u.puestoId)).limit(1) : [];
  return { u, puede: puedeEditarA(s, u, permisosDe(u.rol, u.permisosExtra, u.permisosQuitados, p?.permisos ?? null)) };
}

type ReglaNueva = { tipo: "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto"; porcentaje: number; montoFijo: number; montoSemanal: number; periodo: string };

/** Lee la forma de pago del formulario. null si no aplica; texto si hay un error. */

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

/** Lee el puesto elegido: una plantilla ("rol:barbera") o un puesto del negocio ("puesto:id"). */
async function leerPuesto(s: Sesion, form: FormData): Promise<{ rol: Rol; puestoId: string | null; nombre: string; base: Set<string> } | string> {
  const v = texto(form, "puesto", 60);
  if (v.startsWith("rol:")) {
    const rol = v.slice(4) as Rol;
    if (!rolesAsignables(s.usuario.rol, !!s.usuario.puestoId).includes(rol)) return "Elige un puesto.";
    return { rol, puestoId: null, nombre: NOMBRE_ROL[rol], base: new Set(PERMISOS_POR_ROL[rol]) };
  }
  if (v.startsWith("puesto:")) {
    const [p] = await db.select().from(schema.puestos).where(and(eq(schema.puestos.id, v.slice(7)), eq(schema.puestos.barberiaId, s.barberia.id))).limit(1);
    if (!p || !p.activo) return "Ese puesto ya no está disponible.";
    if (!puedeManejar(s, p.permisos)) return "No puedes asignar ese puesto.";
    return { rol: p.plantilla, puestoId: p.id, nombre: p.nombre, base: new Set(expandirPermisos(p.permisos)) };
  }
  return "Elige un puesto.";
}

/** Lo marcado en los interruptores, comparado con lo que trae el puesto: lo que se agrega y lo que se quita. */
function ajustesDePermisos(s: Sesion, form: FormData, base: Set<string>) {
  if (!form.has("conPermisos")) return { extra: [] as string[], quitados: [] as string[] };
  const marcados = new Set(form.getAll("permisos").map(String).filter((p) => p in PERMISOS));
  // Solo se puede dar un permiso que quien edita también tiene.
  const extra = [...marcados].filter((p) => !base.has(p) && (esTotal(s) || s.puede(p as Permiso)));
  const quitados = [...base].filter((p) => !marcados.has(p));
  return { extra, quitados };
}

async function atenderSolicitudes(usuarioId: string) {
  await db.update(schema.solicitudesClave).set({ atendida: true }).where(and(eq(schema.solicitudesClave.usuarioId, usuarioId), eq(schema.solicitudesClave.atendida, false)));
}

/** Da de alta a una persona. La contraseña temporal se puede volver a ver durante 30 minutos. */
export async function darDeAlta(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("usuarios.editar");
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ");
  if (nombre.split(" ").length < 2) return { error: "Escribe nombre y apellido." };
  const puesto = await leerPuesto(s, form);
  if (typeof puesto === "string") return { error: puesto };
  const { rol, puestoId } = puesto;
  const { extra, quitados } = ajustesDePermisos(s, form, puesto.base);
  const forma = leerForma(form, rol);
  if (typeof forma === "string") return { error: forma };
  if (forma?.tipo === "renta") return { error: "Elige otra forma de pago." };
  const existentes = (await db.select({ u: schema.usuarios.usuario }).from(schema.usuarios)).map((x) => x.u);
  const usuario = sugerirUsuario(nombre, existentes);
  const clave = contrasenaTemporal(nombre);
  const expira = expiraClave();
  await db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(schema.usuarios).values({ barberiaId: s.barberia.id, nombre, usuario, rol, puestoId, permisosExtra: extra, permisosQuitados: quitados, hash: await hashContrasena(clave), debeCambiar: true, claveTemporal: cifrar(clave), claveTemporalExpira: expira }).returning({ id: schema.usuarios.id });
    if (forma) await guardarForma(tx, s.barberia.id, nuevo.id, forma);
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} dio de alta a ${nombre} como ${puesto.nombre}`, detalle: { usuario, formaDePago: forma ? describirRegla(forma, formatoDinero) : undefined } });
  });
  revalidatePath("/ajustes");
  return { ok: true, clave: { nombre, usuario, clave, expira: expira.getTime() }, n: Date.now() };
}

export async function restablecer(id: string): Promise<EstadoPersona> {
  const s = await requerirSesion("usuarios.editar");
  const { u, puede } = await objetivo(s, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "Tu propia contraseña se cambia desde tu menú." };
  if (!puede) return { error: "No puedes restablecer la contraseña de esa persona." };
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
  const s = await requerirSesion("usuarios.editar");
  const { u, puede } = await objetivo(s, String(id));
  if (!u || !puede) return { error: "No se encontró a esa persona." };
  if (!u.claveTemporal || !u.claveTemporalExpira || u.claveTemporalExpira < new Date() || !u.debeCambiar) return { error: "Ya pasaron los 30 minutos. Restablécela otra vez para ver una nueva." };
  const clave = descifrar(u.claveTemporal);
  if (!clave) return { error: "No se pudo leer la contraseña. Restablécela otra vez." };
  return { ok: true, clave: { nombre: u.nombre, usuario: u.usuario, clave, expira: u.claveTemporalExpira.getTime() } };
}

export async function actualizarPersona(_: EstadoPersona, form: FormData): Promise<EstadoPersona> {
  const s = await requerirSesion("usuarios.editar");
  const { u, puede } = await objetivo(s, texto(form, "id", 40));
  if (!u) return { error: "No se encontró a esa persona." };
  if (!puede) return { error: "No puedes cambiar a esa persona." };
  const yo = u.id === s.usuario.id;
  // A uno mismo solo se le cambian los permisos: el puesto lo cambia otra persona.
  const [pActual] = u.puestoId ? await db.select().from(schema.puestos).where(eq(schema.puestos.id, u.puestoId)).limit(1) : [];
  const puesto = yo
    ? { rol: u.rol, puestoId: u.puestoId, nombre: pActual?.nombre ?? NOMBRE_ROL[u.rol], base: new Set<string>(pActual ? expandirPermisos(pActual.permisos) : PERMISOS_POR_ROL[u.rol]) }
    : await leerPuesto(s, form);
  if (typeof puesto === "string") return { error: puesto };
  const { rol, puestoId } = puesto;
  const nombre = texto(form, "nombre", 80).replace(/\s+/g, " ") || u.nombre;
  const forma = leerForma(form, rol);
  if (typeof forma === "string") return { error: forma };
  if (forma?.tipo === "renta") return { error: "Elige otra forma de pago." };
  const { extra, quitados } = ajustesDePermisos(s, form, puesto.base);
  const meta = leerPesos(texto(form, "meta")) ?? 0;
  const antes = permisosDe(u.rol, u.permisosExtra, u.permisosQuitados, pActual?.permisos ?? null);
  const ahora = permisosDe(rol, extra, quitados, puestoId ? [...puesto.base] : null);
  const lista = (x: Set<string>) => [...x].map((k) => PERMISOS[k as Permiso]).join(", ").toLowerCase();
  await db.transaction(async (tx) => {
    await tx.update(schema.usuarios).set({ nombre, rol, puestoId, permisosExtra: extra, permisosQuitados: quitados, metaSemanal: meta }).where(eq(schema.usuarios.id, u.id));
    const cambios: string[] = [];
    if (nombre !== u.nombre) cambios.push(`nombre a ${nombre}`);
    if (rol !== u.rol || puestoId !== u.puestoId) cambios.push(`puesto a ${puesto.nombre}`);
    if (forma && (await guardarForma(tx, s.barberia.id, u.id, forma))) cambios.push(`forma de pago a ${describirRegla(forma, formatoDinero)}`);
    if ([...antes].sort().join() !== [...ahora].sort().join()) cambios.push("permisos");
    if (meta !== u.metaSemanal) cambios.push("meta semanal");
    if (cambios.length) await registrar(tx, {
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} cambió a ${yo ? "sus propios permisos" : u.nombre}: ${cambios.join(", ")}`,
      detalle: {
        usuario: u.usuario,
        antes: [u.nombre, pActual?.nombre ?? NOMBRE_ROL[u.rol], u.metaSemanal ? `meta ${formatoDinero(u.metaSemanal)}` : "", `puede: ${lista(antes)}`].filter(Boolean).join(", "),
        ahora: [nombre, puesto.nombre, meta ? `meta ${formatoDinero(meta)}` : "", `puede: ${lista(ahora)}`].filter(Boolean).join(", "),
      },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Cambios guardados.", n: Date.now() };
}

/** Elimina al usuario de la lista. Si nunca registró nada, se borra; si tiene movimientos, se desactiva y su historial se conserva. */
/**
 * Eliminar definitivamente. Sin ventas ni movimientos, se borra por completo.
 * Con movimientos, primero se pide confirmar; al confirmar se borran sus datos personales (nombre, usuario,
 * contraseña, avatar, permisos) y sus ventas quedan a nombre de "Usuario eliminado" para que las cuentas sigan cuadrando.
 */
export async function darDeBaja(id: string, borrarDatos = false): Promise<EstadoPersona> {
  const s = await requerirSesion("usuarios.editar");
  const { u, puede } = await objetivo(s, String(id));
  if (!u) return { error: "No se encontró a esa persona." };
  if (u.id === s.usuario.id) return { error: "No puedes darte de baja a ti mismo." };
  if (!puede) return { error: "No puedes eliminar a esa persona." };
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.solicitudesClave).where(eq(schema.solicitudesClave.usuarioId, u.id));
      await tx.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, u.id));
      await tx.delete(schema.reglasComision).where(eq(schema.reglasComision.barberoId, u.id));
      await tx.delete(schema.usuarios).where(eq(schema.usuarios.id, u.id));
    });
  } catch {
    if (!borrarDatos) return { conMovimientos: true, n: Date.now() };
    const ahora = new Date();
    await db.transaction(async (tx) => {
      await tx.update(schema.usuarios).set({
        nombre: "Usuario eliminado", usuario: `BORRADO-${u.id.slice(0, 8).toUpperCase()}`, hash: await hashContrasena(randomUUID()),
        activo: false, avatar: "iniciales", permisosExtra: [], permisosQuitados: [], puestoId: null, metaSemanal: 0, claveTemporal: null, claveTemporalExpira: null, debeCambiar: false,
      }).where(and(eq(schema.usuarios.id, u.id), eq(schema.usuarios.barberiaId, s.barberia.id)));
      await tx.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, u.id));
      await tx.delete(schema.solicitudesClave).where(eq(schema.solicitudesClave.usuarioId, u.id));
      await tx.update(schema.reglasComision).set({ vigenteHasta: ahora }).where(and(eq(schema.reglasComision.barberoId, u.id), isNull(schema.reglasComision.vigenteHasta)));
      await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} eliminó a ${u.nombre}`, detalle: { usuario: u.usuario, datosBorrados: true } });
    });
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Se borraron los datos de ${u.nombre}. Sus ventas quedan como "Usuario eliminado".`, n: Date.now() };
  }
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} eliminó a ${u.nombre}` });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${u.nombre} se eliminó.`, n: Date.now() };
}

async function personaEditable(id: string) {
  const s = await requerirSesion("usuarios.editar");
  const { u, puede } = await objetivo(s, String(id));
  if (!u || u.id === s.usuario.id || !puede) return { s, u: null };
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
