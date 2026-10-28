"use client";

import { useEffect } from "react";

/** En Cobro la barra de arriba se esconde. Aparece al acercar el cursor a la orilla o al tocarla. */
export function ModoFoco() {
  useEffect(() => {
    document.body.classList.add("foco");
    return () => document.body.classList.remove("foco");
  }, []);
  const barra = () => document.querySelector<HTMLElement>(".barra");
  const mostrar = () => {
    const b = barra();
    if (!b) return;
    b.classList.add("ver");
    const ocultar = () => { b.classList.remove("ver"); b.removeEventListener("mouseleave", ocultar); };
    b.addEventListener("mouseleave", ocultar);
  };
  return (
    <div className="foco-zona" onMouseEnter={mostrar} onClick={() => barra()?.classList.toggle("ver")} aria-hidden="true" />
  );
}
