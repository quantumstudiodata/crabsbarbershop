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

// Meta mensual del negocio: lo que el negocio quiere que le quede al mes. Con eso se calcula
// cuánto debe cobrar cada barbero al día, según cómo se le paga:
// - Por comisión, al negocio le queda (100% - comisión) de cada cobro: hay que cobrar más para cubrir su parte.
// - Con sueldo, al negocio le queda todo el cobro, pero el sueldo se suma a lo que hay que cubrir.
// - Con renta de silla, lo que cobra es suyo: su renta se resta de lo que hay que cubrir y no lleva meta.
// También se suman los egresos de un mes normal (promedio de los últimos meses).

export type BarberoMeta = {
  id: string; nombre: string;
  tipo: "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto" | null;
  porcentaje: number; montoFijo: number; mensual: number;
  /** Qué parte de lo vendido le toca (0 a 1), para repartir la meta como se reparte el trabajo. */
  peso: number; ticket: number;
};
export type MetaDiaria = { id: string; nombre: string; diaria: number; mensual: number; parteNegocio: number; aplica: boolean };

export function metaDelNegocio(metaMensual: number, egresosMes: number, barberos: BarberoMeta[], diasHabiles: number) {
  const sueldos = barberos.reduce((a, b) => a + (b.tipo === "sueldo" || b.tipo === "mixto" ? b.mensual : 0), 0);
  const rentas = barberos.reduce((a, b) => a + (b.tipo === "renta" ? b.mensual : 0), 0);
  const cubrir = Math.max(0, metaMensual + egresosMes + sueldos - rentas);
  const conMeta = barberos.filter((b) => b.tipo !== "renta");
  const pesoTotal = conMeta.reduce((a, b) => a + b.peso, 0);
  const parte = (b: BarberoMeta) => {
    if (b.tipo === "porcentaje" || b.tipo === "mixto") return Math.max(0.05, 1 - b.porcentaje / 10000);
    if (b.tipo === "fijo") return b.ticket > 0 ? Math.max(0.05, 1 - b.montoFijo / b.ticket) : 0.5;
    return 1;
  };
  const dias = Math.max(1, diasHabiles);
  const porBarbero: MetaDiaria[] = barberos.map((b) => {
    if (b.tipo === "renta") return { id: b.id, nombre: b.nombre, diaria: 0, mensual: 0, parteNegocio: 0, aplica: false };
    const peso = pesoTotal > 0 ? b.peso / pesoTotal : 1 / Math.max(1, conMeta.length);
    const r = parte(b);
    const mensual = redondear((cubrir * peso) / r);
    return { id: b.id, nombre: b.nombre, mensual, diaria: redondear(mensual / dias), parteNegocio: Math.round(r * 100), aplica: true };
  });
  return { cubrir, sueldos, rentas, egresos: egresosMes, porBarbero, diaria: porBarbero.reduce((a, b) => a + b.diaria, 0) };
}

/** Días de trabajo del mes (lunes a sábado). */
export function diasHabilesDelMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let dias = 0;
  for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) dias++;
  return dias;
}
