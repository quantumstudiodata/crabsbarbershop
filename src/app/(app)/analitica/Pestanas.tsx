"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menú de Analítica: pestañas arriba, el contenido usa todo el ancho. */
export function Pestanas({ items }: { items: [string, string][] }) {
  const ruta = usePathname();
  return (
    <div className="cab-sup">
      <h1 className="titulo">Analítica</h1>
      <nav className="glass menu-sup" aria-label="Analítica">
        {items.map(([h, t]) => <Link key={h} href={h} aria-current={ruta === h ? "page" : undefined}>{t}</Link>)}
      </nav>
    </div>
  );
}
