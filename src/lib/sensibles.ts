/**
 * Quita de un mensaje de error lo que no debe quedar a la vista: contraseñas, tokens, cadenas de conexión,
 * correos, teléfonos y los valores que la base de datos repite al fallar una consulta.
 */
export function ocultarSensibles(texto: string): string {
  return texto
    .replace(/(postgres(ql)?|mysql|redis):\/\/[^\s"']+/gi, "$1://[oculto]")
    .replace(/\b(bearer|basic)\s+[\w.~+/=-]+/gi, "$1 [oculto]")
    .replace(/\b(password|passwd|contrase(n|ñ)a|clave|token|secret|secreto|hash|api[_-]?key|authorization|cookie)\b(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1$3[oculto]")
    .replace(/\bparams:\s*[\s\S]*$/i, "params: [ocultos]")
    .replace(/\$2[aby]\$\d{2}\$[./\w]{53}/g, "[oculto]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/(?<![\d-])(\+?\d{1,3}\s?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}(?![\d-])/g, "[número]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[oculto]");
}

/** Título legible de un error técnico: una consulta fallida se resume con la tabla; lo demás, primera línea corta. */
export function resumenError(mensaje: string): string {
  const m = mensaje.replace(/^Error:\s*/, "");
  const q = m.match(/^Failed query:\s*(select|insert into|update|delete from)\b[\s\S]*?(?:from|into|update)?\s*"([a-z_]+)"/i);
  if (q) {
    const tabla = (m.match(/\bfrom\s+"([a-z_]+)"/i) ?? m.match(/\binto\s+"([a-z_]+)"/i) ?? m.match(/^Failed query:\s*update\s+"([a-z_]+)"/i))?.[1] ?? q[2];
    const accion = /^Failed query:\s*select/i.test(m) ? "leer" : /insert/i.test(m.slice(0, 40)) ? "guardar en" : /update/i.test(m.slice(0, 40)) ? "actualizar" : "borrar en";
    return `Falló una consulta al ${accion} la tabla ${tabla.replace(/_/g, " ")}`;
  }
  if (/Loading chunk \d+ failed/i.test(m)) return "No se pudo cargar una parte de la página (versión anterior en caché)";
  const linea = m.split("\n")[0];
  return linea.length > 140 ? `${linea.slice(0, 140)}…` : linea;
}
