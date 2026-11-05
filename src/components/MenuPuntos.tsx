"use client";

import { useEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

export type ItemMenu = { texto: string; icono: string; peligro?: boolean; hacer: () => void };

/** Botón de tres puntos con un menú flotante: las acciones aparecen solo cuando se piden. */
export function MenuPuntos({ etiqueta, items }: { etiqueta: string; items: ItemMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  return (
    <div ref={caja} className="menu-p" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icb puntos" aria-label={etiqueta} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>⋯</button>
      {abierto && (
        <div className="menu acciones-m" role="menu">
          {items.map((x) => (
            <button key={x.texto} type="button" role="menuitem" className={`it ${x.peligro ? "salir" : ""}`} onClick={() => { setAbierto(false); x.hacer(); }}>
              <Icono n={x.icono as never} />{x.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
