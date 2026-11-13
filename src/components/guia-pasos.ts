/**
 * Guía de primer uso: qué se enseña y dónde. Cada punto de la lista tiene sus pasos sobre la app real.
 *
 * Un selector puede llevar texto con "|": `button.metodo|Pago con QR` busca ese botón que diga eso.
 * modo:
 *  - "pasa": el toque llega al botón real (abrir una ventana, elegir un servicio, cambiar de pantalla).
 *  - "leer": solo se explica; se sigue con el botón Siguiente o tocando lo señalado.
 *  - "final": el último botón de una acción (Guardar, Cobrar). La guía lo detiene: así se aprende sin registrar nada.
 */
export type ModoPaso = "pasa" | "leer" | "final";
export type Paso = {
  sel: string;
  modo: ModoPaso;
  t: string;
  x: string;
  /** Lo que tiene que hacer, en una línea. */
  h?: string;
  /** Solo en escritorio o solo en teléfono. */
  solo?: "esc" | "mov";
  /** Si no está en pantalla se salta sin avisar. */
  opcional?: boolean;
  /** Al terminar el punto: cerrar la ventana abierta o limpiar el cobro. */
  despues?: "cerrar" | "limpiar";
  /** Si lo señalado no existe (por ejemplo, todavía no hay ventas), se señala esto con otro texto. */
  alt?: { sel: string; t: string; x: string };
  /** El paso solo aplica si esto NO está en pantalla. */
  siFalta?: string;
  /** El paso termina cuando aparece esto en pantalla (por ejemplo, la caja ya abierta). */
  hasta?: string;
  /** Teclas a explicar (atajos). */
  teclas?: [string, string][];
};
export type Punto = { id: string; nombre: string; ejemplo: string; ruta: string; ir: string[]; pasos: Paso[] };

const CERRAR: Paso["despues"] = "cerrar";

