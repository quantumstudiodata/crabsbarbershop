"use client";

import { useState } from "react";
import { Icono } from "@/components/Icono";

export function CopiarEnlace({ path }: { path: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    const enlace = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); window.setTimeout(() => setCopiado(false), 2200); }
    catch { window.prompt("Copia el enlace de reservas:", enlace); }
  }
  return <button className="bt chico" type="button" onClick={copiar}><Icono n={copiado ? "palomita" : "copiar"} />{copiado ? "Enlace copiado" : "Copiar enlace"}</button>;
}
