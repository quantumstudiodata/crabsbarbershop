"use server";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { requerirSesion } from "@/lib/auth";
import { MAX_ADJUNTO, TIPOS_ADJUNTO } from "@/lib/archivo";
import { db, schema as t } from "@/lib/db";
import { asuntoDe, CATEGORIAS_PROBLEMA, type EstadoSolicitud, TIPOS_SOLICITUD, type TipoSolicitud } from "@/lib/soporte";
import { texto } from "@/lib/volver";

export type ResumenSolicitud = { id: string; folio: number; asunto: string; tipo: TipoSolicitud; estado: EstadoSolicitud; t: string; nuevo: boolean };
export type MensajeVista = { id: string; texto: string; deSoporte: boolean; mio: boolean; autor: string; t: string; adjunto?: { nombre: string; tipo: string } };
export type DetalleSolicitud = ResumenSolicitud & { categoria: string | null; mensajes: MensajeVista[] };
export type EstadoEnvio = { ok?: boolean; error?: string; id?: string; folio?: number };

/** Solicitudes que envió quien tiene la sesión, la más reciente primero. */
export async function misSolicitudes(): Promise<ResumenSolicitud[]> {
  const s = await requerirSesion();
  const filas = await db.select({
    id: t.solicitudesSoporte.id, folio: t.solicitudesSoporte.folio, asunto: t.solicitudesSoporte.asunto, tipo: t.solicitudesSoporte.tipo,
    estado: t.solicitudesSoporte.estado, act: t.solicitudesSoporte.actualizadoEn, visto: t.solicitudesSoporte.vistoUsuarioEn,
    ultimaSoporte: sql<Date | null>`(select max(m.creado_en) from mensajes_soporte m where m.solicitud_id = ${t.solicitudesSoporte.id} and m.de_soporte)`,
  }).from(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.usuarioId, s.usuario.id)).orderBy(desc(t.solicitudesSoporte.actualizadoEn)).limit(50);
  return filas.map((f) => ({
    id: f.id, folio: f.folio, asunto: f.asunto, tipo: f.tipo as TipoSolicitud, estado: f.estado as EstadoSolicitud, t: f.act.toISOString(),
    nuevo: !!f.ultimaSoporte && new Date(f.ultimaSoporte) > f.visto,
  }));
}

/** Una solicitud con su conversación. Al abrirla, sus respuestas quedan como leídas. */
export async function verSolicitud(id: string): Promise<DetalleSolicitud | null> {
  const s = await requerirSesion();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [x] = await db.select().from(t.solicitudesSoporte).where(and(eq(t.solicitudesSoporte.id, id), eq(t.solicitudesSoporte.usuarioId, s.usuario.id))).limit(1);
  if (!x) return null;
  const msgs = await db.select({ m: t.mensajesSoporte, autor: t.usuarios.nombre }).from(t.mensajesSoporte).innerJoin(t.usuarios, eq(t.usuarios.id, t.mensajesSoporte.autorId))
    .where(eq(t.mensajesSoporte.solicitudId, id)).orderBy(asc(t.mensajesSoporte.creadoEn));
  if (!s.vista) await db.update(t.solicitudesSoporte).set({ vistoUsuarioEn: new Date() }).where(eq(t.solicitudesSoporte.id, id));
  return {
    id: x.id, folio: x.folio, asunto: x.asunto, tipo: x.tipo as TipoSolicitud, estado: x.estado as EstadoSolicitud, t: x.actualizadoEn.toISOString(), nuevo: false, categoria: x.categoria,
    mensajes: msgs.map(({ m, autor }) => ({
      id: m.id, texto: m.texto, deSoporte: m.deSoporte, mio: m.autorId === s.usuario.id, autor: m.deSoporte ? "Soporte" : autor.split(" ")[0], t: m.creadoEn.toISOString(),
      adjunto: m.adjuntoNombre ? { nombre: m.adjuntoNombre, tipo: m.adjuntoTipo ?? "" } : undefined,
    })),
  };
}

function leerAdjunto(form: FormData): { datos: string; nombre: string; tipo: string } | { error: string } | null {
  const datos = String(form.get("adjunto") ?? "");
  if (!datos) return null;
  if (!TIPOS_ADJUNTO.test(datos) || datos.length > MAX_ADJUNTO) return { error: "La evidencia debe ser una foto o un PDF de máximo 1 MB." };
  return { datos, nombre: texto(form, "adjuntoNombre", 120) || "evidencia", tipo: datos.slice(5, datos.indexOf(";")) };
}

