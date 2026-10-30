import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { describirEvento } from "@/lib/eventos";
import { formatoDinero } from "@/lib/money";

export const dynamic = "force-dynamic";

const s = schema;
const RUTA: Record<string, string> = {
  venta: "/analitica/ventas", caja: "/analitica/cortes", usuario: "/ajustes", precio: "/ajustes/servicios",
  ajuste: "/ajustes/cobro", equipo: "/analitica/equipo",
};

export type EventoVivo = { id: string; t: string; titulo: string; detalle?: string; href?: string; nombre: string; avatar: string };
export type AlertaVivo = { id: string; titulo: string; detalle: string; href: string };
export type SolicitudVivo = { id: string; usuarioId: string; nombre: string; avatar: string; t: string };
/** Notificación personal: solo lo que a esa persona le toca saber. */
export type AvisoVivo = { id: string; t: string; titulo: string; detalle?: string; href: string; nombre: string; avatar: string; icono?: string };

/** Actividad reciente para la ventana "En vivo". */
export async function GET() {
  const se = await obtenerSesion();
  if (!se || se.usuario.debeCambiar) return Response.json({ eventos: [], solicitudes: [] }, { status: 401 });
  const bId = se.barberia.id;
  const desde = new Date(Date.now() - 24 * 3600 * 1000);
  let eventos: EventoVivo[] = [];

  // Cobros recientes, escritos como en una conversación: "Luz cobró un Fade, $170 con tarjeta".
  const cobros = await db
    .select({ id: s.ventas.id, t: s.ventas.creadoEn, folio: s.ventas.folio, estado: s.ventas.estado, total: s.ventas.total, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
    .from(s.ventas)
    .innerJoin(s.usuarios, eq(s.usuarios.id, s.ventas.registradaPor))
    .where(and(eq(s.ventas.barberiaId, bId), gte(s.ventas.creadoEn, desde)))
    .orderBy(desc(s.ventas.creadoEn))
    .limit(25);
  const ids = cobros.map((c) => c.id);
  const [cs, ps] = ids.length ? await Promise.all([
    db.select({ ventaId: s.conceptos.ventaId, nombre: s.conceptos.nombreServicio, barberoId: s.conceptos.barberoId, barbero: s.usuarios.nombre, avatar: s.usuarios.avatar })
      .from(s.conceptos).innerJoin(s.usuarios, eq(s.usuarios.id, s.conceptos.barberoId)).where(inArray(s.conceptos.ventaId, ids)),
    db.select({ ventaId: s.pagos.ventaId, metodo: s.pagos.nombreMetodo }).from(s.pagos).where(inArray(s.pagos.ventaId, ids)),
  ]) : [[], []];
  const verTodas = se.puede("ventas.ver_todas");
  for (const c of cobros) {
    const conceptos = cs.filter((x) => x.ventaId === c.id);
    if (!verTodas && !conceptos.some((x) => x.barberoId === se.usuario.id)) continue;
    const quien = conceptos[0];
    const servicios = conceptos.map((x) => x.nombre);
    const lista = servicios.length > 2 ? `${servicios.slice(0, 2).join(", ")} y ${servicios.length - 2} más` : servicios.join(" y ");
    const metodos = [...new Set(ps.filter((x) => x.ventaId === c.id).map((x) => x.metodo.toLowerCase()))].join(" y ");
    eventos.push({
      id: `v${c.id}${c.estado}`, t: c.t.toISOString(),
      titulo: c.estado === "cancelada" ? `Se canceló ${lista}` : `${(quien?.barbero ?? c.nombre).split(" ")[0]} atendió ${lista}`,
      detalle: `${formatoDinero(c.total)}${metodos ? ` con ${metodos}` : ""}`,
      href: verTodas ? "/analitica/ventas" : "/mis-ventas", nombre: quien?.barbero ?? c.nombre, avatar: quien?.avatar ?? c.avatar,
    });
  }

  // Lo demás que pasó: caja para todos; personas, precios y ajustes para quien ve el historial.
  const verHistorial = se.puede("historial.ver");
  const filas = await db
    .select({ id: s.historial.id, t: s.historial.creadoEn, accion: s.historial.accion, tipo: s.historial.tipo, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
    .from(s.historial)
    .leftJoin(s.usuarios, eq(s.usuarios.id, s.historial.usuarioId))
    .where(and(eq(s.historial.barberiaId, bId), gte(s.historial.creadoEn, desde), verHistorial ? inArray(s.historial.tipo, ["caja", "usuario", "precio", "ajuste", "equipo", "idea"]) : eq(s.historial.tipo, "caja")))
    .orderBy(desc(s.historial.creadoEn))
    .limit(20);
  const verSolicitudes = se.puede("ajustes.usuarios");
  for (const f of filas) {
    if (verSolicitudes && f.accion.endsWith("pidió restablecer su contraseña")) continue;
    // "Ana Martínez López abrió la caja" se lee mejor como "Ana abrió la caja".
    const titulo = f.nombre && f.accion.startsWith(f.nombre) ? f.nombre.split(" ")[0] + f.accion.slice(f.nombre.length) : f.accion;
    eventos.push({ id: `h${f.id}`, t: f.t.toISOString(), titulo, href: verHistorial ? RUTA[f.tipo] : undefined, nombre: f.nombre ?? "Sistema", avatar: f.avatar ?? "cangrejo" });
  }
  eventos.sort((a, b) => b.t.localeCompare(a.t));
  eventos = eventos.slice(0, 20);

  let solicitudes: SolicitudVivo[] = [];
  if (se.puede("ajustes.usuarios")) {
    const filas = await db
      .select({ id: s.solicitudesClave.id, usuarioId: s.solicitudesClave.usuarioId, t: s.solicitudesClave.creadoEn, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar, rol: s.usuarios.rol })
      .from(s.solicitudesClave)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.solicitudesClave.usuarioId))
      .where(and(eq(s.solicitudesClave.barberiaId, bId), eq(s.solicitudesClave.atendida, false), inArray(s.usuarios.rol, ["encargada", "barbera", "contador", ...(se.usuario.rol === "admin" ? (["duena", "admin"] as const) : [])])))
      .orderBy(desc(s.solicitudesClave.creadoEn))
      .limit(10);
    solicitudes = filas.filter((f) => f.usuarioId !== se.usuario.id).map((f) => ({ id: f.id, usuarioId: f.usuarioId, nombre: f.nombre, avatar: f.avatar, t: f.t.toISOString() }));
  }
  // Pasadas las 12 de la noche con la caja del día anterior abierta.
  const alertas: AlertaVivo[] = [];
  const [t] = await db.select().from(s.turnosCaja).where(and(eq(s.turnosCaja.barberiaId, bId), eq(s.turnosCaja.estado, "abierto"))).limit(1);
  if (t && t.fechaOperativa < fechaLocal(new Date(), se.barberia.zonaHoraria)) {
    alertas.push({ id: `caja-${t.id}`, titulo: "No se cerró la caja de ayer", detalle: "Haz el corte para seguir cobrando", href: "/cobrar?caja=cerrar" });
  }
  const avisos = await avisosPara(se);
  return Response.json({ eventos, solicitudes, alertas, avisos }, { headers: { "Cache-Control": "no-store" } });
}

type Sesion = NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>;
const primer = (n: string | null | undefined) => (n ?? "").split(" ")[0];

/**
 * Notificaciones de los últimos 7 días, como en una red social.
 * Barberos: cuando alguien cobra o cancela un servicio suyo, cuando reciben un pago y cuando cambian servicios o precios.
 * Propietario y administración: diferencias en cortes, ventas canceladas y egresos registrados por otros.
 */
async function avisosPara(se: Sesion): Promise<AvisoVivo[]> {
  const bId = se.barberia.id;
  const yo = se.usuario.id;
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const avisos: AvisoVivo[] = [];
  const atiende = se.usuario.rol === "barbera" || se.usuario.rol === "encargada";
  const registro = alias(s.usuarios, "registro");

  if (atiende) {
    const mios = await db
      .select({ id: s.ventas.id, t: s.ventas.creadoEn, estado: s.ventas.estado, canceladaEn: s.ventas.canceladaEn, canceladaPor: s.ventas.canceladaPor, motivo: s.ventas.motivoCancelacion,
        registradaPor: s.ventas.registradaPor, servicio: s.conceptos.nombreServicio, monto: s.conceptos.precioCobrado, quien: registro.nombre, avatar: registro.avatar })
      .from(s.conceptos)
      .innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
      .innerJoin(registro, eq(registro.id, s.ventas.registradaPor))
      .where(and(eq(s.ventas.barberiaId, bId), eq(s.conceptos.barberoId, yo), gte(s.ventas.creadoEn, desde)))
      .orderBy(desc(s.ventas.creadoEn)).limit(30);
    for (const v of mios) {
      if (v.registradaPor !== yo) avisos.push({ id: `c${v.id}${v.servicio}`, t: v.t.toISOString(), titulo: `${primer(v.quien)} cobró tu ${v.servicio}`, detalle: formatoDinero(v.monto), href: "/mis-ventas", nombre: v.quien, avatar: v.avatar });
      if (v.estado === "cancelada" && v.canceladaPor !== yo && v.canceladaEn) avisos.push({ id: `x${v.id}${v.servicio}`, t: v.canceladaEn.toISOString(), titulo: `Se canceló tu ${v.servicio}`, detalle: v.motivo ?? undefined, href: "/mis-ventas", nombre: "Cancelación", avatar: "cangrejo", icono: "basura" });
    }
    const pagos = await db.select({ id: s.pagosComision.id, t: s.pagosComision.creadoEn, tipo: s.pagosComision.tipo, monto: s.pagosComision.monto, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
      .from(s.pagosComision).innerJoin(s.usuarios, eq(s.usuarios.id, s.pagosComision.usuarioId))
      .where(and(eq(s.pagosComision.barberiaId, bId), eq(s.pagosComision.barberoId, yo), gte(s.pagosComision.creadoEn, desde)));
    for (const p of pagos) avisos.push({
      id: `p${p.id}`, t: p.t.toISOString(), titulo: p.tipo === "pago" ? `Recibiste un pago de ${formatoDinero(p.monto)}` : `Se registró tu renta de ${formatoDinero(p.monto)}`,
      detalle: `Lo registró ${primer(p.nombre)}`, href: "/mis-ventas", nombre: p.nombre, avatar: p.avatar, icono: "efectivo",
    });
    const cambios = await db.select({ id: s.historial.id, t: s.historial.creadoEn, tipo: s.historial.tipo, accion: s.historial.accion, detalle: s.historial.detalle, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
      .from(s.historial).leftJoin(s.usuarios, eq(s.usuarios.id, s.historial.usuarioId))
      .where(and(eq(s.historial.barberiaId, bId), gte(s.historial.creadoEn, desde), sql`(${s.historial.tipo} = 'precio' or (${s.historial.tipo} = 'ajuste' and ${s.historial.accion} ~ ' el servicio '))`))
      .orderBy(desc(s.historial.creadoEn)).limit(10);
    for (const c of cambios) {
      const e = describirEvento(c.tipo, c.accion, (c.detalle ?? {}) as Record<string, unknown>, c.nombre);
      avisos.push({ id: `h${c.id}`, t: c.t.toISOString(), titulo: `${e.titulo}${e.objeto ? `: ${e.objeto}` : ""}`, detalle: e.extra && e.extra !== "Ver cambios" ? e.extra : undefined, href: "/historial?tipo=precio", nombre: c.nombre ?? "Sistema", avatar: c.avatar ?? "cangrejo", icono: "etiqueta" });
    }
  }

  if (se.puede("reportes.ver") || se.puede("ajustes.usuarios")) {
    const [cortes, canceladas, egresos] = await Promise.all([
      db.select({ id: s.turnosCaja.id, t: s.turnosCaja.cerradoEn, dif: s.turnosCaja.diferencia, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
        .from(s.turnosCaja).leftJoin(s.usuarios, eq(s.usuarios.id, s.turnosCaja.cerradoPor))
        .where(and(eq(s.turnosCaja.barberiaId, bId), eq(s.turnosCaja.estado, "cerrado"), gte(s.turnosCaja.cerradoEn, desde), sql`${s.turnosCaja.diferencia} <> 0`)),
      db.select({ id: s.ventas.id, t: s.ventas.canceladaEn, folio: s.ventas.folio, total: s.ventas.total, motivo: s.ventas.motivoCancelacion, por: s.ventas.canceladaPor, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
        .from(s.ventas).leftJoin(s.usuarios, eq(s.usuarios.id, s.ventas.canceladaPor))
        .where(and(eq(s.ventas.barberiaId, bId), eq(s.ventas.estado, "cancelada"), gte(s.ventas.canceladaEn, desde))),
      db.select({ id: s.gastos.id, t: s.gastos.creadoEn, monto: s.gastos.monto, concepto: s.gastos.concepto, por: s.gastos.usuarioId, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
        .from(s.gastos).innerJoin(s.usuarios, eq(s.usuarios.id, s.gastos.usuarioId))
        .where(and(eq(s.gastos.barberiaId, bId), gte(s.gastos.creadoEn, desde))),
    ]);
    for (const c of cortes) if (c.t) avisos.push({
      id: `k${c.id}`, t: c.t.toISOString(), titulo: `${(c.dif ?? 0) < 0 ? "Faltaron" : "Sobraron"} ${formatoDinero(Math.abs(c.dif ?? 0))} en un corte`,
      detalle: `Lo cerró ${primer(c.nombre)}`, href: "/analitica/cortes", nombre: c.nombre ?? "", avatar: c.avatar ?? "cangrejo", icono: "caja",
    });
    for (const v of canceladas) if (v.t && v.por !== yo) avisos.push({ id: `x${v.id}`, t: v.t.toISOString(), titulo: `${primer(v.nombre)} canceló la venta ${v.folio}`, detalle: `${formatoDinero(v.total)}${v.motivo ? `, ${v.motivo}` : ""}`, href: `/analitica/ventas?q=${v.folio}`, nombre: v.nombre ?? "", avatar: v.avatar ?? "cangrejo" });
    for (const g of egresos) if (g.por !== yo) avisos.push({ id: `g${g.id}`, t: g.t.toISOString(), titulo: `${primer(g.nombre)} registró un egreso de ${formatoDinero(g.monto)}`, detalle: g.concepto, href: "/analitica/gastos", nombre: g.nombre, avatar: g.avatar });
  }
  return avisos.sort((a, b) => b.t.localeCompare(a.t)).slice(0, 25);
}
