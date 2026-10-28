import { diasEntre, esFechaValida, fechaCorta, finDeMes, inicioDeMes, lunesDe, sumarDias } from "./fechas";

export type Periodo = { tipo: "dia" | "semana" | "mes" | "rango"; desde: string; hasta: string; nombre: string; etiqueta: string };

/** Lee el periodo de la dirección: ?periodo=semana|mes, o ?desde=&hasta= elegidos en el calendario. */
export function leerPeriodo(q: { periodo?: string; desde?: string; hasta?: string }, hoy: string, porDefecto: "dia" | "semana" = "semana"): Periodo {
  if (esFechaValida(q.desde) && esFechaValida(q.hasta) && q.desde <= q.hasta && diasEntre(q.desde, q.hasta) <= 400) {
    const unDia = q.desde === q.hasta;
    return { tipo: unDia ? "dia" : "rango", desde: q.desde, hasta: q.hasta, nombre: unDia ? (q.desde === hoy ? "Hoy" : `El ${fechaCorta(q.desde)}`) : "En esas fechas", etiqueta: unDia ? fechaCorta(q.desde) : `Del ${fechaCorta(q.desde)} al ${fechaCorta(q.hasta)}` };
  }
  const tipo = q.periodo === "mes" ? "mes" : q.periodo === "semana" ? "semana" : q.periodo === "dia" ? "dia" : porDefecto;
  if (tipo === "mes") return { tipo, desde: inicioDeMes(hoy), hasta: finDeMes(hoy), nombre: "Este mes", etiqueta: `Del ${fechaCorta(inicioDeMes(hoy))} al ${fechaCorta(finDeMes(hoy))}` };
  if (tipo === "dia") return { tipo, desde: hoy, hasta: hoy, nombre: "Hoy", etiqueta: fechaCorta(hoy) };
  const l = lunesDe(hoy);
  return { tipo, desde: l, hasta: sumarDias(l, 6), nombre: "Esta semana", etiqueta: `Del ${fechaCorta(l)} al ${fechaCorta(sumarDias(l, 6))}` };
}
