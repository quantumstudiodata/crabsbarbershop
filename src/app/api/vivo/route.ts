import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
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
  return Response.json({ eventos, solicitudes, alertas }, { headers: { "Cache-Control": "no-store" } });
}
