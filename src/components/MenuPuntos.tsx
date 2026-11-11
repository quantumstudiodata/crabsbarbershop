"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

/**
 * Si el menú abierto quedaría tapado por la barra de abajo (o el borde de la pantalla), se abre hacia arriba.
 */
export function useHaciaArriba(abierto: boolean) {
  const menu = useRef<HTMLDivElement>(null);
  const [arriba, setArriba] = useState(false);
  useLayoutEffect(() => {
    if (!abierto) { setArriba(false); return; }
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    const reservado = window.matchMedia("(max-width: 760px)").matches ? 112 : 16;
    setArriba(r.bottom > window.innerHeight - reservado && r.top - r.height > 70);
  }, [abierto]);
  return { menu, arriba };
}

export type ItemMenu = { texto: string; icono: string; peligro?: boolean; hacer: () => void };

/** Botón de tres puntos con un menú flotante: las acciones aparecen solo cuando se piden. */
export function MenuPuntos({ etiqueta, items }: { etiqueta: string; items: ItemMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const { menu, arriba } = useHaciaArriba(abierto);
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
        <div ref={menu} className={`menu acciones-m ${arriba ? "arriba" : ""}`} role="menu">
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
