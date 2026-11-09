// Remuneración de quienes no son barberos. Los barberos conservan su forma de pago (reglas de comisión).

export type Modalidad = "sueldo" | "hora" | "dia" | "comision" | "mixto" | "trabajo";
export type Remuneracion = { modalidad: Modalidad; monto: number; periodo: string; porcentaje: number; horasSemana: number; descripcion: string };

export const MODALIDADES: { m: Modalidad; titulo: string; detalle: string }[] = [
  { m: "sueldo", titulo: "Sueldo fijo", detalle: "Una cantidad por semana, quincena o mes" },
  { m: "hora", titulo: "Pago por hora", detalle: "Una tarifa por cada hora trabajada" },
  { m: "dia", titulo: "Pago por día", detalle: "Una tarifa por cada día trabajado" },
  { m: "comision", titulo: "Porcentaje por comisión", detalle: "Un porcentaje de los servicios que realiza" },
  { m: "mixto", titulo: "Sueldo más porcentaje", detalle: "Un sueldo base y un porcentaje de sus servicios" },
  { m: "trabajo", titulo: "Pago fijo por servicio o trabajo", detalle: "Una cantidad por cada trabajo realizado" },
];

const PERIODO: Record<string, string> = { semana: "a la semana", quincena: "a la quincena", mes: "al mes" };
const AL_MES: Record<string, number> = { semana: 52 / 12, quincena: 2, mes: 1 };

/** En palabras, para la ficha y el historial. */
export function describirRemuneracion(r: Remuneracion, dinero: (c: number) => string): string {
  const pct = `${r.porcentaje / 100}%`;
  switch (r.modalidad) {
    case "sueldo": return `Sueldo fijo de ${dinero(r.monto)} ${PERIODO[r.periodo] ?? ""}`.trim();
    case "hora": return `${dinero(r.monto)} por hora${r.horasSemana ? `, unas ${r.horasSemana} horas a la semana` : ""}`;
    case "dia": return `${dinero(r.monto)} por día trabajado`;
    case "comision": return `${pct} de los servicios que realiza`;
    case "mixto": return `${dinero(r.monto)} ${PERIODO[r.periodo] ?? ""} más ${pct} de sus servicios`;
    case "trabajo": return `${dinero(r.monto)} por cada ${r.descripcion ? r.descripcion.toLowerCase() : "trabajo realizado"}`;
  }
}

/**
 * Lo que cuesta al mes de forma segura, para la meta. Lo que depende de las ventas (porcentaje) o de trabajos
 * sueltos no se puede saber de antemano y no se suma. El pago por hora solo cuenta si se indicaron horas.
 */
export function costoMensual(r: Remuneracion, diasHabiles: number): number {
  if (r.modalidad === "sueldo" || r.modalidad === "mixto") return Math.round(r.monto * (AL_MES[r.periodo] ?? 1));
  if (r.modalidad === "dia") return r.monto * diasHabiles;
  if (r.modalidad === "hora") return Math.round(r.monto * r.horasSemana * (52 / 12));
  return 0;
}
