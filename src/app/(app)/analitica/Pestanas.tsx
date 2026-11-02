"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menú de Analítica: a la izquierda en pantallas grandes y como pestañas arriba en el celular. */
export function Pestanas({ items }: { items: [string, string][] }) {
  const ruta = usePathname();
  return (
    <nav className="glass menu-lat" aria-label="Analítica">
      <span className="lab">Analítica</span>
      {items.map(([h, t]) => <Link key={h} href={h} aria-current={ruta === h ? "page" : undefined}>{t}</Link>)}
    </nav>
  );
}
