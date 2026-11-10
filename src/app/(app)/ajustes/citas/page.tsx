import { and, asc, eq, gt } from "drizzle-orm";
import { cobraEnLinea } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { descansosDeSemana, leerConfig, type Horario } from "@/lib/agenda";
import { equipoAgenda, rotacionesDe } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { permisosDe, type Permiso } from "@/lib/permisos";
import { AjustesCitas } from "./AjustesCitas";

export const metadata = { title: "Citas y agenda" };

/** Ajustes, Citas y agenda: Horarios, Reservaciones y Página de citas. */
export default async function AjustesCitasPagina({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requerirSesion();
  const puedeConfig = s.puede("configuracion.citas") && !s.vista;
  const puedeHorarios = s.puede("citas.horarios") && !s.vista;
  if (!s.puede("configuracion.citas") && !s.puede("citas.horarios")) redirect("/ajustes");
  const q = await searchParams;
  const b = s.barberia;
  const zona = b.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const [equipo, rots, bloqueos, servicios, gente] = await Promise.all([
    equipoAgenda(b.id),
    rotacionesDe(b.id),
    db.select().from(schema.bloqueosAgenda).where(and(eq(schema.bloqueosAgenda.barberiaId, b.id), gt(schema.bloqueosAgenda.fin, new Date()))).orderBy(asc(schema.bloqueosAgenda.inicio)).limit(40),
    db.select({ nombre: schema.servicios.nombre, precio: schema.servicios.precio }).from(schema.servicios).where(and(eq(schema.servicios.barberiaId, b.id), eq(schema.servicios.activo, true))).orderBy(asc(schema.servicios.orden)).limit(3),
    db.select({ rol: schema.usuarios.rol, extra: schema.usuarios.permisosExtra, quitados: schema.usuarios.permisosQuitados, puesto: schema.puestos.permisos, nombre: schema.usuarios.nombre }).from(schema.usuarios).leftJoin(schema.puestos, eq(schema.puestos.id, schema.usuarios.puestoId)).where(and(eq(schema.usuarios.barberiaId, b.id), eq(schema.usuarios.activo, true))),
  ]);
  const nombre = (id: string) => equipo.find((e) => e.id === id)?.nombre ?? "";
  const quienes = (p: Permiso) => [...new Set(gente.filter((u) => permisosDe(u.rol, u.extra, u.quitados, u.puesto).has(p)).map((u) => u.nombre.split(" ")[0]))].join(", ") || "Nadie";
  const tab = q.tab === "reservaciones" || q.tab === "pagina" ? q.tab : "horarios";
  return (
    <AjustesCitas
      tab={tab} negocio={b.nombre} origen="crabsbarber.shop" puedeConfig={puedeConfig} puedeHorarios={puedeHorarios} hoy={hoy} cobraEnLinea={cobraEnLinea(b)}
      inicial={{ usaCitas: b.usaCitas, slug: b.slug ?? "", horario: b.horario as Horario, cerrados: b.diasCerrados, config: leerConfig(b.citasConfig) }}
      equipo={equipo.map((e) => ({ id: e.id, nombre: e.nombre, avatar: e.avatar, horario: e.horario as Horario | null }))}
      rotacion={rots[0] ? { ...rots[0], estaSemana: descansosDeSemana(rots[0], hoy) } : null}
      bloqueos={bloqueos.map((x) => ({ id: x.id, personaId: x.usuarioId ?? "", persona: x.usuarioId ? nombre(x.usuarioId) : "Todo el negocio", fecha: fechaLocal(x.inicio, zona), desde: horaCorta(x.inicio, zona), hasta: horaCorta(x.fin, zona), motivo: x.motivo }))}
      servicios={servicios}
      quien={([["citas.ver", "Consultar las citas"], ["citas.modificar", "Modificar las citas"], ["citas.cancelar", "Cancelar reservaciones"], ["citas.pagos", "Consultar los pagos"], ["citas.horarios", "Administrar horarios"]] as const).map(([k, t]) => [t, quienes(k)] as [string, string])}
    />
  );
}
