// Qué puede hacer cada rol. El propietario puede dar permisos extra a una persona.

export const PERMISOS = {
  "ventas.registrar": "Registrar ventas",
  "ventas.registrar_otros": "Cobrar servicios de otros",
  "ventas.descuento": "Aplicar descuentos mayores al límite",
  "ventas.cancelar": "Cancelar ventas",
  "ventas.modificar": "Modificar ventas realizadas",
  "servicios.editar": "Editar servicios y precios",
  "caja.operar": "Abrir y cerrar caja",
  "caja.retiros": "Registrar retiros y gastos de caja",
  "cortes.ver": "Ver cortes de caja",
  "caja.corregir": "Corregir cortes",
  "gastos.ver": "Ver egresos",
  "gastos.registrar": "Registrar egresos",
  "gastos.cancelar": "Cancelar egresos",
  "equipo.pagar": "Registrar pagos al equipo",
  "ventas.ver_todas": "Ver movimientos del equipo",
  "usuarios.ver": "Ver usuarios",
  "usuarios.editar": "Editar usuarios",
  "servicios.ver": "Ver servicios y precios",
  "configuracion.ver": "Ver configuración del negocio",
  "configuracion.cobros": "Editar cobros y métodos de pago",
  "configuracion.caja": "Editar configuración de caja",
  "configuracion.metas": "Editar metas de ventas",
  "configuracion.egresos": "Editar egresos y finanzas",
  "reportes.ver": "Ver analítica y finanzas",
  "reportes.exportar": "Descargar analítica",
  "ideas.decidir": "Gestionar ideas",
  "citas.ver": "Consultar citas",
  "citas.modificar": "Registrar y modificar citas",
  "citas.cancelar": "Cancelar reservaciones",
  "citas.pagos": "Consultar pagos de citas",
  "citas.horarios": "Administrar horarios y disponibilidad",
  "configuracion.citas": "Editar citas y reservaciones en línea",
} as const;

/** Explicación corta de los permisos que no se entienden solo con el nombre. */
export const DETALLE_PERMISO: Partial<Record<keyof typeof PERMISOS, string>> = {
  "configuracion.ver": "Consultar los ajustes de cada apartado",
  "configuracion.cobros": "Formas de pago, reglas de cobro y autorización de descuentos",
  "configuracion.caja": "Apertura, fondo inicial, diferencias y modelo de caja",
  "configuracion.metas": "Activar metas y cambiar los objetivos del negocio y del equipo",
  "configuracion.egresos": "Categorías, gastos frecuentes, comprobantes y periodicidad",
  "caja.retiros": "Sacar efectivo de la caja o pagar un gasto con ella",
  "ventas.ver_todas": "Ventas e historial de todo el equipo",
  "citas.modificar": "Agendar citas, cambiar su horario y marcar llegada, atención o término",
  "citas.horarios": "Horarios de cada persona, descansos y horarios bloqueados",
  "configuracion.citas": "Reservaciones en línea, anticipación, pagos y políticas",
};

/** Permisos que cambiaron de nombre o se separaron: se traducen al leerlos para no perder lo que ya estaba dado. */
const ANTES: Record<string, string[]> = {
  "ajustes.usuarios": ["usuarios.ver", "usuarios.editar"],
  "ajustes.negocio": ["servicios.ver", "servicios.editar", "configuracion.ver", "configuracion.cobros", "configuracion.caja", "configuracion.metas", "configuracion.egresos"],
  "ajustes.funciones": ["configuracion.ver", "configuracion.cobros", "configuracion.caja", "configuracion.metas", "configuracion.egresos"],
  "historial.ver": ["ventas.ver_todas"],
  "equipo.ver": [],
  // Antes, abrir la caja incluía retiros y gastos; registrar egresos incluía cancelarlos.
  "caja.operar": ["caja.operar", "caja.retiros"],
  "gastos.registrar": ["gastos.registrar", "gastos.cancelar"],
};

export type Permiso = keyof typeof PERMISOS;
// En la base: duena = Titular, contador = Administrador, barbera = Barbero, admin = Soporte técnico.
export type Rol = "admin" | "duena" | "encargada" | "barbera" | "contador";

const TODOS = Object.keys(PERMISOS) as Permiso[];

