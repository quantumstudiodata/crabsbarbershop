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
