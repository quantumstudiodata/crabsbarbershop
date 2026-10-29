// Series para las gráficas de Inicio: hoy por hora o la semana por día, contra la semana pasada.

import { horaLocal, sumarDias } from "./fechas";

export type Movimiento = { creadoEn: Date; fecha: string; monto: number };
export type Serie = { actual: (number | null)[]; previo: number[]; etiquetas: string[]; cada: number };

const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

/** Acumulado por hora de un día contra el mismo día de la semana anterior. Si el día es hoy, se corta en la hora actual. */
export function serieHoy(movs: Movimiento[], hoy: string, zona: string, esHoy = true): Serie & { enCurso?: number } {
  const pasado = sumarDias(hoy, -7);
  const ahora = esHoy ? horaLocal(new Date(), zona) : 99;
  const horas = movs.filter((m) => m.fecha === hoy || m.fecha === pasado).map((m) => horaLocal(m.creadoEn, zona));
  const desde = Math.min(9, ...horas), hasta = Math.max(21, ...horas);
  const n = hasta - desde + 1;
  const acum = (fecha: string, tope: number) => {
    let a = 0;
    return Array.from({ length: n }, (_, i) => {
      const h = desde + i;
      a += movs.filter((m) => m.fecha === fecha && horaLocal(m.creadoEn, zona) === h).reduce((x, m) => x + m.monto, 0);
      return h <= tope ? a : null;
    });
  };
  return {
    actual: acum(hoy, ahora),
    previo: acum(pasado, hasta).map((v) => v ?? 0),
    etiquetas: Array.from({ length: n }, (_, i) => `${desde + i}:00`),
    cada: 3,
    enCurso: esHoy && ahora >= desde && ahora <= hasta ? ahora - desde : undefined,
  };
}

/** Ventas por día de esta semana contra la semana pasada. */
export function serieSemana(movs: Movimiento[], lunes: string, hoy: string): Serie {
  const total = (f: string) => movs.filter((m) => m.fecha === f).reduce((x, m) => x + m.monto, 0);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  return {
    actual: dias.map((d) => (d <= hoy ? total(d) : null)),
    previo: dias.map((d) => total(sumarDias(d, -7))),
    etiquetas: DIAS,
    cada: 1,
  };
}
