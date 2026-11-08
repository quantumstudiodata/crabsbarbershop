import { describe, expect, it } from "vitest";
import { ocultarSensibles } from "../src/lib/sensibles";

describe("ocultarSensibles", () => {
  it("quita contraseñas, tokens, conexiones, correos y teléfonos", () => {
    const r = ocultarSensibles("postgres://u:p@h/db password=abc token: xyz ana@x.com 833 123 4567 Bearer eyJabc.def");
    expect(r).not.toMatch(/abc|xyz|ana@x\.com|833 123|u:p@|eyJ/);
  });
  it("oculta los valores de una consulta que falló", () => {
    expect(ocultarSensibles("Failed query: select 1 params: KRUIZ,secreto")).toBe("Failed query: select 1 params: [ocultos]");
  });
  it("conserva fechas y mensajes normales", () => {
    expect(ocultarSensibles("No se pudo guardar el 2026-11-08 en /cobrar")).toBe("No se pudo guardar el 2026-11-08 en /cobrar");
  });
});
