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
