"use client";

import { useEffect, useRef, useState } from "react";
import { zoomPagina } from "@/lib/zoom";
import { Grafica } from "./Grafica";

/** Gráfica de alto fijo que toma el ancho real de su espacio: las letras y los puntos se ven de su tamaño, sin agrandarse. */
export function GraficaMedida(props: React.ComponentProps<typeof Grafica>) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(props.ancho ?? 420);
  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    const medir = () => { const w = c.getBoundingClientRect().width / (zoomPagina() || 1); if (w > 50) setAncho(Math.round(w)); };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return <div ref={caja} style={{ minWidth: 0 }}><Grafica {...props} ancho={ancho} /></div>;
}
