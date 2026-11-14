"use client";

import { useEffect, useRef } from "react";

/** En Cobro la barra de arriba se esconde. Aparece al acercar el cursor a la orilla, al tocarla o, en el teléfono, al deslizar hacia arriba. */
export function ModoFoco() {
  useEffect(() => {
    document.body.classList.add("foco");
    // En el teléfono: al deslizar hacia arriba aparece el menú; al bajar se esconde.
    let ultimo = window.scrollY;
    const alDesplazar = () => {
      if (!window.matchMedia("(max-width: 760px)").matches) return;
      const b = document.querySelector<HTMLElement>(".barra");
      const y = window.scrollY;
      if (y < 8 || y < ultimo - 4) b?.classList.add("ver");
      else if (y > ultimo + 4) b?.classList.remove("ver");
      ultimo = y;
    };
    // Al abrir, en el teléfono el menú se ve: la página empieza arriba.
    if (window.matchMedia("(max-width: 760px)").matches) document.querySelector<HTMLElement>(".barra")?.classList.add("ver");
    // En tablets (pantalla táctil sin cursor) el menú queda siempre visible: no hay cursor para hacerlo aparecer.
    else if (window.matchMedia("(hover: none)").matches) document.querySelector<HTMLElement>(".barra")?.classList.add("ver");
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => { document.body.classList.remove("foco"); window.removeEventListener("scroll", alDesplazar); };
  }, []);
  const barra = () => document.querySelector<HTMLElement>(".barra");
  const entro = useRef(0);
  const mostrar = () => {
    const b = barra();
    if (!b) return;
    entro.current = Date.now();
    b.classList.add("ver");
    const ocultar = () => { b.classList.remove("ver"); b.removeEventListener("mouseleave", ocultar); };
    b.addEventListener("mouseleave", ocultar);
  };
  return (
    <div className="foco-zona" onMouseEnter={mostrar} onClick={() => { if (Date.now() - entro.current > 400) barra()?.classList.toggle("ver"); }} aria-hidden="true" />
  );
}
