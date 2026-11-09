// Reparto de un monto en centavos, sin base de datos (sirve en el navegador y en el servidor).

/** Reparte un monto: en partes iguales o en proporción a un peso. Los centavos que sobran van a los primeros. */
export function repartir(monto: number, pesos: number[]): number[] {
  const total = pesos.reduce((a, x) => a + x, 0);
  if (!pesos.length || total <= 0) return pesos.map(() => 0);
  const base = pesos.map((p) => Math.floor((monto * p) / total));
  let resto = monto - base.reduce((a, x) => a + x, 0);
  for (let i = 0; resto > 0; i = (i + 1) % base.length) { if (pesos[i] > 0) { base[i]++; resto--; } }
  return base;
}
