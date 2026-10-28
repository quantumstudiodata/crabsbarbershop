"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Signo (?) con explicación. La nota flota sobre todo para que ninguna ventana la corte. */
export function Ayuda({ titulo, children }: { titulo?: string; children: React.ReactNode; izq?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = 280;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - ancho / 2), window.innerWidth - ancho - 12);
    const arriba = window.innerHeight - r.bottom < 200;
    setPos({ x, y: arriba ? r.top - 10 : r.bottom + 10, arriba });
  };
  return (
    <span ref={ref} className="ayuda" tabIndex={0} aria-label={titulo ? `Ayuda: ${titulo}` : "Ayuda"}
      onMouseEnter={mostrar} onMouseLeave={() => setPos(null)} onFocus={mostrar} onBlur={() => setPos(null)}>
      <span aria-hidden="true">?</span>
      {pos && createPortal(
        <span className="tip-flot" role="tooltip" style={{ left: pos.x, top: pos.y, transform: pos.arriba ? "translateY(-100%)" : undefined }}>
          {titulo && <b>{titulo}</b>}
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}
