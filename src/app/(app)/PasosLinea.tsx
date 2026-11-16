"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "@/components/Icono";
import { OcultarPasos } from "./OcultarPasos";
import type { Paso } from "./PrimerosPasos";

/**
 * "Tu barbería está lista al 57%": una línea discreta bajo el saludo. Al tocarla se abre la lista
 * en una ventana (desde abajo en el teléfono, al centro en escritorio). Se cierra con la X o con Escape.
 */
export function PasosLinea({ pasos, titular }: { pasos: Paso[]; titular: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierta(false); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta]);
  const hechos = pasos.filter((p) => p.hecho).length;
  const pct = Math.round((hechos / pasos.length) * 100);
  const sig = pasos.find((p) => !p.hecho);
  const texto = titular ? <>Tu barbería está lista al <b>{pct}%</b></> : <>Tus primeros pasos, <b>{hechos} de {pasos.length}</b></>;
  return (
    <>
      <button type="button" className="pl-chip" onClick={() => setAbierta(true)} aria-haspopup="dialog">
        <span className="pl-anillo" style={{ "--p": `${pct}%` } as React.CSSProperties} aria-hidden="true"><i /></span>
        <span>{texto}</span>
        <b className="pl-seguir">Continuar<Icono n="derecha" /></b>
      </button>
      {abierta && montado && createPortal(
        <div className="pl-capa">
          <div className="pl-hoja" role="dialog" aria-modal="true" aria-labelledby="pl-t">
            <div className="pl-cab">
              <div><span className="lab">Primeros pasos</span><h2 id="pl-t" className="titulo">{titular ? "Tu barbería" : "Para empezar"}, {hechos} de {pasos.length} listos</h2></div>
              <button type="button" className="icb cerrar-x" onClick={() => setAbierta(false)} aria-label="Cerrar"><Icono n="cerrar" /></button>
            </div>
            <i className="pp-barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></i>
            <ol className="pp-l pl-l">
              {pasos.map((p) => (
                <li key={p.id} className={p.hecho ? "hecho" : p === sig ? "sig" : ""}>
                  <span className="pp-i" aria-hidden="true">{p.hecho ? <Icono n="palomita" /> : null}</span>
                  <span className="pp-t"><b>{p.texto}</b>{!p.hecho && <small>{p.detalle}</small>}</span>
                  {!p.hecho && <Link className={`pnd-b ${p === sig ? "" : "sec"}`} href={p.href} onClick={() => setAbierta(false)}>{p === sig ? "Empezar" : "Ir"}</Link>}
                </li>
              ))}
            </ol>
            <div className="pl-pie"><OcultarPasos /><small className="muted">Cada paso se marca solo al hacerlo.</small></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
