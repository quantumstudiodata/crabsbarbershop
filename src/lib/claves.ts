// Contraseñas temporales: se guardan cifradas 30 minutos para que el propietario pueda volver a verlas.
// Después de ese tiempo, o cuando la persona elige la suya, se borran.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const MINUTOS_CLAVE = 30;

function llave(): Buffer {
  const base = process.env.CLAVES_SECRETO || process.env.DATABASE_URL;
  if (!base) throw new Error("Falta CLAVES_SECRETO o DATABASE_URL.");
  return createHash("sha256").update(`crabs-claves:${base}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64url")).join(".");
}

export function descifrar(guardado: string): string | null {
  try {
    const [iv, tag, datos] = guardado.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", llave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const expiraClave = () => new Date(Date.now() + MINUTOS_CLAVE * 60000);
