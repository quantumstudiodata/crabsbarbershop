// Metas: la que asigna el propietario o, si no hay, una calculada con lo que se ha vendido.
// Fórmula: promedio de los periodos anteriores con ventas, más 10%, redondeado a la centena.
// Sin suficiente historia (menos de dos periodos), la meta es de $4,000.

export const META_INICIAL = 400000;

const redondear = (c: number) => Math.ceil(c / 10000) * 10000;

export type Meta = { monto: number; origen: "asignada" | "calculada" | "inicial" };

/** periodos: lo vendido en cada periodo anterior completo (semanas o días iguales). */
export function calcularMeta(asignada: number, periodos: number[]): Meta {
  if (asignada > 0) return { monto: asignada, origen: "asignada" };
  const conVentas = periodos.filter((v) => v > 0);
  if (conVentas.length < 2) return { monto: META_INICIAL, origen: "inicial" };
  const promedio = conVentas.reduce((a, v) => a + v, 0) / conVentas.length;
  return { monto: redondear(promedio * 1.1), origen: "calculada" };
}

export function explicarMeta(m: Meta, periodo: "semana" | "día"): string {
  if (m.origen === "asignada") return `La asignó el propietario.`;
  if (m.origen === "inicial") return `Es la meta de arranque. Cuando haya al menos dos ${periodo === "semana" ? "semanas" : "días iguales"} con ventas, se calcula sola.`;
  return `Se calcula sola: el promedio de ${periodo === "semana" ? "las últimas semanas" : "los mismos días de las últimas semanas"}, más 10%.`;
}
