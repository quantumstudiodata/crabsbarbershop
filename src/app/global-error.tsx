"use client";

import { useEffect } from "react";

// Errores que pasan cuando se publicó una versión nueva y la pestaña sigue con la anterior: se arreglan recargando.
const DE_VERSION = /Failed to find Server Action|Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Unexpected token '<'/i;

/** Último respaldo: si falla toda la página, en lugar de una pantalla negra se ve esto y se puede recargar. */
export default function ErrorGlobal({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    try {
      if (DE_VERSION.test(error.message) && sessionStorage.getItem("crabs-recarga") !== location.pathname) {
        sessionStorage.setItem("crabs-recarga", location.pathname);
        location.reload();
        return;
      }
    } catch {}
    fetch("/api/errores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: error.message || "Error sin mensaje", digest: error.digest, ruta: location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <html lang="es-MX">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#e4e9ee", color: "#13171c", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 }}>
        <main style={{ maxWidth: 380, textAlign: "center", background: "rgba(255,255,255,.85)", borderRadius: 22, padding: "28px 24px", boxShadow: "0 12px 30px -18px rgba(20,35,50,.5)" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>La página no cargó bien</h1>
          <p style={{ margin: "0 0 18px", color: "#5b6570", fontSize: 14, lineHeight: 1.5 }}>Puede pasar justo después de una actualización. Recarga para abrir la versión más reciente.</p>
          <button type="button" onClick={() => location.reload()} style={{ border: 0, borderRadius: 999, padding: "12px 22px", background: "#13171c", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Recargar</button>
        </main>
      </body>
    </html>
  );
}
