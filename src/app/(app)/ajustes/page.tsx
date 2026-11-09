import { and, asc, eq, isNull, notLike } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { describirRegla } from "@/lib/comisiones";
import { formatoDinero } from "@/lib/money";
import { describirRemuneracion, type Modalidad } from "@/lib/remuneracion";
import { db, schema } from "@/lib/db";
import { DESCRIPCION_ROL, DETALLE_PERMISO, expandirPermisos, GRUPOS_PERMISOS, NOMBRE_ROL, ORDEN_ROL, PERMISOS, PERMISOS_POR_ROL, permisosDe, PLANTILLAS, rolesAsignables } from "@/lib/permisos";
import { esTotal, puedeEditarA, puedeManejar } from "@/lib/puestos";
import { Personas } from "./Personas";

export const metadata = { title: "Usuarios" };

export default async function PaginaPersonas({ searchParams }: { searchParams: Promise<{ restablecer?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("usuarios.ver")) redirect(s.puede("servicios.ver") ? "/ajustes/servicios" : "/ajustes/cobro");
  const q = await searchParams;
  const [gente, solicitudes, reglas, rems, puestos] = await Promise.all([
    db.select().from(schema.usuarios).where(and(eq(schema.usuarios.barberiaId, s.barberia.id), notLike(schema.usuarios.usuario, "BORRADO-%"))).orderBy(asc(schema.usuarios.nombre)),
    db.select({ usuarioId: schema.solicitudesClave.usuarioId }).from(schema.solicitudesClave).where(and(eq(schema.solicitudesClave.barberiaId, s.barberia.id), eq(schema.solicitudesClave.atendida, false))),
    db.select().from(schema.reglasComision).where(and(eq(schema.reglasComision.barberiaId, s.barberia.id), isNull(schema.reglasComision.vigenteHasta), isNull(schema.reglasComision.servicioId))),
    db.select().from(schema.remuneraciones).where(and(eq(schema.remuneraciones.barberiaId, s.barberia.id), isNull(schema.remuneraciones.vigenteHasta))),
    db.select().from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id)).orderBy(asc(schema.puestos.creadoEn)),
  ]);
  const asignables = rolesAsignables(s.usuario.rol, !!s.usuario.puestoId);
  const puestoDe = (id: string | null) => puestos.find((x) => x.id === id) ?? null;
  const ahora = Date.now();
  const pide = new Set(solicitudes.map((x) => x.usuarioId));
  const personas = gente
    .sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol))
    .map((u) => ({
      id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, avatar: u.avatar, activo: u.activo, metaSemanal: u.metaSemanal,
      puestoId: u.puestoId, puesto: puestoDe(u.puestoId)?.nombre ?? NOMBRE_ROL[u.rol],
      permisos: [...permisosDe(u.rol, u.permisosExtra, u.permisosQuitados, puestoDe(u.puestoId)?.permisos ?? null)], debeCambiar: u.debeCambiar, pide: pide.has(u.id),
      claveHasta: u.claveTemporal && u.claveTemporalExpira && u.claveTemporalExpira.getTime() > ahora && u.debeCambiar ? u.claveTemporalExpira.getTime() : null,
      yo: u.id === s.usuario.id, editable: s.puede("usuarios.editar") && !s.vista && puedeEditarA(s, u, permisosDe(u.rol, u.permisosExtra, u.permisosQuitados, puestoDe(u.puestoId)?.permisos ?? null)),
      forma: (() => { const r = reglas.find((x) => x.barberoId === u.id); return r ? { tipo: r.tipo, porcentaje: r.porcentaje, montoFijo: r.montoFijo, montoSemanal: r.montoSemanal, periodo: r.periodo } : null; })(),
      formaTexto: (() => { const r = reglas.find((x) => x.barberoId === u.id); return r ? describirRegla(r, formatoDinero) : ""; })(),
      remuneracion: (() => { const r = rems.find((x) => x.usuarioId === u.id); return r ? { modalidad: r.modalidad as Modalidad, monto: r.monto, periodo: r.periodo, porcentaje: r.porcentaje, horasSemana: r.horasSemana, descripcion: r.descripcion } : null; })(),
      remuneracionTexto: (() => { const r = rems.find((x) => x.usuarioId === u.id); return r ? describirRemuneracion({ ...r, modalidad: r.modalidad as Modalidad }, formatoDinero) : ""; })(),
    }));
  return (
    <Personas
      personas={personas}
      plantillas={PLANTILLAS.map((r) => ({ valor: `rol:${r}`, rol: r, texto: NOMBRE_ROL[r], detalle: DESCRIPCION_ROL[r], permisos: PERMISOS_POR_ROL[r], asignable: asignables.includes(r) }))}
      puestos={puestos.map((x) => ({
        valor: `puesto:${x.id}`, id: x.id, rol: x.plantilla, texto: x.nombre, detalle: x.descripcion, permisos: expandirPermisos(x.permisos), activo: x.activo,
        base: NOMBRE_ROL[x.plantilla], usuarios: gente.filter((g) => g.puestoId === x.id && !g.usuario.startsWith("BORRADO-")).length, asignable: x.activo && puedeManejar(s, x.permisos),
      }))}
      grupos={GRUPOS_PERMISOS.map((g) => ({ titulo: g.titulo, permisos: g.permisos.map((k) => ({ clave: k, texto: PERMISOS[k], detalle: DETALLE_PERMISO[k] ?? "", puedeDar: esTotal(s) || s.puede(k) })) }))}
      editoTotal={esTotal(s)}
      puedeEditar={s.puede("usuarios.editar")}
      descuentoLibre={s.barberia.limiteDescuentoPct >= 100}
      restablecerId={q.restablecer && personas.some((p) => p.id === q.restablecer && p.editable) ? q.restablecer : null}
    />
  );
}