/** Envía una solicitud nueva. Guarda dónde estaba la persona y los errores recientes para diagnosticar sin preguntar. */
export async function enviarSolicitud(_: EstadoEnvio, form: FormData): Promise<EstadoEnvio> {
  const s = await requerirSesion();
  if (s.usuario.esSoporte) return { error: "Soporte atiende sus solicitudes desde el Centro de soporte." };
  const tipo = texto(form, "tipo") as TipoSolicitud;
  if (!(tipo in TIPOS_SOLICITUD)) return { error: "Elige el motivo de tu solicitud." };
  const categoria = tipo === "problema" ? texto(form, "categoria", 80) : "";
  if (tipo === "problema" && !CATEGORIAS_PROBLEMA.includes(categoria as (typeof CATEGORIAS_PROBLEMA)[number])) return { error: "Selecciona qué ocurrió." };
  const descripcion = texto(form, "descripcion", 4000);
  if (descripcion.length < 5) return { error: tipo === "problema" ? "Describe el problema." : tipo === "duda" ? "Escribe tu duda." : "Escribe tu idea." };
  const adj = leerAdjunto(form);
  if (adj && "error" in adj) return { error: adj.error };
  const h = await headers();
  const errores = await db.select({ ruta: t.erroresSistema.ruta, mensaje: t.erroresSistema.mensaje, t: t.erroresSistema.creadoEn }).from(t.erroresSistema)
    .where(and(eq(t.erroresSistema.usuarioId, s.usuario.id), gte(t.erroresSistema.creadoEn, new Date(Date.now() - 3600_000)))).orderBy(desc(t.erroresSistema.creadoEn)).limit(5);
  const contexto = {
    ruta: texto(form, "ruta", 300), puesto: s.usuario.puesto, pantalla: texto(form, "pantalla", 20), navegador: (h.get("user-agent") ?? "").slice(0, 300),
    errores: errores.map((e) => ({ ruta: e.ruta, mensaje: e.mensaje.slice(0, 300), t: e.t.toISOString() })),
  };
  const r = await db.transaction(async (tx) => {
    const [x] = await tx.insert(t.solicitudesSoporte).values({
      barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo, categoria: categoria || null, asunto: asuntoDe(descripcion, categoria), contexto,
      // Un problema con errores registrados entra con prioridad alta.
      prioridad: tipo === "problema" && errores.length ? "alta" : "normal",
    }).returning({ id: t.solicitudesSoporte.id, folio: t.solicitudesSoporte.folio });
    await tx.insert(t.mensajesSoporte).values({ solicitudId: x.id, autorId: s.usuario.id, texto: descripcion, ...(adj ? { adjuntoNombre: adj.nombre, adjuntoTipo: adj.tipo, adjuntoDatos: adj.datos } : {}) });
    await tx.insert(t.eventosSoporte).values({ solicitudId: x.id, autorId: s.usuario.id, accion: `${s.usuario.nombre.split(" ")[0]} envió la solicitud` });
    return x;
  });
  return { ok: true, id: r.id, folio: r.folio };
}

/** Responde dentro de la misma solicitud. Si estaba resuelta o esperando respuesta, vuelve a quedar pendiente. */
export async function responderSolicitud(_: EstadoEnvio, form: FormData): Promise<EstadoEnvio> {
  const s = await requerirSesion();
  const id = texto(form, "solicitudId", 40);
  const msg = texto(form, "texto", 4000);
  const adj = leerAdjunto(form);
  if (adj && "error" in adj) return { error: adj.error };
  if (!msg && !adj) return { error: "Escribe tu respuesta." };
  const [x] = await db.select().from(t.solicitudesSoporte).where(and(eq(t.solicitudesSoporte.id, id), eq(t.solicitudesSoporte.usuarioId, s.usuario.id))).limit(1);
  if (!x) return { error: "No se encontró la solicitud." };
  await db.transaction(async (tx) => {
    await tx.insert(t.mensajesSoporte).values({ solicitudId: id, autorId: s.usuario.id, texto: msg || "Adjuntó un archivo", ...(adj ? { adjuntoNombre: adj.nombre, adjuntoTipo: adj.tipo, adjuntoDatos: adj.datos } : {}) });
    const reabre = x.estado === "resuelto" || x.estado === "esperando";
    await tx.update(t.solicitudesSoporte).set({ actualizadoEn: new Date(), vistoUsuarioEn: new Date(), ...(reabre ? { estado: "pendiente" } : {}) }).where(eq(t.solicitudesSoporte.id, id));
    if (reabre) await tx.insert(t.eventosSoporte).values({ solicitudId: id, autorId: s.usuario.id, accion: x.estado === "resuelto" ? "La persona respondió y se volvió a abrir" : "La persona respondió" });
  });
  return { ok: true, id };
}
