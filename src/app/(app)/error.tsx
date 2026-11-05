"use client";

import { useEffect, useState } from "react";

/** Si algo falla al guardar. En el modo de visualización explica por qué no se guardó. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const [vista, setVista] = useState(false);
  useEffect(() => setVista(document.cookie.includes("crabs_vista=")), []);
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
