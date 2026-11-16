"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema as t } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { esAdministra, TIPOS_PETICION, type TipoPeticion } from "@/lib/peticiones";
import { texto } from "@/lib/volver";

export type Peticion = { id: string; tipo: TipoPeticion; texto: string; estado: "abierta" | "resuelta"; respuesta: string | null; t: string; quien?: string; resolvio?: string; nueva?: boolean };
export type EstadoPeticion = { ok?: boolean; error?: string };

/** Pedir algo a quien administra el negocio. Soporte de plataforma nunca lo ve. */
export async function enviarPeticion(_: EstadoPeticion, form: FormData): Promise<EstadoPeticion> {
  const s = await requerirSesion();
  const tipo = texto(form, "tipo", 20) as TipoPeticion;
  if (!TIPOS_PETICION[tipo]) return { error: "Elige qué necesitas." };
  const cuerpo = texto(form, "texto", 600).trim();
  if (cuerpo.length < 4) return { error: "Escribe en una frase qué necesitas." };
  // Evita la misma petición dos veces seguidas.
  const [igual] = await db.select({ id: t.peticionesInternas.id }).from(t.peticionesInternas).where(and(
    eq(t.peticionesInternas.usuarioId, s.usuario.id), eq(t.peticionesInternas.texto, cuerpo), eq(t.peticionesInternas.estado, "abierta"))).limit(1);
  if (igual) return { error: "Ya enviaste esa misma petición. Te avisaremos cuando la respondan." };
  await db.transaction(async (tx) => {
    await tx.insert(t.peticionesInternas).values({ barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo, texto: cuerpo, pagina: texto(form, "pagina", 120) });
    await registrar(tx, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} pidió a quien administra: ${TIPOS_PETICION[tipo].titulo.toLowerCase()}`, detalle: { texto: cuerpo } });
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Lo que pidió quien tiene la sesión. Al verlas, las respuestas quedan como leídas. */
export async function misPeticiones(): Promise<Peticion[]> {
  const s = await requerirSesion();
  const filas = await db.select({ p: t.peticionesInternas, resolvio: t.usuarios.nombre }).from(t.peticionesInternas)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.peticionesInternas.resueltaPor))
    .where(eq(t.peticionesInternas.usuarioId, s.usuario.id)).orderBy(desc(t.peticionesInternas.creadoEn)).limit(30);
  const nuevas = filas.filter((f) => f.p.estado === "resuelta" && !f.p.vistoUsuarioEn).map((f) => f.p.id);
  if (nuevas.length && !s.vista) await db.update(t.peticionesInternas).set({ vistoUsuarioEn: new Date() }).where(inArray(t.peticionesInternas.id, nuevas));
  return filas.map(({ p, resolvio }) => ({ id: p.id, tipo: p.tipo as TipoPeticion, texto: p.texto, estado: p.estado as Peticion["estado"], respuesta: p.respuesta, t: p.creadoEn.toISOString(),
    resolvio: resolvio?.split(" ")[0], nueva: nuevas.includes(p.id) }));
}

/** Peticiones del equipo, para quien administra: primero las abiertas. */
export async function peticionesEquipo(): Promise<Peticion[]> {
  const s = await requerirSesion();
  if (!esAdministra(s)) return [];
  const filas = await db.select({ p: t.peticionesInternas, quien: t.usuarios.nombre }).from(t.peticionesInternas)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.peticionesInternas.usuarioId))
    .where(and(eq(t.peticionesInternas.barberiaId, s.barberia.id), or(eq(t.peticionesInternas.estado, "abierta"), sql`${t.peticionesInternas.resueltaEn} > now() - interval '14 days'`)))
    .orderBy(sql`${t.peticionesInternas.estado} = 'resuelta'`, desc(t.peticionesInternas.creadoEn)).limit(40);
  return filas.map(({ p, quien }) => ({ id: p.id, tipo: p.tipo as TipoPeticion, texto: p.texto, estado: p.estado as Peticion["estado"], respuesta: p.respuesta, t: p.creadoEn.toISOString(), quien }));
}

/** Responder y cerrar una petición del equipo. */
export async function resolverPeticion(_: EstadoPeticion, form: FormData): Promise<EstadoPeticion> {
  const s = await requerirSesion();
  if (!esAdministra(s)) return { error: "Solo quien administra puede responder peticiones." };
  const id = texto(form, "id", 40);
  const respuesta = texto(form, "respuesta", 400).trim();
  const [p] = await db.update(t.peticionesInternas).set({ estado: "resuelta", respuesta: respuesta || null, resueltaPor: s.usuario.id, resueltaEn: new Date() })
    .where(and(eq(t.peticionesInternas.id, id), eq(t.peticionesInternas.barberiaId, s.barberia.id), eq(t.peticionesInternas.estado, "abierta")))
    .returning({ texto: t.peticionesInternas.texto });
  if (!p) return { error: "Esa petición ya estaba resuelta." };
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "usuario", accion: `${s.usuario.nombre} resolvió una petición del equipo`, detalle: { texto: p.texto, respuesta } });
  revalidatePath("/", "layout");
  return { ok: true };
}

