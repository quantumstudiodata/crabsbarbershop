import type { Sesion } from "./auth";
import { expandirPermisos } from "./permisos";

/** Titular y Soporte técnico (sin puesto personalizado) pueden asignar cualquier permiso. */
export const esTotal = (s: Sesion) => !s.usuario.puestoId && (s.usuario.rol === "duena" || s.usuario.rol === "admin");

/** Nadie puede dar (o manejar un puesto con) permisos que no tiene. */
export const puedeManejar = (s: Sesion, permisos: string[]) => esTotal(s) || expandirPermisos(permisos).every((p) => s.puede(p));

type Persona = { id: string; rol: string; puestoId: string | null; permisosExtra: string[]; permisosQuitados: string[] };

/**
 * Quién puede editar a quién. Titular y Soporte técnico, a cualquiera (a sí mismos, solo sus permisos).
 * Los demás, solo a personas que no tienen más permisos que ellos y que no son Titular ni Soporte técnico.
 */
export function puedeEditarA(s: Sesion, u: Persona, permisosDeU: Set<string>) {
  if (esTotal(s)) return true;
  if (u.id === s.usuario.id) return false;
  if (!u.puestoId && (u.rol === "duena" || u.rol === "admin")) return false;
  return [...permisosDeU].every((p) => s.puede(p as never));
}
