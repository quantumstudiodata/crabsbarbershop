// Fechas como texto "AAAA-MM-DD" en la zona horaria de la barbería.
// Tampico usa America/Monterrey (sin horario de verano desde 2022).

export const ZONA = "America/Monterrey";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function partes(d: Date, zona: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") === "24" ? "00" : get("hour"), min: get("minute") };
}

export function fechaLocal(d: Date = new Date(), zona = ZONA): string {
  const p = partes(d, zona);
  return `${p.y}-${p.m}-${p.d}`;
}

export function horaLocal(d: Date, zona = ZONA): number {
  return Number(partes(d, zona).h);
}

export function horaCorta(d: Date, zona = ZONA): string {
  const p = partes(d, zona);
  return `${p.h}:${p.min}`;
}

function aUTC(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function deUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, n: number): string {
  const d = aUTC(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return deUTC(d);
}

/** 0 = domingo … 6 = sábado */
export function diaDeSemana(fecha: string): number {
  return aUTC(fecha).getUTCDay();
}

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  const dia = diaDeSemana(fecha);
  return sumarDias(fecha, dia === 0 ? -6 : 1 - dia);
}

export function inicioDeMes(fecha: string): string {
  return fecha.slice(0, 8) + "01";
}

export function finDeMes(fecha: string): string {
  const d = aUTC(inicioDeMes(fecha));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return deUTC(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86400000);
}

export function fechaLarga(fecha: string): string {
  const d = aUTC(fecha);
  const txt = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function fechaCorta(fecha: string): string {
  const d = aUTC(fecha);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function nombreDia(dia: number): string {
  return DIAS[dia];
}

export function esFechaValida(t: string | null | undefined): t is string {
  return !!t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(aUTC(t).getTime()) && deUTC(aUTC(t)) === t;
}
