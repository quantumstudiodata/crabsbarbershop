"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/** Hoja de la libreta: deslizar a los lados cambia de semana, igual que las flechas. */
export function DeslizaSemana({ anterior, siguiente, children }: { anterior?: string; siguiente?: string; children: React.ReactNode }) {
  const router = useRouter();
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={(e) => { const t = e.touches[0]; inicio.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const a = inicio.current; inicio.current = null;
        if (!a) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - a.x, dy = t.clientY - a.y;
        // Solo cuenta un deslizamiento claramente horizontal.
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const destino = dx < 0 ? siguiente : anterior;
        if (destino) router.push(destino, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
