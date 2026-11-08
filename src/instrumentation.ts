import type { Instrumentation } from "next";

/** Cada error del servidor queda registrado para Soporte, con la página y la persona. */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { guardarError } = await import("./lib/errores");
    const e = err as Error & { digest?: string };
    const cookie = Array.isArray(request.headers.cookie) ? request.headers.cookie.join("; ") : request.headers.cookie;
    await guardarError({ origen: "servidor", ruta: request.path, mensaje: `${e.name}: ${e.message}`, digest: e.digest, cookie });
  }
};
