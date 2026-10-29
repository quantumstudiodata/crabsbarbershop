// Convierte cada línea del historial en un evento con estructura uniforme: qué pasó, sobre qué, y el dato clave.

import { formatoDinero } from "./money";

export type Evento = { titulo: string; objeto?: string; extra?: string; categoria: string };

const dinero = (v: unknown) => (typeof v === "number" ? formatoDinero(v) : typeof v === "string" ? v : "");

export function describirEvento(tipo: string, accion: string, detalle: Record<string, unknown>, nombre: string | null): Evento {
  const sin = nombre && accion.startsWith(nombre) ? accion.slice(nombre.length).trim() : accion;
  const d = detalle ?? {};
  const m = (re: RegExp) => sin.match(re);
  let r: RegExpMatchArray | null;
  if ((r = m(/^cobró la venta (\S+)/))) return { categoria: "venta", titulo: "Venta cobrada", objeto: `Folio ${r[1]}`, extra: dinero(d.total) };
  if ((r = m(/^canceló la venta (\S+)/))) return { categoria: "venta", titulo: "Venta cancelada", objeto: `Folio ${r[1]}`, extra: typeof d.motivo === "string" ? d.motivo : "" };
  if (m(/^abrió la caja/)) return { categoria: "caja", titulo: "Caja abierta", extra: d.fondo !== undefined ? `Fondo ${dinero(d.fondo)}` : "" };
  if (m(/^(hizo el corte de caja|cerró la caja)/)) {
    const dif = typeof d.diferencia === "number" ? d.diferencia : 0;
    return { categoria: "caja", titulo: "Corte de caja realizado", extra: `${dif === 0 ? "Sin diferencias" : dif > 0 ? `Sobraron ${formatoDinero(dif)}` : `Faltaron ${formatoDinero(-dif)}`}${typeof d.contado === "number" ? `, ${formatoDinero(d.contado)} contados` : ""}` };
  }
  if ((r = m(/^registró (un retiro|una entrada) de (\S+)/))) return { categoria: "caja", titulo: r[1] === "un retiro" ? "Retiro de caja" : "Entrada de caja", objeto: r[2], extra: typeof d.concepto === "string" ? d.concepto : "" };
  if ((r = m(/^registró un gasto de (\S+)/))) return { categoria: "caja", titulo: "Gasto de caja", objeto: r[1], extra: typeof d.concepto === "string" ? d.concepto : "" };
  if ((r = m(/^corrigió el cierre del (\S+) en (.+)/))) return { categoria: "caja", titulo: "Ajuste a un corte", objeto: r[1], extra: r[2] };
  if ((r = m(/^cambió el precio de (.+)/))) return { categoria: "precio", titulo: "Precio modificado", objeto: r[1], extra: d.antes && d.ahora ? `${d.antes} a ${d.ahora}` : "" };
  if ((r = m(/^agregó el servicio (.+?) a (\S+)$/))) return { categoria: "precio", titulo: "Servicio agregado", objeto: r[1], extra: r[2] };
  if ((r = m(/^editó el servicio (.+)/))) return { categoria: "ajuste", titulo: "Servicio modificado", objeto: r[1], extra: "Ver cambios" };
  if ((r = m(/^(ocultó|volvió a mostrar) el servicio (.+)/))) return { categoria: "ajuste", titulo: r[1] === "ocultó" ? "Servicio ocultado" : "Servicio visible otra vez", objeto: r[2] };
  if ((r = m(/^eliminó el servicio (.+)/))) return { categoria: "ajuste", titulo: "Servicio eliminado", objeto: r[1] };
  if ((r = m(/^dio de alta a (.+?) como (.+)/))) return { categoria: "usuario", titulo: "Usuario creado", objeto: r[1], extra: r[2] };
  if ((r = m(/^restableció la contraseña de (.+)/))) return { categoria: "usuario", titulo: "Contraseña restablecida", objeto: r[1] };
  if ((r = m(/^(desactivó|reactivó) a (.+)/))) return { categoria: "usuario", titulo: r[1] === "desactivó" ? "Usuario desactivado" : "Usuario reactivado", objeto: r[2] };
  if ((r = m(/^eliminó a (.+?)(,|$)/))) return { categoria: "usuario", titulo: "Usuario eliminado", objeto: r[1] };
  if ((r = m(/^cambió a (.+?): (.+)/))) return { categoria: "usuario", titulo: "Usuario modificado", objeto: r[1], extra: r[2] };
  if ((r = m(/^cambió la forma de pago de (.+?): (.+)/))) return { categoria: "equipo", titulo: "Forma de pago modificada", objeto: r[1], extra: r[2] };
  if (m(/^pidió restablecer su contraseña/)) return { categoria: "usuario", titulo: "Pidió restablecer su contraseña" };
  if (m(/^cambió su contraseña/)) return { categoria: "acceso", titulo: "Cambió su contraseña" };
  if (m(/reglas de cobro|límites del negocio/)) return { categoria: "ajuste", titulo: "Reglas de cobro modificadas", objeto: "Configuración de caja", extra: "Ver cambios" };
  if ((r = m(/^(activó|desactivó) la forma de pago (.+)/))) return { categoria: "ajuste", titulo: r[1] === "activó" ? "Forma de pago activada" : "Forma de pago desactivada", objeto: r[2] };
  if ((r = m(/^agregó la forma de pago (.+)/))) return { categoria: "ajuste", titulo: "Forma de pago agregada", objeto: r[1] };
  if ((r = m(/^registró un pago de (\S+) a (.+)/))) return { categoria: "equipo", titulo: "Pago al equipo", objeto: r[2], extra: r[1] };
  if ((r = m(/la idea: (.+)/))) return { categoria: "idea", titulo: sin.includes("interesa") ? "Idea marcada como interesante" : "Idea descartada", objeto: r[1] };
  if (m(/^Se bloqueó el usuario/) || accion.startsWith("Se bloqueó")) return { categoria: "acceso", titulo: "Usuario bloqueado por intentos fallidos" };
  return { categoria: tipo, titulo: sin.charAt(0).toUpperCase() + sin.slice(1) };
}
