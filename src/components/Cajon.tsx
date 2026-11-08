"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "./Icono";

/** Panel que entra desde la derecha, sin salir de la pantalla. Se cierra con la X, Esc o tocando fuera. */
export function Cajon({ abierto, cerrar, titulo, children, pie }: { abierto: boolean; cerrar: () => void; titulo: React.ReactNode; children: React.ReactNode; pie?: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto, cerrar]);
  if (!montado || !abierto) return null;
  return createPortal(
    <div className="velo-c" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <aside className="cajon-c" role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <div className="entre cajon-cab"><b>{titulo}</b><button type="button" className="icb" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button></div>
        <div className="cajon-cuerpo">{children}</div>
        {pie && <div className="cajon-pie">{pie}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Botón que abre un panel lateral con contenido ya preparado por el servidor. */
export function BotonCajon({ texto, titulo, children, className = "link-c" }: { texto: React.ReactNode; titulo: string; children: React.ReactNode; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAbierto(true)}>{texto}</button>
      <Cajon abierto={abierto} cerrar={() => setAbierto(false)} titulo={titulo}>{children}</Cajon>
    </>
  );
}
