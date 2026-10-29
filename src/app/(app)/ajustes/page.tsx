import { and, asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { describirRegla } from "@/lib/comisiones";
import { formatoDinero } from "@/lib/money";
import { db, schema } from "@/lib/db";
import { DESCRIPCION_ROL, GRUPOS_PERMISOS, NOMBRE_ROL, ORDEN_ROL, PERMISOS, PERMISOS_POR_ROL, rolesAsignables } from "@/lib/permisos";
import { Personas } from "./Personas";

export const metadata = { title: "Usuarios" };

export default async function PaginaPersonas({ searchParams }: { searchParams: Promise<{ restablecer?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("ajustes.usuarios")) redirect("/ajustes/servicios");
  const q = await searchParams;
  const [gente, solicitudes, reglas] = await Promise.all([
    db.select().from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)).orderBy(asc(schema.usuarios.nombre)),
    db.select({ usuarioId: schema.solicitudesClave.usuarioId }).from(schema.solicitudesClave).where(and(eq(schema.solicitudesClave.barberiaId, s.barberia.id), eq(schema.solicitudesClave.atendida, false))),
    db.select().from(schema.reglasComision).where(and(eq(schema.reglasComision.barberiaId, s.barberia.id), isNull(schema.reglasComision.vigenteHasta), isNull(schema.reglasComision.servicioId))),
  ]);
  const asignables = rolesAsignables(s.usuario.rol);
  const ahora = Date.now();
  const pide = new Set(solicitudes.map((x) => x.usuarioId));
  const personas = gente
    .sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol))
    .map((u) => ({
      id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, avatar: u.avatar, activo: u.activo, metaSemanal: u.metaSemanal,
      permisosExtra: u.permisosExtra, debeCambiar: u.debeCambiar, pide: pide.has(u.id),
      claveHasta: u.claveTemporal && u.claveTemporalExpira && u.claveTemporalExpira.getTime() > ahora && u.debeCambiar ? u.claveTemporalExpira.getTime() : null,
      yo: u.id === s.usuario.id, editable: u.id !== s.usuario.id && asignables.includes(u.rol === "encargada" ? "barbera" : u.rol),
      forma: (() => { const r = reglas.find((x) => x.barberoId === u.id); return r ? { tipo: r.tipo, porcentaje: r.porcentaje, montoFijo: r.montoFijo, montoSemanal: r.montoSemanal, periodo: r.periodo } : null; })(),
      formaTexto: (() => { const r = reglas.find((x) => x.barberoId === u.id); return r ? describirRegla(r, formatoDinero) : ""; })(),
    }));
  return (
    <Personas
      personas={personas}
      roles={asignables.map((r) => ({ valor: r, texto: NOMBRE_ROL[r], detalle: DESCRIPCION_ROL[r] }))}
      nombresRol={NOMBRE_ROL}
      grupos={GRUPOS_PERMISOS.map((g) => ({ titulo: g.titulo, permisos: g.permisos.map((k) => ({ clave: k, texto: PERMISOS[k] })) }))}
      permisosPorRol={PERMISOS_POR_ROL}
      restablecerId={q.restablecer && personas.some((p) => p.id === q.restablecer && p.editable) ? q.restablecer : null}
    />
  );
}
