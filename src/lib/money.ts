// El dinero vive en centavos. Estas funciones convierten para mostrar y para leer lo que se escribe.

export function formatoDinero(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const pesos = Math.floor(abs / 100);
  const cent = abs % 100;
  const base = "$" + pesos.toLocaleString("en-US") + (cent ? "." + String(cent).padStart(2, "0") : "");
  return negativo ? "−" + base : base;
}

/** Lee "150", "150.50", "$1,250" o "1250,5" y devuelve centavos. Devuelve null si no es un monto válido. */
export function leerPesos(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let t = String(texto).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (t === "") return null;
  // "1,250" con coma de miles; "12,5" con coma decimal.
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [ent, dec = ""] = t.split(".");
  const valor = Number(ent) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(valor) ? valor : null;
}

export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

/** Cambio relativo entre periodos: (actual − anterior) ÷ anterior. null si no hay con qué comparar. */
export function cambio(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
