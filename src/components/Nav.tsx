"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "./Icono";

export type ItemNav = { href: string; texto: string; icono: string };
export type SubNav = { base: string; items: [string, string][] };

/**
 * Menú principal. Dentro de una sección con submenú (Analítica), el menú principal sale hacia la izquierda
 * y entran las pestañas de la sección con un botón para volver.
 */
export function Nav({ items, sub }: { items: ItemNav[]; sub?: SubNav }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  const dentro = !!sub && sub.items.length > 1 && ruta.startsWith(sub.base);
  return (
    <nav className={`nav glass desliza-n ${dentro ? "dentro" : ""}`} aria-label="Secciones">
      <div className="capa-n pri" aria-hidden={dentro || undefined}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} tabIndex={dentro ? -1 : undefined} aria-current={activo(i.href) ? "page" : undefined}>
            <Icono n={i.icono} />
            <span>{i.texto}</span>
          </Link>
        ))}
      </div>
      {sub && sub.items.length > 1 && (
        <div className="capa-n sub" aria-hidden={!dentro || undefined}>
          <Link href="/" className="volver-n" tabIndex={dentro ? undefined : -1} aria-label="Volver al menú principal"><Icono n="izquierda" /><span>Volver</span></Link>
          {sub.items.map(([h, t]) => (
            <Link key={h} href={h} tabIndex={dentro ? undefined : -1} aria-current={(h === sub.base ? ruta === h : ruta.startsWith(h)) ? "page" : undefined}>{t}</Link>
          ))}
        </div>
      )}
    </nav>
  );
}
