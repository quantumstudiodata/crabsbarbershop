"use client";

import { useEffect, useState } from "react";

/** Si algo falla al guardar. En el modo de visualización explica por qué no se guardó. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [vista, setVista] = useState(false);
  useEffect(() => {
    const v = document.cookie.includes("crabs_vista=");
    setVista(v);
    // Se registra para Soporte; los bloqueos de la vista previa no son fallos.
    if (!v) fetch("/api/errores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: error.message || "Error sin mensaje", digest: error.digest, ruta: location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <section className="glass panel" style={{ justifyItems: "start", gap: 10 }}>
      <span className="lab">{vista ? "Modo de visualización" : "Algo no salió bien"}</span>
      <h1 className="titulo">{vista ? "En la vista previa no se guardan cambios" : "No se pudo completar la acción"}</h1>
      <p className="muted">{vista ? "Sal del modo de visualización para trabajar con tu cuenta." : "Intenta de nuevo. Si vuelve a pasar, avisa a soporte."}</p>
      <div className="fila" style={{ gap: 8 }}>
        <button type="button" className="bt sec solo" onClick={reset}>Volver a la página</button>
        {vista && <a className="bt" href="/api/vista?salir=1">Salir del modo</a>}
      </div>
    </section>
  );
}
