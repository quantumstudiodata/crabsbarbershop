"use client";

/** Salida del aviso "No tienes permiso": abre la ayuda en "Pedir algo a quien administra". */
export function PedirPermiso() {
  return (
    <button type="button" className="bt sec chico aviso-bt" onClick={() => window.dispatchEvent(new CustomEvent("crabs:ayuda", { detail: { pedir: "permiso" } }))}>
      Pedir permiso
    </button>
  );
}
