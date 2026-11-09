"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { MAX_ADJUNTO, TIPOS_ADJUNTO } from "@/lib/archivo";
import { db, schema as t } from "@/lib/db";
import { crearPrueba, datosDemostracion, eliminarPrueba, limpiarTemporales, negocioDePrueba, restablecerPrueba } from "@/lib/pruebas";
import { ESTADOS_SOLICITUD, type EstadoSolicitud, PRIORIDADES, type Prioridad } from "@/lib/soporte";
import { texto } from "@/lib/volver";

export type EstadoSoporte = { ok?: boolean; error?: string; mensaje?: string; cuentas?: { puesto: string; usuario: string; clave: string }[] };

async function soporte() {
  const s = await requerirSesion();
  if (!s.usuario.esSoporte) throw new Error("Solo para el soporte de la plataforma.");
  return s;
}

/** Respuesta de soporte dentro de la solicitud. La persona recibe una notificación. */
export async function responderComoSoporte(_: EstadoSoporte, form: FormData): Promise<EstadoSoporte> {
  const s = await soporte();
  const id = texto(form, "solicitudId", 40);
  const msg = texto(form, "texto", 4000);
  const despues = texto(form, "despues") as EstadoSolicitud;
  const adjunto = String(form.get("adjunto") ?? "");
  if (adjunto && (!TIPOS_ADJUNTO.test(adjunto) || adjunto.length > MAX_ADJUNTO)) return { error: "El archivo debe ser una foto o un PDF de máximo 1 MB." };
  if (!msg) return { error: "Escribe la respuesta." };
  const [x] = await db.select().from(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.id, id)).limit(1);
  if (!x) return { error: "No se encontró la solicitud." };
  const estado = despues in ESTADOS_SOLICITUD ? despues : "esperando";
  const yo = s.usuario.nombre.split(" ")[0];
  await db.transaction(async (tx) => {
    await tx.insert(t.mensajesSoporte).values({
      solicitudId: id, autorId: s.usuario.id, deSoporte: true, texto: msg,
      ...(adjunto ? { adjuntoNombre: texto(form, "adjuntoNombre", 120) || "archivo", adjuntoTipo: adjunto.slice(5, adjunto.indexOf(";")), adjuntoDatos: adjunto } : {}),
    });
    await tx.update(t.solicitudesSoporte).set({ estado, actualizadoEn: new Date(), ...(x.responsableId ? {} : { responsableId: s.usuario.id }) }).where(eq(t.solicitudesSoporte.id, id));
    await tx.insert(t.eventosSoporte).values({ solicitudId: id, autorId: s.usuario.id, accion: `${yo} respondió` });
    if (!x.responsableId) await tx.insert(t.eventosSoporte).values({ solicitudId: id, autorId: s.usuario.id, accion: `${yo} quedó como responsable` });
    if (estado !== x.estado) await tx.insert(t.eventosSoporte).values({ solicitudId: id, autorId: s.usuario.id, accion: estado === "resuelto" ? "Marcó la solicitud como resuelta" : `Cambió el estado a ${ESTADOS_SOLICITUD[estado]}` });
  });
  revalidatePath(`/soporte/solicitudes/${id}`);
  return { ok: true };
}

/** Cambia estado, prioridad o responsable. Cada cambio queda en el historial de la solicitud. */
export async function actualizarSolicitud(form: FormData) {
  const s = await soporte();
  const id = texto(form, "solicitudId", 40);
  const campo = texto(form, "campo");
  const valor = texto(form, "valor", 40);
  const [x] = await db.select().from(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.id, id)).limit(1);
  if (!x) return;
  let accion = "";
  if (campo === "estado" && valor in ESTADOS_SOLICITUD && valor !== x.estado) {
    await db.update(t.solicitudesSoporte).set({ estado: valor, actualizadoEn: new Date() }).where(eq(t.solicitudesSoporte.id, id));
    accion = valor === "resuelto" ? "Marcó la solicitud como resuelta" : `Cambió el estado a ${ESTADOS_SOLICITUD[valor as EstadoSolicitud]}`;
  } else if (campo === "prioridad" && valor in PRIORIDADES && valor !== x.prioridad) {
    await db.update(t.solicitudesSoporte).set({ prioridad: valor }).where(eq(t.solicitudesSoporte.id, id));
    accion = `Cambió la prioridad a ${PRIORIDADES[valor as Prioridad]}`;
  } else if (campo === "responsable") {
    const [r] = valor ? await db.select().from(t.usuarios).where(and(eq(t.usuarios.id, valor), eq(t.usuarios.esSoporte, true))).limit(1) : [null];
    if (valor && !r) return;
    await db.update(t.solicitudesSoporte).set({ responsableId: r?.id ?? null }).where(eq(t.solicitudesSoporte.id, id));
    accion = r ? `Asignó a ${r.nombre.split(" ")[0]} como responsable` : "Quitó al responsable";
  }
  if (accion) await db.insert(t.eventosSoporte).values({ solicitudId: id, autorId: s.usuario.id, accion: `${accion}` });
  revalidatePath(`/soporte/solicitudes/${id}`);
}

export async function crearNegocioPrueba(_: EstadoSoporte, form: FormData): Promise<EstadoSoporte> {
  await soporte();
  const nombre = texto(form, "nombre", 60);
  if (nombre.length < 3) return { error: "Escribe el nombre del negocio de prueba." };
  const r = await crearPrueba(nombre);
  revalidatePath("/soporte/pruebas");
  return { ok: true, mensaje: `Se creó ${nombre}. Guarda estas contraseñas: no se vuelven a mostrar.`, cuentas: r.cuentas };
}

/** Restablecer, eliminar o cargar datos. Para borrar hay que escribir el nombre exacto del negocio. */
export async function mantenimientoPrueba(_: EstadoSoporte, form: FormData): Promise<EstadoSoporte> {
  await soporte();
  const id = texto(form, "negocioId", 40);
  const accion = texto(form, "accion");
  const b = await negocioDePrueba(id);
  if (!b) return { error: "Esta operación solo es para negocios de prueba. Los negocios reales están excluidos." };
  try {
    if (accion === "demo") {
      const r = await datosDemostracion(id);
      revalidatePath("/soporte/pruebas");
      return { ok: true, mensaje: `Se agregaron ${r.ventas} ventas de demostración a ${r.nombre}.` };
    }
    if (texto(form, "confirmar", 80) !== b.nombre) return { error: `Escribe ${b.nombre} para confirmar.` };
    if (accion === "restablecer") {
      const r = await restablecerPrueba(id);
      revalidatePath("/soporte/pruebas");
      return { ok: true, mensaje: `${r.nombre} quedó sin movimientos: se borraron ${r.ventas} ventas, ${r.egresos} egresos y ${r.cortes} cortes.` };
    }
    if (accion === "eliminar") {
      const r = await eliminarPrueba(id);
      revalidatePath("/soporte/pruebas");
      return { ok: true, mensaje: `Se eliminó ${r.nombre} con sus ${r.usuarios} cuentas.` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo completar." };
  }
  return { error: "Operación no válida." };
}

export async function limpiarRegistros(_: EstadoSoporte): Promise<EstadoSoporte> {
  await soporte();
  const r = await limpiarTemporales();
  return { ok: true, mensaje: `Se borraron ${r.sesiones} sesiones vencidas y ${r.errores} errores de hace más de 90 días.` };
}
