// Usuario y contraseña temporal a partir del nombre completo.
// Ejemplo: "María Paulette Whitaker Nava" → usuario MPWHITAKER, contraseña MPWN + 3 dígitos.

export function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/gi, (m) => (m === "ñ" ? "n" : "N"));
}

function palabras(nombre: string): string[] {
  return sinAcentos(nombre)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !["DE", "DEL", "LA", "LAS", "LOS", "Y"].includes(p));
}

/** Iniciales de los nombres + primer apellido. Con 3 o más palabras, los dos últimos son apellidos. */
export function sugerirUsuario(nombre: string, existentes: Iterable<string> = []): string {
  const ps = palabras(nombre);
  if (ps.length === 0) throw new Error("Escribe el nombre completo.");
  let base: string;
  if (ps.length === 1) base = ps[0];
  else if (ps.length === 2) base = ps[0][0] + ps[1];
  else base = ps.slice(0, -2).map((p) => p[0]).join("") + ps[ps.length - 2];
  base = base.slice(0, 20);
  const usados = new Set([...existentes].map((u) => u.toUpperCase()));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!usados.has(base + i)) return base + i;
  throw new Error("No se pudo generar un usuario libre.");
}

/** Iniciales de todas las palabras + 3 dígitos al azar. Se muestra una sola vez y se cambia al entrar. */
export function contrasenaTemporal(nombre: string, aleatorio: () => number = seguro): string {
  const iniciales = palabras(nombre).map((p) => p[0]).join("").slice(0, 5) || "CR";
  const digitos = String(Math.floor(aleatorio() * 1000)).padStart(3, "0");
  return iniciales + digitos;
}

function seguro(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/** Reglas para la contraseña que elige cada persona. Devuelve el problema o null si está bien. */
export function problemaContrasena(nueva: string, usuario: string): string | null {
  if (nueva.length < 8) return "Usa al menos 8 caracteres.";
  if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) return "Combina letras y números.";
  if (nueva.toUpperCase().includes(usuario.toUpperCase())) return "No uses tu nombre de usuario dentro de la contraseña.";
  return null;
}
