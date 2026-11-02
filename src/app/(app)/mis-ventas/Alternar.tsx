"use client";

import { useState } from "react";

/** Un encabezado con un selector pequeño que cambia entre dos vistas del mismo dato. */
export function Alternar({ titulo, opciones, vistas }: { titulo: string; opciones: [string, string]; vistas: [React.ReactNode, React.ReactNode] }) {
  const [i, setI] = useState(0);
  return (
    <>
      <div className="entre cab-mv">
        <span className="lab">{titulo}</span>
        <div className="seg chico" role="tablist" aria-label={titulo}>
          {opciones.map((o, k) => <button key={o} type="button" role="tab" aria-selected={i === k} className={i === k ? "on" : ""} onClick={() => setI(k)}>{o}</button>)}
        </div>
      </div>
      <div key={i} className="aparece-mv">{vistas[i]}</div>
    </>
  );
}
