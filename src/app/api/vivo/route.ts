import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";

export const dynamic = "force-dynamic";

const s = schema;
const RUTA: Record<string, string> = {
  venta: "/analitica/ventas", caja: "/analitica/cortes", usuario: "/ajustes", precio: "/ajustes/servicios",
  ajuste: "/ajustes/cobro", equipo: "/analitica/equipo",
};

export type EventoVivo = { id: string; t: string; titulo: string; detalle?: string; href?: string; nombre: string; avatar: string };
export type SolicitudVivo = { id: string; usuarioId: string; nombre: string; avatar: string; t: string };

/** Actividad reciente para la ventana "En vivo". */
export async function GET() {
  const se = await obtenerSesion();
  if (!se || se.usuario.debeCambiar) return Response.json({ eventos: [], solicitudes: [] }, { status: 401 });
  const bId = se.barberia.id;
  const desde = new Date(Date.now() - 24 * 3600 * 1000);
  let eventos: EventoVivo[] = [];

  if (se.puede("historial.ver")) {
    const filas = await db
      .select({ id: s.historial.id, t: s.historial.creadoEn, accion: s.historial.accion, tipo: s.historial.tipo, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar })
      .from(s.historial)
      .leftJoin(s.usuarios, eq(s.usuarios.id, s.historial.usuarioId))
      .where(and(eq(s.historial.barberiaId, bId), gte(s.historial.creadoEn, desde)))
      .orderBy(desc(s.historial.creadoEn))
      .limit(20);
    // Las solicitudes de contraseña ya salen arriba con su botón.
    const verSolicitudes = se.puede("ajustes.usuarios");
    eventos = filas.filter((f) => f.tipo !== "acceso" && !(verSolicitudes && f.accion.endsWith("pidió restablecer su contraseña"))).map((f) => ({
      id: `h${f.id}`, t: f.t.toISOString(), titulo: f.accion, href: RUTA[f.tipo], nombre: f.nombre ?? "Sistema", avatar: f.avatar ?? "cangrejo",
    }));
  } else {
    // Barberos: los servicios que se registraron a su nombre.
    const filas = await db
      .select({ id: s.conceptos.id, t: s.ventas.creadoEn, servicio: s.conceptos.nombreServicio, monto: s.conceptos.precioCobrado, estado: s.ventas.estado, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar, folio: s.ventas.folio })
      .from(s.conceptos)
      .innerJoin(s.ventas, eq(s.ventas.id, s.conceptos.ventaId))
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.ventas.registradaPor))
      .where(and(eq(s.conceptos.barberiaId, bId), eq(s.conceptos.barberoId, se.usuario.id), gte(s.ventas.creadoEn, desde)))
      .orderBy(desc(s.ventas.creadoEn))
      .limit(20);
    eventos = filas.map((f) => ({
      id: `c${f.id}${f.estado}`, t: f.t.toISOString(),
      titulo: f.estado === "cancelada" ? `Se canceló ${f.servicio}` : `${f.servicio}, ${formatoDinero(f.monto)}`,
      detalle: `Folio ${f.folio}. Lo registró ${f.nombre.split(" ")[0]}`, href: "/mis-ventas", nombre: f.nombre, avatar: f.avatar,
    }));
  }

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
  return Response.json({ eventos, solicitudes }, { headers: { "Cache-Control": "no-store" } });
}
