"use client";

import { useState } from "react";
import { Icono } from "@/components/Icono";

/** Descarga el paquete y muestra una barra de luz mientras se prepara. */
export function Descargar({ url, nombre }: { url: string; nombre: string }) {
  const [estado, setEstado] = useState<"listo" | "preparando" | "error">("listo");
  const bajar = async () => {
    setEstado("preparando");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };
  return (
    <div className="pila-chica" style={{ width: "100%" }}>
      <button type="button" className="bt grande" onClick={bajar} disabled={estado === "preparando"}>
        {estado === "preparando" ? "Preparando…" : "Descargar todo en Excel"}
        <span className="fl" aria-hidden="true"><Icono n="descargar" /></span>
      </button>
      {estado === "preparando" && <><div className="progreso"><i /></div><span className="ctx" style={{ marginTop: 0 }}>Preparando los archivos…</span></>}
      {estado === "error" && <span className="ctx" style={{ marginTop: 0, color: "var(--danger)" }}>No se pudo descargar. Intenta otra vez.</span>}
    </div>
  );
}
