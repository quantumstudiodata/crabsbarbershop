import { and, asc, eq, gt, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { descansosDeSemana, instante, leerConfig, type Horario } from "@/lib/agenda";
import { equipoAgenda, rotacionesDe } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { fechaLocal, horaCorta, lunesDe, sumarDias } from "@/lib/fechas";
import { PantallaCitas, type CitaVista } from "./PantallaCitas";

export const metadata = { title: "Citas y agenda" };

type Q = { dia?: string; vista?: string; persona?: string };

export default async function Citas({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion("citas.ver");
  if (!s.barberia.usaCitas) redirect("/?aviso=sin-permiso");
  const q = await searchParams;
  const b = s.barberia;
  const zona = b.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? "") ? q.dia! : hoy;
  const vista = q.vista === "calendario" || q.vista === "semana" || q.vista === "horarios" ? q.vista : "lista";
  const lunes = lunesDe(dia);
  const desde = vista === "semana" ? lunes : dia;
  const hasta = vista === "semana" ? sumarDias(lunes, 7) : sumarDias(dia, 1);
  const [equipo, rots, filas, bloqueos, servicios, futuros] = await Promise.all([
    equipoAgenda(b.id),
    rotacionesDe(b.id),
    db.select().from(schema.citas).where(and(eq(schema.citas.barberiaId, b.id),
      sql`${schema.citas.inicio} >= ${new Date(instante(desde, 0, zona))} and ${schema.citas.inicio} < ${new Date(instante(hasta, 0, zona))}`,
      notInArray(schema.citas.estado, ["expirada"]),
      or(ne(schema.citas.estado, "apartada"), gt(schema.citas.expiraEn, new Date())))).orderBy(asc(schema.citas.inicio)),
    db.select().from(schema.bloqueosAgenda).where(and(eq(schema.bloqueosAgenda.barberiaId, b.id), gt(schema.bloqueosAgenda.fin, new Date()))).orderBy(asc(schema.bloqueosAgenda.inicio)).limit(40),
    db.select({ id: schema.servicios.id, nombre: schema.servicios.nombre, categoria: schema.servicios.categoria, precio: schema.servicios.precio, duracionMin: schema.servicios.duracionMin })
      .from(schema.servicios).where(and(eq(schema.servicios.barberiaId, b.id), eq(schema.servicios.activo, true))).orderBy(asc(schema.servicios.orden)),
    // Cuántas citas pendientes hay en los próximos días, para marcar los días en la tira.
    db.select({ d: sql<string>`to_char(${schema.citas.inicio} at time zone ${zona}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(schema.citas)
      .where(and(eq(schema.citas.barberiaId, b.id), gt(schema.citas.inicio, new Date(instante(sumarDias(dia, -7), 0, zona))), lt(schema.citas.inicio, new Date(instante(sumarDias(dia, 8), 0, zona))),
        notInArray(schema.citas.estado, ["expirada", "cancelada"]))).groupBy(sql`1`),
  ]);
  const verPagos = s.puede("citas.pagos");
  const nombre = (id: string) => equipo.find((e) => e.id === id)?.nombre ?? "";
  const citas: CitaVista[] = filas.map((c) => ({
    id: c.id, folio: c.folio, cliente: c.clienteNombre, telefono: c.clienteTelefono, barberoId: c.barberoId, barbero: nombre(c.barberoId), indiferente: c.indiferente,
    fecha: fechaLocal(c.inicio, zona), hora: horaCorta(c.inicio, zona), horaFin: horaCorta(c.fin, zona), inicioMs: c.inicio.getTime(), duracion: c.duracionMin,
    servicios: c.servicios.map((x) => x.nombre), total: c.total, pagado: verPagos ? c.pagado : null, metodo: verPagos ? c.metodoPago : null,
    estadoPago: verPagos ? c.estadoPago : null, estado: c.estado, observaciones: c.observaciones, origen: c.origen,
    creada: `${fechaLocal(c.creadoEn, zona)} ${horaCorta(c.creadoEn, zona)}`, ventaId: c.ventaId,
  }));
  const config = leerConfig(b.citasConfig);
  return (
    <PantallaCitas
      hoy={hoy} dia={dia} vista={vista} persona={q.persona ?? ""} citas={citas} ahora={Date.now()}
      equipo={equipo.map((e) => ({ id: e.id, nombre: e.nombre, avatar: e.avatar, horario: e.horario as Horario | null }))}
      servicios={servicios}
      horarioNegocio={b.horario as Horario} cerrados={b.diasCerrados} conteo={Object.fromEntries(futuros.map((x) => [x.d, x.n]))}
      rotacion={rots[0] ? { ...rots[0], estaSemana: descansosDeSemana(rots[0], dia) } : null}
      bloqueos={bloqueos.map((x) => ({ id: x.id, persona: x.usuarioId ? nombre(x.usuarioId) : "Todo el negocio", fecha: fechaLocal(x.inicio, zona), desde: horaCorta(x.inicio, zona), hasta: horaCorta(x.fin, zona), motivo: x.motivo }))}
      enlace={config.enLinea && b.slug ? `/reservar/${b.slug}` : null}
      puede={{ modificar: s.puede("citas.modificar") && !s.vista, cancelar: s.puede("citas.cancelar") && !s.vista, pagos: verPagos, horarios: s.puede("citas.horarios") && !s.vista, cobrar: s.puede("ventas.registrar") || s.puede("ventas.registrar_otros") }}
    />
  );
}
