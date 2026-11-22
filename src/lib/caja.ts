// Cálculo del efectivo que debe haber en la caja. Sin acceso a base de datos: fácil de probar.

export type MovimientosTurno = {
  fondoInicial: number;
  cobrosEfectivo: number;
  propinasEfectivo: number;
  entradas: number;
  retiros: number;
  gastosDeCaja: number;
  devolucionesEfectivo: number;
};

/** fondo + cobros en efectivo + propinas en efectivo + entradas − retiros − gastos de caja − devoluciones en efectivo */
export function efectivoEsperado(m: MovimientosTurno): number {
  return (
    m.fondoInicial + m.cobrosEfectivo + m.propinasEfectivo + m.entradas - m.retiros - m.gastosDeCaja - m.devolucionesEfectivo
  );
}

export type ResultadoConteo =
  | { estado: "cuadro"; diferencia: 0; texto: string }
  | { estado: "sobra" | "falta"; diferencia: number; texto: string };

/** diferencia = lo que se contó − lo que debe haber */
export function compararConteo(esperado: number, contado: number, formato: (c: number) => string): ResultadoConteo {
  const diferencia = contado - esperado;
  if (diferencia === 0) return { estado: "cuadro", diferencia: 0, texto: "La caja cuadró exacto." };
  if (diferencia > 0) return { estado: "sobra", diferencia, texto: `Sobran ${formato(diferencia)}.` };
  return { estado: "falta", diferencia, texto: `Faltan ${formato(-diferencia)}.` };
}

export function requiereExplicacion(diferencia: number, limite: number): boolean {
  return Math.abs(diferencia) > limite;
}

/** Una salida de caja que en realidad es un pago a alguien del equipo (a mano desde Equipo, o comisiones entregadas en el corte). */
/** El dinero que regresó a la caja al anular un pago al equipo: se descuenta de los pagos, no cuenta como dinero que alguien puso. */
export const esPagoAnulado = (concepto: string) => concepto.startsWith("Pago anulado a ");
/** Propinas que se entregaron de la caja en el corte: son de quien atendió, no del negocio. */
export const CONCEPTO_PROPINA = "Propinas para";
export const esPropinaEntregada = (concepto: string) => concepto.startsWith(`${CONCEPTO_PROPINA} `);
export const esPagoEquipo = (concepto: string) => /^Pago (de comisiones )?a /.test(concepto);

/** Lo del negocio que se acumula para la dueña en el corte: sale de la caja y se guarda aparte hasta que se le deposita. */
export const CONCEPTO_ACUMULADO = "Pendiente de depositar a la dueña";
/** También los nombres que usaba el corte anterior, por si queda alguno sin pasar. */
export const esAcumulado = (concepto: string) => concepto === CONCEPTO_ACUMULADO || concepto === "Acumulado para la dueña" || concepto === "Depósito a la dueña" || concepto === "Resguardado para depositar";
/** Efectivo que se llevó Titular (o alguien de su parte) durante el día: cuenta como lo del negocio. */
export const CONCEPTO_DUENA = "La dueña se llevó efectivo";
export const esLlevoDuena = (concepto: string) => concepto.startsWith(CONCEPTO_DUENA);
/** Cualquier salida que es la parte del negocio (no un gasto ni un pago al equipo). */
export const esParteNegocio = (concepto: string) => esAcumulado(concepto) || esLlevoDuena(concepto);

/** Minutos que tiene alguien para anular su propio cobro si se equivocó. */
export const MINUTOS_CORRECCION = 10;

/**
 * El efectivo de la caja que se puede usar (gastos, pagos, lo que se lleva Titular): lo que hay sin las propinas en efectivo,
 * que son de quien hizo el servicio y no se tocan. Las propinas que ya se entregaron durante el turno ya salieron.
 */
export function efectivoUsable(d: { esperado: number; m: MovimientosTurno; movimientos: { tipo: string; monto: number; concepto: string }[] }) {
  const entregadas = d.movimientos.filter((x) => x.tipo === "retiro" && esPropinaEntregada(x.concepto)).reduce((a, x) => a + x.monto, 0);
  return Math.max(0, d.esperado - Math.max(0, d.m.propinasEfectivo - entregadas));
}