/** Plantillas: los permisos con los que empieza cada puesto. Se pueden ajustar por persona. */
export const PERMISOS_POR_ROL: Record<Rol, Permiso[]> = {
  duena: TODOS,
  admin: TODOS,
  contador: [
    "ventas.ver_todas", "cortes.ver", "gastos.ver", "gastos.registrar", "gastos.cancelar", "equipo.pagar",
    "usuarios.ver", "servicios.ver", "configuracion.ver", "reportes.ver", "reportes.exportar",
    "citas.ver", "citas.pagos",
  ],
  // En el local hay una sola computadora: cualquiera puede cobrar lo que hizo otra persona.
  // Los barberos también abren y cierran la caja: son quienes cobran.
  barbera: ["ventas.registrar", "ventas.registrar_otros", "caja.operar", "caja.retiros", "citas.ver", "citas.modificar"],
  encargada: ["ventas.registrar", "ventas.registrar_otros", "caja.operar", "caja.retiros", "citas.ver", "citas.modificar"],
};

export const NOMBRE_ROL: Record<Rol, string> = {
  duena: "Titular",
  contador: "Administrador",
  barbera: "Barbero",
  // El rol de encargado ya no existe; las cuentas que lo tenían se tratan como barbero.
  encargada: "Barbero",
  admin: "Soporte técnico",
};

/** Las cuatro plantillas, en el orden en que se muestran. */
export const PLANTILLAS: Rol[] = ["duena", "contador", "barbera", "admin"];

/** Traduce permisos guardados con nombres anteriores a los actuales. */
export function expandirPermisos(xs: string[]): Permiso[] {
  return [...new Set(xs.flatMap((p) => ANTES[p] ?? [p]).filter((p) => p in PERMISOS))] as Permiso[];
}

/**
 * Permisos reales de una persona: los de su puesto (plantilla o puesto personalizado),
 * más los que se le dieron aparte, menos los que se le quitaron.
 */
export function permisosDe(rol: Rol, extra: string[] = [], quitados: string[] = [], puesto?: string[] | null): Set<Permiso> {
  const s = new Set<Permiso>(puesto ? expandirPermisos(puesto) : PERMISOS_POR_ROL[rol]);
  // Puestos guardados antes de que existieran las citas: pueden consultarlas (la agenda es para todo el equipo).
  if (puesto && !puesto.some((p) => p.startsWith("citas.") || p === "configuracion.citas")) s.add("citas.ver");
  for (const p of expandirPermisos(extra)) s.add(p);
  for (const p of quitados) s.delete(p as Permiso);
  return s;
}

/** Quién puede asignar qué plantilla: solo Titular y Soporte técnico pueden crear a alguien con todo el poder. */
export function rolesAsignables(rol: Rol, conPuesto = false): Rol[] {
  if (!conPuesto && (rol === "admin" || rol === "duena")) return ["duena", "contador", "barbera", "admin"];
  return ["contador", "barbera"];
}

/** Orden de jerarquía para listas de personas. */
export const ORDEN_ROL: Rol[] = ["duena", "admin", "contador", "encargada", "barbera"];

export const DESCRIPCION_ROL: Record<Rol, string> = {
  duena: "Dueño del negocio, con acceso a todo",
  contador: "Administra el negocio: egresos, cortes, pagos y reportes",
  barbera: "Cobra sus servicios y opera la caja",
  encargada: "Cobra sus servicios y opera la caja",
  admin: "Mantiene el sistema y ayuda con problemas técnicos",
};

/** Permisos agrupados por categoría, para asignarlos con interruptores. */
export const GRUPOS_PERMISOS: { titulo: string; permisos: Permiso[] }[] = [
  { titulo: "Ventas y cobros", permisos: ["ventas.registrar", "ventas.registrar_otros", "ventas.descuento", "ventas.cancelar", "ventas.modificar", "servicios.editar"] },
  { titulo: "Caja y pagos", permisos: ["caja.operar", "caja.retiros", "cortes.ver", "caja.corregir", "gastos.ver", "gastos.registrar", "gastos.cancelar", "equipo.pagar"] },
  { titulo: "Equipo y administración", permisos: ["ventas.ver_todas", "usuarios.ver", "usuarios.editar", "servicios.ver"] },
  { titulo: "Citas y agenda", permisos: ["citas.ver", "citas.modificar", "citas.cancelar", "citas.pagos", "citas.horarios"] },
  { titulo: "Configurar negocio", permisos: ["configuracion.ver", "configuracion.cobros", "configuracion.caja", "configuracion.metas", "configuracion.egresos", "configuracion.citas"] },
  { titulo: "Analítica y finanzas", permisos: ["reportes.ver", "reportes.exportar"] },
  { titulo: "Funciones adicionales", permisos: ["ideas.decidir"] },
];

/** Puede entrar a Configurar negocio quien la ve o edita algún apartado. */
export const PERMISOS_CONFIG: Permiso[] = ["configuracion.ver", "configuracion.cobros", "configuracion.caja", "configuracion.metas", "configuracion.egresos", "configuracion.citas"];
