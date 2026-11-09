import type { Permiso, Rol } from "./permisos";

export type ItemMenuApp = { href: string; texto: string; icono: string; resalta?: boolean };

/** Secciones del menú principal y pestañas de Analítica según el puesto y sus permisos. */
export function menuDe(rol: Rol, puede: (p: Permiso) => boolean, citas = false) {
  const atiende = rol === "barbera" || rol === "encargada";
  const cobra = puede("ventas.registrar") || puede("ventas.registrar_otros");
  const analitica = puede("reportes.ver") || puede("ventas.ver_todas") || puede("gastos.ver") || puede("cortes.ver");
  const items: ItemMenuApp[] = [];
  items.push({ href: "/", texto: "Inicio", icono: "inicio" });
  if (cobra) items.push({ href: "/cobrar", texto: "Cobro", icono: "cobro" });
  if (citas && puede("citas.ver")) items.push({ href: "/citas", texto: "Citas", icono: "calendario" });
  if (atiende && !puede("ventas.ver_todas")) items.push({ href: "/analitica/ventas", texto: "Ventas", icono: "lista" });
  if (analitica) items.push({ href: "/analitica", texto: "Analítica", icono: "grafica" });
  if (rol === "contador") items.push({ href: "/libreta", texto: "Datos", icono: "lista", resalta: true });
  const sub: [string, string][] = [];
  if (puede("reportes.ver")) sub.push(["/analitica", "Resumen"]);
  if (puede("ventas.ver_todas")) sub.push(["/analitica/ventas", "Ventas"]);
  if (puede("cortes.ver")) sub.push(["/analitica/cortes", "Cortes de caja"]);
  if (puede("reportes.ver") || puede("gastos.ver")) sub.push(["/analitica/finanzas", "Finanzas"]);
  return { items, sub, atiende };
}