export const PUNTOS: Record<string, Punto> = {
  acc: {
    id: "acc", nombre: "Acciones rápidas", ejemplo: "Lo que más usas, a un toque desde Inicio.", ruta: "/", ir: ['a[href="/"]'],
    pasos: [
      { sel: ".ini-acc, .ini-lista", modo: "leer", t: "Tus acciones rápidas", x: "Aquí están los botones que vas a usar todo el día. Un toque y llegas directo, sin buscar en el menú.", h: "Toca Siguiente" },
      { sel: ".ini-pts, .ini-pers", modo: "leer", opcional: true, t: "Hazlas a tu medida", x: "Desde aquí ordenas tus acciones o escondes las que no ocupas.", h: "Toca Siguiente" },
    ],
  },
  cobro: {
    id: "cobro", nombre: "Cobrar un servicio", ejemplo: "Ejemplo: le hiciste un Corte clásico a un cliente.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: ".caja-puerta form", modo: "pasa", opcional: true, hasta: "button.svc, button.cm-n", t: "Primero se abre la caja", x: "Al empezar el día se escribe con cuánto efectivo arranca la caja para dar cambio, y se toca Abrir caja. Sin caja abierta no se puede cobrar.", h: "Escribe el efectivo y toca Abrir caja" },
      { sel: "button.svc, button.cm-n", modo: "pasa", t: "Elige lo que le hiciste al cliente", x: "Toca el servicio. Si fueron dos, tócalo dos veces. El total se suma solo.", h: "Toca el primer servicio" },
      { sel: "button.per, .cm-quien button, button.on", modo: "leer", opcional: true, solo: "esc", t: "¿Quién lo atendió?", x: "Aquí eliges a la persona que hizo el servicio. La venta y su comisión se le cuentan a ella.", h: "Toca Siguiente" },
      { sel: "button.bc-info ~ button.bt", modo: "pasa", solo: "mov", opcional: true, t: "Ve al total", x: "Toca Cobrar para ver el total y elegir cómo te pagó.", h: "Toca Cobrar" },
      { sel: ".metodos", modo: "leer", opcional: true, t: "¿Cómo te pagó?", x: "Efectivo, transferencia o tarjeta. Si te paga en efectivo, escribes con cuánto te pagó y la app te dice el cambio.", h: "Toca Siguiente" },
      { sel: 'button[data-paso="cobrar"]', modo: "final", opcional: true, despues: "limpiar", t: "Último paso: Cobrar", x: "Revisa el total y toca Cobrar. La venta queda registrada a nombre de quien atendió y suma a su meta del día.", h: "Toca Cobrar" },
    ],
  },
  atajos: {
    id: "atajos", nombre: "Atajos del teclado", ejemplo: "Cobra sin soltar el teclado.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: ".atajos", modo: "leer", solo: "esc", t: "Cobra sin usar el mouse", x: "", h: "Toca Siguiente", teclas: [
        ["Enter", "o las flechas: te mueves entre los servicios"], ["Espacio", "elige el servicio donde estás"], ["D", "pone un descuento"],
        ["2", "divide el pago en dos, por ejemplo mitad efectivo y mitad tarjeta"], ["Esc", "borra todo para empezar de nuevo"]] },
    ],
  },
  qr: {
    id: "qr", nombre: "Cobro con QR", ejemplo: "El cliente paga con su tarjeta desde su celular.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: "button.metodo|Pago con QR", modo: "leer", opcional: true, t: "Cobro con QR", x: "Eliges Pago con QR, le muestras el código al cliente y él paga con su tarjeta desde su celular. Ese dinero no entra al efectivo de la caja.", h: "Toca Siguiente" },
      { sel: ".metodos, .estado-c, .estado-m", modo: "leer", siFalta: "button.metodo|Pago con QR", t: "Cuando el cliente paga con tarjeta desde su celular", x: "Si el negocio tiene activos los cobros en línea, aquí aparece Pago con QR: le muestras el código y el cliente paga ahí mismo. Cuando se confirma, la venta se registra sola.", h: "Toca Siguiente" },
    ],
  },
  retiro: {
    id: "retiro", nombre: "Sacar efectivo", ejemplo: "Ejemplo: sacar $500 de la caja para depositarlos.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: "button.fantasma|Retiro", modo: "pasa", solo: "esc", t: "Sacar dinero de la caja", x: "Cada vez que alguien saca efectivo de la caja, se anota aquí. Así el corte cuadra al final del día.", h: "Toca Retiro" },
      { sel: "button.em-pts", modo: "pasa", solo: "mov", t: "Sacar dinero de la caja", x: "Retiro, gasto y corte de caja viven en este botón.", h: "Toca los tres puntos" },
      { sel: ".em-menu button|Retiro", modo: "pasa", solo: "mov", t: "Elige Retiro", x: "Cada vez que alguien saca efectivo, se anota aquí para que el corte cuadre.", h: "Toca Retiro" },
      { sel: '.modal input[name="monto"], [role=dialog] input[name="monto"]', modo: "leer", t: "¿Cuánto sacas?", x: "Escribe la cantidad. Por ejemplo, $500 para llevarlos al banco.", h: "Toca Siguiente" },
      { sel: "[role=dialog] .billetes", modo: "leer", opcional: true, t: "¿Para qué?", x: "Elige el motivo o escríbelo. Queda guardado quién lo sacó y a qué hora.", h: "Toca Siguiente" },
      { sel: "[role=dialog] form .acciones .bt", modo: "final", despues: CERRAR, t: "Guárdalo", x: "Con Guardar, el retiro se descuenta del efectivo que debe haber en la caja.", h: "Toca Guardar" },
    ],
  },
  gasto: {
    id: "gasto", nombre: "Registrar un gasto", ejemplo: "Ejemplo: pagar el garrafón de agua con dinero de la caja.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: "button.fantasma|Gasto", modo: "pasa", solo: "esc", t: "Gastos pagados con la caja", x: "Si pagas algo con el efectivo de la caja, como el garrafón o productos de limpieza, se anota aquí.", h: "Toca Gasto" },
      { sel: "button.em-pts", modo: "pasa", solo: "mov", t: "Gastos pagados con la caja", x: "Si pagas algo con el efectivo de la caja, se anota desde este botón.", h: "Toca los tres puntos" },
      { sel: ".em-menu button|Gasto", modo: "pasa", solo: "mov", t: "Elige Gasto", x: "Por ejemplo, el garrafón de agua.", h: "Toca Gasto" },
      { sel: '[role=dialog] input[name="monto"]', modo: "leer", t: "¿Cuánto costó?", x: "Escribe la cantidad, por ejemplo $40 del garrafón.", h: "Toca Siguiente" },
      { sel: "[role=dialog] .billetes", modo: "leer", opcional: true, t: "Elige la categoría", x: "Así en Finanzas se ve en qué se va el dinero del negocio.", h: "Toca Siguiente" },
      { sel: "[role=dialog] form .acciones .bt", modo: "final", despues: CERRAR, t: "Guárdalo", x: "Con Guardar, el gasto se resta de la caja y aparece en los egresos del negocio.", h: "Toca Guardar" },
    ],
  },
  egreso: {
    id: "egreso", nombre: "Registrar un gasto", ejemplo: "Ejemplo: el pago de la renta o del internet.", ruta: "/", ir: ['a[href="/"]'],
    pasos: [
      { sel: 'a[href="/analitica/finanzas?egreso=1"]', modo: "final", t: "Gastos del negocio", x: "Aquí registras lo que paga el negocio: renta, luz, internet o productos. Se resta en Finanzas para ver la utilidad real.", h: "Toca Egreso" },
    ],
  },
  corte: {
    id: "corte", nombre: "Corte de caja", ejemplo: "Al terminar el día cuentas el efectivo y cierras la caja.", ruta: "/cobrar", ir: ['a[href="/cobrar"]'],
    pasos: [
      { sel: "button.bt.chico.solo|Corte de caja", modo: "pasa", solo: "esc", t: "El corte de caja", x: "Al terminar el día se cuenta el efectivo y se cierra la caja. Empieza aquí.", h: "Toca Corte de caja" },
      { sel: "button.em-pts", modo: "pasa", solo: "mov", t: "El corte de caja", x: "Al terminar el día se cuenta el efectivo y se cierra la caja.", h: "Toca los tres puntos" },
      { sel: ".em-menu button|Corte de caja", modo: "pasa", solo: "mov", t: "Elige Corte de caja", x: "", h: "Toca Corte de caja" },
      { sel: "[role=dialog] .ck-res", modo: "leer", t: "Lo que se vendió", x: "El resumen del turno, separado por forma de pago: efectivo, tarjeta, transferencia.", h: "Toca Siguiente" },
      { sel: "[role=dialog] .ck-acc .bt", modo: "pasa", t: "Sigue al siguiente paso", x: "Toca el botón para continuar con el corte.", h: "Toca el botón" },
      { sel: "[role=dialog] .ck-com", modo: "leer", opcional: true, t: "Lo que le toca a cada quien", x: "La comisión que generó cada persona con las ventas de este corte. Si hoy toca pagar, eliges si sale de la caja, mañana o por transferencia.", h: "Toca Siguiente" },
      { sel: "[role=dialog] .ck-acc .bt|Contar efectivo", modo: "pasa", opcional: true, t: "Ahora a contar", x: "Toca para pasar al conteo del efectivo.", h: "Toca Contar efectivo" },
      { sel: '[role=dialog] input[name="contado"]', modo: "leer", t: "¿Cuánto efectivo hay?", x: "Cuenta los billetes y monedas de la caja y escribe el total. La app te dice si coincide, si sobra o si falta.", h: "Toca Siguiente" },
      { sel: "[role=dialog] .ck-acc .bt", modo: "final", despues: CERRAR, t: "Cierra la caja", x: "En el último paso tocas Cerrar caja y el corte queda guardado con su folio.", h: "Toca el botón" },
    ],
  },
  cortesver: {
    id: "cortesver", nombre: "Cortes de caja", ejemplo: "Consulta cada corte y si tuvo diferencia.", ruta: "/analitica/cortes", ir: ['a[href="/analitica/cortes"]', 'a[href="/analitica"]'],
    pasos: [
      { sel: ".rev-l, .hist-linea", modo: "leer", alt: { sel: "main .glass", t: "Aquí verás cada corte", x: "Todavía no hay cortes. Cada vez que alguien cierre la caja, aparecerá aquí con lo vendido y si sobró o faltó dinero." }, t: "Cada corte del equipo", x: "Aquí está cada cierre de caja: quién lo hizo, cuánto se vendió y si sobró o faltó dinero. Tócalo para ver el detalle y sus comprobantes.", h: "Toca Siguiente" },
    ],
  },
  ventas: {
    id: "ventas", nombre: "Ventas", ejemplo: "Todo lo cobrado: quién lo hizo y cómo pagaron.", ruta: "/analitica/ventas", ir: ['a[href="/analitica/ventas"]', 'a[href="/analitica"]'],
    pasos: [
      { sel: ".hist-linea", modo: "leer", alt: { sel: "main .glass", t: "Aquí verás cada venta", x: "Todavía no hay ventas. En cuanto cobres la primera, aparecerá aquí con su hora, servicios, folio y total." }, t: "Cada renglón es una venta", x: "Ves la hora, los servicios, el folio y el total. Tócala para ver el detalle o el ticket.", h: "Toca Siguiente" },
      { sel: "button.campo-f, button.input", modo: "leer", opcional: true, t: "Busca lo que necesites", x: "Filtra por fechas o por persona para encontrar una venta en segundos.", h: "Toca Siguiente" },
    ],
  },
  citas: {
    id: "citas", nombre: "Citas", ejemplo: "Agenda a un cliente en tres pasos.", ruta: "/citas", ir: ['a[href="/citas"]', 'a[href="/clientes"]'],
    pasos: [
      { sel: "button.ag-bt.pri, button[aria-label='Nueva cita']", modo: "final", t: "Agenda a un cliente", x: "Con Nueva cita eliges el servicio, el día y la hora, y escribes su nombre. Al final le mandas la confirmación por WhatsApp.", h: "Toca Nueva cita" },
    ],
  },
  agenda: {
    id: "agenda", nombre: "Citas y agenda", ejemplo: "Todas las citas de la semana de un vistazo.", ruta: "/citas", ir: ['a[href="/citas"]', 'a[href="/clientes"]'],
    pasos: [
      { sel: ".cal-semana, .cal-dia, .ln-linea, .ag-cuerpo, main section.glass", modo: "leer", t: "Tu agenda", x: "Aquí ves tu semana. Cada cita aparece como un bloque con su hora y el cliente: tócala para marcar que llegó, cobrarla o cambiarla de horario.", h: "Toca Siguiente" },
      { sel: "button.ag-bt|Compartir", modo: "leer", opcional: true, t: "Que reserven solos", x: "Comparte tu enlace o tu QR y tus clientes apartan su lugar a cualquier hora.", h: "Toca Siguiente" },
    ],
  },
  resenas: {
    id: "resenas", nombre: "Reseñas", ejemplo: "Lo que opinan los clientes de su servicio.", ruta: "/clientes/resenas", ir: ['a[href="/clientes/resenas"]', 'a[href="/clientes"]'],
    pasos: [
      { sel: ".eq-rres", modo: "leer", t: "Tu calificación", x: "El promedio de estrellas y cuántas reseñas llevas.", h: "Toca Siguiente" },
      { sel: ".eq-res", modo: "leer", opcional: true, alt: { sel: ".eq-relleno, .eq-vacio", t: "Aquí llegan las reseñas", x: "Todavía no hay reseñas. Al cobrar, comparte la encuesta con el cliente y su opinión aparecerá aquí." }, t: "Lo que dijeron", x: "Cada reseña con su comentario. Al cobrar, comparte la encuesta para que te califiquen.", h: "Toca Siguiente" },
    ],
  },
  analitica: {
    id: "analitica", nombre: "Analítica", ejemplo: "Cuánto se vendió, cuánto se gastó y cuánto quedó.", ruta: "/analitica", ir: ['a[href="/analitica"]'],
    pasos: [
      { sel: ".rs-card", modo: "leer", t: "Cómo va el negocio", x: "Las ventas del mes contra el mes pasado, día por día.", h: "Toca Siguiente" },
      { sel: '.rs-card|Resultado financiero', modo: "leer", opcional: true, t: "Lo que de verdad quedó", x: "Ingresos menos gastos y pagos al equipo. Es la utilidad real.", h: "Toca Siguiente" },
      { sel: 'a[href="/analitica/finanzas"]', modo: "leer", opcional: true, t: "Finanzas", x: "Ahí registras los gastos del negocio, como la renta, la luz o el internet.", h: "Toca Siguiente" },
    ],
  },
  equipo: {
    id: "equipo", nombre: "Equipo", ejemplo: "Cuánto le toca a cada quien y cuándo se paga.", ruta: "/equipo", ir: ['a[href="/equipo"]', 'a[href="/analitica"]'],
    pasos: [
      { sel: ".eq2-fila, .eqc-fila", modo: "leer", alt: { sel: "main .glass", t: "Aquí verás a tu equipo", x: "Cuando des de alta a quienes atienden, aquí verás lo que vende cada quien y su comisión." }, t: "Cada persona del equipo", x: "Lo que lleva vendido, su comisión y cuándo le toca cobrar. Tócala para ver todo su detalle.", h: "Toca Siguiente" },
    ],
  },
  ajustes: {
    id: "ajustes", nombre: "Ajustes", ejemplo: "Precios, horarios y reglas del negocio.", ruta: "/ajustes", ir: ['a[href="/ajustes"]', "button.menu-b"],
    pasos: [
      { sel: 'a[href="/ajustes/servicios"]', modo: "leer", opcional: true, t: "Servicios y precios", x: "Aquí cambias precios, duraciones y promociones.", h: "Toca Siguiente" },
      { sel: 'a[href="/ajustes/cobro"]', modo: "leer", opcional: true, t: "Configuración del negocio", x: "Formas de pago, caja, metas y egresos.", h: "Toca Siguiente" },
      { sel: 'a[href="/ajustes/citas"]', modo: "leer", opcional: true, t: "Citas y agenda", x: "Horarios, días de descanso y reglas para reservar en línea.", h: "Toca Siguiente" },
    ],
  },
  libreta: {
    id: "libreta", nombre: "Libreta", ejemplo: "El resumen para el contador.", ruta: "/libreta", ir: ['a[href="/libreta"]'],
    pasos: [
      { sel: "main section, main .glass", modo: "leer", t: "Tu libreta", x: "Ingresos, egresos y utilidad del periodo, listos para revisar o descargar.", h: "Toca Siguiente" },
      { sel: "button|Por barbero", modo: "leer", opcional: true, t: "Por mes, año o persona", x: "Cambia la vista para ver el año completo o lo que generó cada barbero.", h: "Toca Siguiente" },
    ],
  },
};
