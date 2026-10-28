// Qué puede hacer cada rol. La dueña puede dar permisos extra a una persona.

export const PERMISOS = {
  "ventas.registrar": "Registrar sus propias ventas",
  "ventas.registrar_otros": "Registrar ventas de otras barberas",
  "ventas.ver_todas": "Ver las ventas de todo el equipo",
  "ventas.descuento": "Dar descuentos mayores al límite",
  "ventas.cancelar": "Cancelar ventas",
  "caja.operar": "Abrir y cerrar caja, retiros y gastos de caja",
  "caja.corregir": "Corregir un cierre de caja",
  "equipo.ver": "Ver lo que le toca a cada barbera",
  "equipo.pagar": "Registrar pagos a barberas",
  "reportes.ver": "Ver reportes",
  "reportes.exportar": "Descargar reportes",
  "ideas.decidir": "Aprobar o descartar ideas",
  "ajustes.usuarios": "Dar de alta personas y permisos",
  "ajustes.negocio": "Cambiar servicios, precios y formas de pago",
  "historial.ver": "Ver el historial",
} as const;

export type Permiso = keyof typeof PERMISOS;
export type Rol = "admin" | "duena" | "encargada" | "barbera" | "contador";

const TODOS = Object.keys(PERMISOS) as Permiso[];

export const PERMISOS_POR_ROL: Record<Rol, Permiso[]> = {
  admin: TODOS,
  duena: TODOS,
  encargada: [
    "ventas.registrar", "ventas.registrar_otros", "ventas.ver_todas", "ventas.descuento", "ventas.cancelar", "caja.operar",
  ],
  barbera: ["ventas.registrar"],
  contador: ["ventas.ver_todas", "equipo.ver", "reportes.ver", "reportes.exportar", "historial.ver"],
};

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administración",
  duena: "Dueña",
  encargada: "Encargada",
  barbera: "Barbera",
  contador: "Contador",
};

export function permisosDe(rol: Rol, extra: string[] = []): Set<Permiso> {
  const s = new Set<Permiso>(PERMISOS_POR_ROL[rol]);
  for (const p of extra) if (p in PERMISOS) s.add(p as Permiso);
  return s;
}

/** Quién puede asignar qué rol: nadie puede crear a alguien con más poder que el suyo. */
export function rolesAsignables(rol: Rol): Rol[] {
  if (rol === "admin") return ["duena", "encargada", "barbera", "contador", "admin"];
  if (rol === "duena") return ["duena", "encargada", "barbera", "contador"];
  return [];
}
