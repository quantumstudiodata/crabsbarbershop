// Qué puede hacer cada rol. El propietario puede dar permisos extra a una persona.

export const PERMISOS = {
  "ventas.registrar": "Registrar ventas",
  "ventas.registrar_otros": "Cobrar servicios de otros",
  "ventas.ver_todas": "Ver ventas del equipo",
  "ventas.descuento": "Aplicar descuentos mayores al límite",
  "ventas.cancelar": "Cancelar ventas",
  "caja.operar": "Abrir y cerrar caja, registrar retiros y gastos",
  "caja.corregir": "Corregir cortes",
  "gastos.registrar": "Registrar y cancelar egresos",
  "equipo.ver": "Ver comisiones",
  "equipo.pagar": "Registrar pagos al equipo",
  "reportes.ver": "Ver reportes",
  "reportes.exportar": "Descargar reportes",
  "ideas.decidir": "Gestionar ideas",
  "ajustes.usuarios": "Dar de alta personas y permisos",
  "ajustes.negocio": "Cambiar servicios, precios y formas de pago",
  "historial.ver": "Consultar historial",
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
  // En el local hay una sola computadora: cualquiera puede cobrar lo que hizo otra persona.
  // Los barberos también abren y cierran la caja: son quienes cobran.
  barbera: ["ventas.registrar", "ventas.registrar_otros", "caja.operar"],
  contador: ["ventas.ver_todas", "equipo.ver", "reportes.ver", "reportes.exportar", "historial.ver", "gastos.registrar"],
};

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  duena: "Propietario",
  // El rol de encargado ya no existe; las cuentas que lo tenían se tratan como barbero.
  encargada: "Barbero",
  barbera: "Barbero",
  contador: "Contador",
};

export function permisosDe(rol: Rol, extra: string[] = []): Set<Permiso> {
  const s = new Set<Permiso>(PERMISOS_POR_ROL[rol]);
  for (const p of extra) if (p in PERMISOS) s.add(p as Permiso);
  return s;
}

/** Quién puede asignar qué rol: nadie puede crear a alguien con más poder que el suyo. */
export function rolesAsignables(rol: Rol): Rol[] {
  if (rol === "admin") return ["duena", "admin", "barbera", "contador"];
  if (rol === "duena") return ["duena", "admin", "barbera", "contador"];
  return [];
}

/** Orden de jerarquía para listas de personas. */
export const ORDEN_ROL: Rol[] = ["duena", "admin", "contador", "encargada", "barbera"];

export const DESCRIPCION_ROL: Record<Rol, string> = {
  duena: "Control total del negocio",
  admin: "Configura el sistema, usuarios y precios, y consulta reportes",
  contador: "Consulta y descarga información financiera",
  encargada: "Cobra, abre y cierra caja",
  barbera: "Registra cobros, propinas y servicios",
};

/** Permisos agrupados para la ventana de edición de usuario. */
export const GRUPOS_PERMISOS: { titulo: string; permisos: Permiso[] }[] = [
  { titulo: "Ventas y cobros", permisos: ["ventas.registrar", "ventas.registrar_otros", "ventas.descuento", "ventas.cancelar"] },
  { titulo: "Caja y pagos", permisos: ["caja.operar", "caja.corregir", "gastos.registrar", "equipo.pagar"] },
  { titulo: "Reportes y administración", permisos: ["ventas.ver_todas", "equipo.ver", "reportes.ver", "reportes.exportar", "historial.ver", "ideas.decidir"] },
];
