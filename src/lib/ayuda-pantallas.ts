/**
 * Respuestas cortas por pantalla para el Centro de ayuda: lo que más se pregunta en cada lugar.
 * `guia` es el punto de la guía que enseña esa pantalla paso a paso.
 */
export type AyudaPantalla = { nombre: string; guia?: string; /** Una línea que se muestra las primeras veces que se abre la pantalla. */ intro?: string; preguntas: [string, string][] };

const PANTALLAS: [string, AyudaPantalla][] = [
  ["/cobrar", { nombre: "Cobro", guia: "cobro", intro: "Elige los servicios, quién los hizo y cómo pagó el cliente. La caja lleva la cuenta del efectivo hasta el corte.", preguntas: [
    ["¿Cómo divido un pago en dos?", "Agrega los servicios y toca Dividir pago. Escribe cuánto se paga con cada forma (por ejemplo, una parte en efectivo y otra con tarjeta). El total tiene que cuadrar para poder cobrar."],
    ["Me equivoqué en una venta", "Si acabas de cobrarla, puedes anularla desde Movimientos durante unos minutos. Después, quien administra la cancela o la corrige con un motivo; nada se borra, queda en el historial."],
    ["¿Cómo registro la propina?", "Al cobrar, elige la propina y cómo la pagó el cliente: en efectivo o con tarjeta o transferencia. Es de quien hizo el servicio y se entrega en el corte de caja, aparte de la caja."],
  ] }],
  ["/analitica/finanzas", { nombre: "Movimientos", guia: "ventas", intro: "Todo lo que pasó con el dinero, del más reciente al más viejo: ventas, cortes de caja, egresos y pagos al equipo.", preguntas: [
    ["¿Qué es un egreso y qué es un gasto de caja?", "Un egreso se pagó con transferencia o tarjeta y no toca la caja (renta, internet). Un gasto de caja se pagó con el efectivo de la caja y se descuenta en el corte. Sacar dinero para guardarlo no es gasto: es un retiro."],
    ["¿Qué significa Pago pendiente?", "Es una comisión que ya se calculó pero todavía no se entrega. Se le da a la persona en el próximo corte de caja, de la caja o por transferencia."],
    ["¿Cómo veo un corte de caja?", "Toca la tarjeta blanca del corte en la lista. Se abre su comprobante a un lado, con lo vendido, el efectivo, lo que se entregó al equipo y la diferencia. Desde ahí se imprime."],
  ] }],
  ["/equipo", { nombre: "Equipo", guia: "equipo", intro: "Lo que vende cada persona en el mes y lo que se le debe hoy. Toca a alguien para ver su ficha.", preguntas: [
    ["¿Qué es Por pagar?", "Lo que se le debe hoy a cada persona: lo que lleva en su periodo de pago más lo ya calculado que espera el corte de caja."],
    ["¿Por qué no coincide con lo que vendió?", "Ventas atendidas es lo que pagaron los clientes por sus servicios. Lo que se le paga es su comisión o sueldo sobre eso, según cómo se le paga."],
    ["¿Cómo cambio cómo se le paga a alguien?", "En Ajustes, Usuarios, abre a la persona y cambia Cómo se le paga. El cambio aplica desde ese día; lo anterior se queda como estaba."],
  ] }],
  ["/citas", { nombre: "Citas", guia: "citas", intro: "Tu agenda: las citas del día y de la semana. Desde aquí se agenda, se cambia y se marca quién llegó.", preguntas: [
    ["¿Cómo agendo una cita?", "Toca Nueva cita, elige el servicio, quién atiende, el día y la hora. Puedes mandarle al cliente su comprobante por WhatsApp."],
    ["El cliente no llegó", "En Inicio o en la agenda marca No vino. Se le puede escribir por WhatsApp con su enlace para elegir otra hora."],
    ["¿Cómo comparto mi enlace de reservas?", "En Inicio, Compartir enlace. Los clientes eligen servicio, persona y hora; la cita aparece sola en tu agenda."],
  ] }],
  ["/analitica", { nombre: "Reportes", guia: "analitica", intro: "Cómo va el negocio: lo que se vendió, lo que se gastó y lo que quedó en las fechas que elijas.", preguntas: [
    ["¿Qué es la ganancia?", "Lo que le quedó al negocio: lo vendido menos los gastos y menos lo que le toca al equipo, aunque todavía no se le pague. No es el dinero que hay en la caja."],
    ["¿Cómo veo otro mes?", "Usa el selector de fechas de arriba. Puedes elegir un día, una semana, un mes o un rango."],
    ["¿Puedo descargar los datos?", "Sí, con el botón de descarga en Movimientos o en Datos. Sale en Excel, listo para el contador."],
  ] }],
  ["/ajustes", { nombre: "Ajustes", guia: "ajustes", intro: "Aquí se configura el negocio: usuarios, servicios y precios, cobros, caja y citas.", preguntas: [
    ["¿Cómo agrego a alguien del equipo?", "En Usuarios, Agregar usuario. Escribe su nombre y elige su puesto; la app arma su usuario y una contraseña temporal que dura 30 minutos."],
    ["Alguien olvidó su contraseña", "Abre a la persona en Usuarios y toca Restablecer contraseña. Se genera una temporal; al entrar, elige una nueva."],
    ["¿Cómo cambio un precio?", "En Servicios, toca el precio del servicio y escribe el nuevo. Las ventas anteriores conservan el precio con el que se cobraron."],
  ] }],
  ["/libreta", { nombre: "Datos", guia: "libreta", intro: "El resumen para el contador, por semana y por persona, listo para descargar.", preguntas: [
    ["¿Qué hay aquí?", "El resumen para el contador: ventas, egresos, pagos al equipo y la utilidad por semana y por persona."],
    ["¿Cómo lo descargo?", "Con los botones de descarga. Cada hoja sale en Excel."],
  ] }],
  ["/", { nombre: "Inicio", guia: "acc", preguntas: [
    ["¿Qué son las acciones rápidas?", "Los botones de arriba para lo que más usas. Puedes elegir cuáles salen desde los tres puntos."],
    ["¿Qué es Llevas ganado?", "Lo que te toca en tu periodo de pago por los servicios que atendiste. Las propinas van aparte."],
    ["¿Qué hago con los pendientes?", "Son citas por registrar o cosas por configurar. Cada uno trae su botón para resolverlo en un toque."],
  ] }],
];

/** La ayuda de la pantalla en la que está la persona (la ruta más específica que coincida). */
export function ayudaDe(ruta: string): AyudaPantalla | null {
  const hit = PANTALLAS.filter(([r]) => (r === "/" ? ruta === "/" : ruta === r || ruta.startsWith(r + "/"))).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : null;
}
