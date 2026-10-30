import { diasEntre, esFechaValida, fechaCorta, finDeMes, lunesDe, sumarDias } from "./fechas";

export type Periodo = { tipo: "dia" | "semana" | "mes" | "anio" | "rango"; desde: string; hasta: string; nombre: string; etiqueta: string };
export type ConsultaPeriodo = { periodo?: string; fecha?: string; mes?: string; anio?: string; desde?: string; hasta?: string };

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mayus = (t: string) => t[0].toUpperCase() + t.slice(1);

export function periodoDia(f: string, hoy: string): Periodo {
  return { tipo: "dia", desde: f, hasta: f, nombre: f === hoy ? "Hoy" : `El ${fechaCorta(f)}`, etiqueta: fechaCorta(f) };
}

export function periodoMes(ym: string, hoy: string): Periodo {
  const desde = `${ym}-01`;
  const nombre = `${mayus(MESES[Number(ym.slice(5, 7)) - 1])} ${ym.slice(0, 4)}`;
  return { tipo: "mes", desde, hasta: finDeMes(desde), nombre: ym === hoy.slice(0, 7) ? "Este mes" : nombre, etiqueta: nombre };
}

export function periodoAnio(y: string, hoy: string): Periodo {
  return { tipo: "anio", desde: `${y}-01-01`, hasta: `${y}-12-31`, nombre: y === hoy.slice(0, 4) ? "Este año" : `Año ${y}`, etiqueta: `Año ${y}` };
}

const mesValido = (t?: string): t is string => !!t && /^\d{4}-(0[1-9]|1[0-2])$/.test(t);
const anioValido = (t?: string): t is string => !!t && /^(20\d\d)$/.test(t);

/**
 * Lee el periodo de la dirección: ?periodo=dia&fecha=, ?periodo=mes&mes=AAAA-MM o ?periodo=anio&anio=AAAA.
 * Sin parámetros usa el periodo por defecto. Las direcciones viejas (?desde=&hasta=, semana) siguen funcionando.
 */
export function leerPeriodo(q: ConsultaPeriodo, hoy: string, porDefecto: "dia" | "semana" | "mes" | "anio" = "dia"): Periodo {
  const tipo = q.periodo ?? (esFechaValida(q.fecha) ? "dia" : mesValido(q.mes) ? "mes" : anioValido(q.anio) ? "anio" : undefined);
  if (!tipo && esFechaValida(q.desde) && esFechaValida(q.hasta) && q.desde <= q.hasta && diasEntre(q.desde, q.hasta) <= 400) {
    if (q.desde === q.hasta) return periodoDia(q.desde, hoy);
    return { tipo: "rango", desde: q.desde, hasta: q.hasta, nombre: "En esas fechas", etiqueta: `Del ${fechaCorta(q.desde)} al ${fechaCorta(q.hasta)}` };
  }
  const t = tipo === "dia" || tipo === "mes" || tipo === "anio" || tipo === "semana" ? tipo : porDefecto;
  if (t === "dia") return periodoDia(esFechaValida(q.fecha) && q.fecha <= hoy ? q.fecha : hoy, hoy);
  if (t === "mes") return periodoMes(mesValido(q.mes) && q.mes <= hoy.slice(0, 7) ? q.mes : hoy.slice(0, 7), hoy);
  if (t === "anio") return periodoAnio(anioValido(q.anio) && q.anio <= hoy.slice(0, 4) ? q.anio : hoy.slice(0, 4), hoy);
  const l = lunesDe(hoy);
  return { tipo: "semana", desde: l, hasta: sumarDias(l, 6), nombre: "Esta semana", etiqueta: `Del ${fechaCorta(l)} al ${fechaCorta(sumarDias(l, 6))}` };
}
