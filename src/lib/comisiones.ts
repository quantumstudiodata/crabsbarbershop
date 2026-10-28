// Reglas de pago de cada barbera. La regla vigente se copia en cada servicio cobrado.

export type TipoRegla = "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto";

export type Regla = {
  id?: string;
  barberoId: string;
  servicioId: string | null;
  tipo: TipoRegla;
  porcentaje: number; // puntos base: 40% = 4000
  montoFijo: number;
  montoSemanal: number;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
};

export type ReglaCopia = Pick<Regla, "tipo" | "porcentaje" | "montoFijo" | "montoSemanal">;

/** Elige la regla que aplica: primero la del servicio exacto, luego la general de la barbera. */
export function elegirRegla(reglas: Regla[], barberoId: string, servicioId: string | null, cuando: Date): Regla | null {
  const vigentes = reglas.filter(
    (r) => r.barberoId === barberoId && r.vigenteDesde <= cuando && (!r.vigenteHasta || r.vigenteHasta > cuando),
  );
  const ordenar = (a: Regla, b: Regla) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime();
  const exacta = vigentes.filter((r) => servicioId && r.servicioId === servicioId).sort(ordenar)[0];
  if (exacta) return exacta;
  return vigentes.filter((r) => r.servicioId === null).sort(ordenar)[0] ?? null;
}

/**
 * Comisión de un servicio. Se calcula sobre lo cobrado después del descuento.
 * Nunca incluye la propina. Con renta de silla, lo cobrado es de la barbera (ella paga renta aparte).
 * El sueldo fijo no genera comisión por servicio.
 */
export function comisionDeServicio(regla: ReglaCopia | null, precioCobrado: number): number {
  if (!regla || precioCobrado <= 0) return 0;
  switch (regla.tipo) {
    case "porcentaje":
    case "mixto":
      return Math.round((precioCobrado * regla.porcentaje) / 10000);
    case "fijo":
      return Math.min(regla.montoFijo, precioCobrado);
    case "renta":
      return precioCobrado;
    default:
      return 0;
  }
}

export type ResumenSemana = {
  servicios: number;
  vendido: number;
  propinas: number;
  comisiones: number;
  sueldo: number;
  leToca: number;
  pagado: number;
  pendiente: number;
  renta: number;
  rentaPagada: number;
  rentaPendiente: number;
};

/** Junta lo de una barbera en una semana. Las cifras de entrada ya excluyen ventas canceladas. */
export function resumenSemana(input: {
  reglaGeneral: ReglaCopia | null;
  servicios: number;
  vendido: number;
  propinas: number;
  comisiones: number;
  pagado: number;
  rentaPagada: number;
}): ResumenSemana {
  const r = input.reglaGeneral;
  const sueldo = r && (r.tipo === "sueldo" || r.tipo === "mixto") ? r.montoSemanal : 0;
  const renta = r && r.tipo === "renta" ? r.montoSemanal : 0;
  const leToca = input.comisiones + sueldo;
  return {
    servicios: input.servicios,
    vendido: input.vendido,
    propinas: input.propinas,
    comisiones: input.comisiones,
    sueldo,
    leToca,
    pagado: input.pagado,
    pendiente: Math.max(leToca - input.pagado, 0),
    renta,
    rentaPagada: input.rentaPagada,
    rentaPendiente: Math.max(renta - input.rentaPagada, 0),
  };
}

export function describirRegla(r: ReglaCopia | null, formato: (c: number) => string): string {
  if (!r) return "Sin forma de pago configurada";
  const pct = `${r.porcentaje / 100}%`;
  switch (r.tipo) {
    case "porcentaje":
      return `${pct} de cada servicio`;
    case "fijo":
      return `${formato(r.montoFijo)} por servicio`;
    case "renta":
      return `Renta de silla, ${formato(r.montoSemanal)} a la semana`;
    case "sueldo":
      return `Sueldo de ${formato(r.montoSemanal)} a la semana`;
    case "mixto":
      return `Sueldo de ${formato(r.montoSemanal)} a la semana más ${pct}`;
  }
}
