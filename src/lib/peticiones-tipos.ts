/** Lo que alguien del equipo puede pedir a quien administra el negocio. */
export const TIPOS_PETICION = {
  permiso: { titulo: "Un permiso", detalle: "Entrar a una sección o hacer algo que hoy no te deja.", ejemplo: "Ejemplo: necesito registrar egresos" },
  correccion: { titulo: "Corregir algo", detalle: "Una venta, un corte o un pago que quedó mal.", ejemplo: "Ejemplo: cobré un Fade como Corte clásico en la venta de las 4:15" },
  contrasena: { titulo: "Mi contraseña", detalle: "No puedo entrar o quiero que me la restablezcan.", ejemplo: "Ejemplo: olvidé mi contraseña" },
  otro: { titulo: "Otra cosa", detalle: "Cualquier cosa del negocio que deba ver quien administra.", ejemplo: "Ejemplo: cambiar mi horario del sábado" },
} as const;
export type TipoPeticion = keyof typeof TIPOS_PETICION;
