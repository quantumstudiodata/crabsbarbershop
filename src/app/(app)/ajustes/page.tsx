import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DESCRIPCION_ROL, NOMBRE_ROL, ORDEN_ROL, PERMISOS, PERMISOS_POR_ROL, rolesAsignables } from "@/lib/permisos";
import { Personas } from "./Personas";

export const metadata = { title: "Personas" };

export default async function PaginaPersonas({ searchParams }: { searchParams: Promise<{ restablecer?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("ajustes.usuarios")) redirect("/ajustes/servicios");
  const q = await searchParams;
  const [gente, solicitudes] = await Promise.all([
    db.select().from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)).orderBy(asc(schema.usuarios.nombre)),
    db.select({ usuarioId: schema.solicitudesClave.usuarioId }).from(schema.solicitudesClave).where(and(eq(schema.solicitudesClave.barberiaId, s.barberia.id), eq(schema.solicitudesClave.atendida, false))),
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
      yo: u.id === s.usuario.id, editable: u.id !== s.usuario.id && asignables.includes(u.rol),
    }));
  return (
    <Personas
      personas={personas}
      roles={asignables.map((r) => ({ valor: r, texto: NOMBRE_ROL[r], detalle: DESCRIPCION_ROL[r] }))}
      nombresRol={NOMBRE_ROL}
      permisos={Object.entries(PERMISOS).filter(([k]) => !k.startsWith("ajustes.")).map(([k, v]) => ({ clave: k, texto: v }))}
      permisosPorRol={PERMISOS_POR_ROL}
      restablecerId={q.restablecer && personas.some((p) => p.id === q.restablecer && p.editable) ? q.restablecer : null}
    />
  );
}
