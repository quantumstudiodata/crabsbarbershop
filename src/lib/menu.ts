import type { Permiso, Rol } from "./permisos";

export type ItemMenuApp = { href: string; texto: string; icono: string; resalta?: boolean; /** Otras rutas que pertenecen a esta sección. */ tambien?: string[] };
export type GrupoMenu = { base: string; items: [string, string][] };

/**
 * Secciones del menú principal y sus pestañas según el puesto y sus permisos.
 * Analítica agrupa Resumen, Ventas, Equipo, Corte de caja y Finanzas; Clientes agrupa Citas y agenda y Reseñas.
 */
export function menuDe(rol: Rol, puede: (p: Permiso) => boolean, citas = false) {
  const atiende = rol === "barbera" || rol === "encargada";
  const cobra = puede("ventas.registrar") || puede("ventas.registrar_otros");
  const analitica = puede("reportes.ver") || puede("ventas.ver_todas") || puede("gastos.ver") || puede("cortes.ver");
  const equipo = puede("ventas.ver_todas") || puede("equipo.pagar");
  // Quien atiende y no ve las ventas de todos tiene Movimientos como sección propia; no se repite dentro de Reportes.
  const movPropio = atiende && !puede("ventas.ver_todas");
  const sub: [string, string][] = [];
  if (puede("reportes.ver")) sub.push(["/analitica", "Resumen"]);
  // Movimientos reúne ventas, cortes de caja y entradas y salidas de dinero en un solo historial.
  if (!movPropio && (puede("reportes.ver") || puede("gastos.ver") || puede("ventas.ver_todas") || puede("cortes.ver"))) sub.push(["/analitica/finanzas", "Movimientos"]);
  if (equipo) sub.push(["/equipo", "Equipo"]);
  const clientes: [string, string][] = [];
  if (citas && puede("citas.ver")) clientes.push(["/citas", "Citas y agenda"]);
  if (equipo) clientes.push(["/clientes/resenas", "Reseñas"]);

  const items: ItemMenuApp[] = [];
  items.push({ href: "/", texto: "Inicio", icono: "inicio" });
  if (cobra) items.push({ href: "/cobrar", texto: "Cobro", icono: "cobro" });
  if (movPropio) items.push({ href: "/analitica/finanzas", texto: "Movimientos", icono: "lista", tambien: VISTAS_MOVIMIENTOS });
  // Con Movimientos propio, Reportes solo aparece si hay algo más que ver (el resumen del negocio).
  if (movPropio ? puede("reportes.ver") : analitica) items.push({ href: "/analitica", texto: "Reportes", icono: "grafica", tambien: equipo ? ["/equipo"] : undefined });
  else if (equipo) items.push({ href: "/equipo", texto: "Equipo", icono: "persona" });
  if (clientes.length > 1) items.push({ href: "/clientes", texto: "Clientes", icono: "clientes", tambien: ["/citas"] });
  else if (clientes.length === 1) items.push({ href: clientes[0][0], texto: clientes[0][0] === "/citas" ? "Citas" : "Reseñas", icono: clientes[0][0] === "/citas" ? "calendario" : "estrella", tambien: ["/clientes"] });
  if (rol === "contador") items.push({ href: "/libreta", texto: "Datos", icono: "lista", resalta: true });
  const grupos: GrupoMenu[] = [];
  if (sub.length > 1) grupos.push({ base: "/analitica", items: sub });
  if (clientes.length > 1) grupos.push({ base: "/clientes", items: clientes });
  return { items, sub, grupos, atiende };
}

/** Pantallas que viven dentro de Movimientos: el detalle de los cortes y la dirección vieja de Ventas. */
export const VISTAS_MOVIMIENTOS = ["/analitica/cortes", "/analitica/ventas"];
const comoMovimientos = (ruta: string) => (VISTAS_MOVIMIENTOS.some((v) => ruta === v || ruta.startsWith(v + "/")) ? "/analitica/finanzas" : ruta);

/** Si la ruta está dentro de la pestaña: la que es prefijo de otra solo cuenta exacta (Resumen en /analitica). */
export function pestanaActiva(rutaReal: string, href: string, items: [string, string][]) {
  const ruta = comoMovimientos(rutaReal);
  // Resumen (/analitica) es la portada de Reportes: solo cuenta en su propia página, no en Movimientos ni en otras de /analitica.
  const exacta = href === "/analitica" || items.some(([o]) => o !== href && o.startsWith(href + "/"));
  return exacta ? ruta === href : ruta === href || ruta.startsWith(href + "/");
}

/** Grupo de pestañas en el que está la ruta, si lo hay. */
export function grupoDe(ruta: string, grupos: GrupoMenu[]) {
  return grupos.find((g) => g.items.some(([h]) => pestanaActiva(ruta, h, g.items)));
}
