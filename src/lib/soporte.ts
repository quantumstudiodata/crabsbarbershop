// Textos y opciones del Centro de ayuda y del panel de solicitudes de soporte.

export const TIPOS_SOLICITUD = {
  problema: { titulo: "Reportar un problema", detalle: "Algo no funciona correctamente o encontraste un error.", corto: "Problema" },
  duda: { titulo: "Tengo una duda", detalle: "Necesito ayuda para entender o utilizar alguna función.", corto: "Duda" },
  mejora: { titulo: "Sugerir una mejora", detalle: "Tengo una idea para mejorar la plataforma.", corto: "Mejora" },
} as const;
export type TipoSolicitud = keyof typeof TIPOS_SOLICITUD;

export const CATEGORIAS_PROBLEMA = ["No puedo realizar una operación", "Los datos no aparecen correctamente", "La página presenta un error", "Otro problema"] as const;

export const ESTADOS_SOLICITUD = { pendiente: "Pendiente", revision: "En revisión", esperando: "Esperando respuesta", resuelto: "Resuelto" } as const;
export type EstadoSolicitud = keyof typeof ESTADOS_SOLICITUD;

export const PRIORIDADES = { baja: "Baja", normal: "Normal", alta: "Alta", urgente: "Urgente" } as const;
export type Prioridad = keyof typeof PRIORIDADES;

/** El asunto sale del inicio de la descripción, cortado en una palabra completa. */
export function asuntoDe(texto: string, categoria?: string | null): string {
  const linea = texto.split(/[\n.?!]/)[0].trim();
  if (!linea) return categoria ?? "Solicitud";
  if (linea.length <= 70) return linea[0].toUpperCase() + linea.slice(1);
  const corte = linea.slice(0, 70);
  return `${corte.slice(0, corte.lastIndexOf(" ") > 40 ? corte.lastIndexOf(" ") : 70)}…`;
}

/** "Hace 12 min", "Hace 1 h", "Ayer", "3 nov". */
export function hace(d: Date | string, ahora = new Date()): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const min = Math.round((ahora.getTime() - t.getTime()) / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  if (h < 48) return "Ayer";
  return t.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Monterrey" }).replace(".", "");
}
