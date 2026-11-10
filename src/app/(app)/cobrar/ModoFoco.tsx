"use client";

import { useEffect } from "react";

/**
 * En Cobro el menú de arriba se esconde para dar espacio a la venta.
 * Aparece al deslizar hacia arriba (o al llevar el cursor a la orilla) y se vuelve a esconder al deslizar hacia abajo.
 */
export function ModoFoco() {
  useEffect(() => {
    document.body.classList.add("foco");
    const barra = () => document.querySelector<HTMLElement>(".barra");
    const ver = (si: boolean) => barra()?.classList.toggle("ver", si);
    let ultimo = window.scrollY;
    const alDesplazar = () => {
      const y = window.scrollY;
      if (y < ultimo - 4) ver(true);
      else if (y > ultimo + 4) ver(false);
      ultimo = y;
    };
    // Si la página ya está hasta arriba no hay desplazamiento: se toma el gesto de la rueda o del dedo.
    const rueda = (e: WheelEvent) => { if (e.deltaY < -8) ver(true); else if (e.deltaY > 8) ver(false); };
    let inicioY: number | null = null;
    const toca = (e: TouchEvent) => { inicioY = e.touches[0]?.clientY ?? null; };
    const mueve = (e: TouchEvent) => {
      if (inicioY === null) return;
      const d = (e.touches[0]?.clientY ?? inicioY) - inicioY;
      if (d > 24) { ver(true); inicioY = null; } else if (d < -24) { ver(false); inicioY = null; }
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    window.addEventListener("wheel", rueda, { passive: true });
    window.addEventListener("touchstart", toca, { passive: true });
    window.addEventListener("touchmove", mueve, { passive: true });
    return () => {
      document.body.classList.remove("foco");
      barra()?.classList.remove("ver");
      window.removeEventListener("scroll", alDesplazar);
      window.removeEventListener("wheel", rueda);
      window.removeEventListener("touchstart", toca);
      window.removeEventListener("touchmove", mueve);
    };
  }, []);
  const mostrar = () => {
    const b = document.querySelector<HTMLElement>(".barra");
    if (!b) return;
    b.classList.add("ver");
    const ocultar = () => { b.classList.remove("ver"); b.removeEventListener("mouseleave", ocultar); };
    b.addEventListener("mouseleave", ocultar);
  };
  return <div className="foco-zona" onMouseEnter={mostrar} aria-hidden="true" />;
}
