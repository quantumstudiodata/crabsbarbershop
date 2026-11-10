"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

export type ItemNav = { href: string; texto: string; icono: string; /** Función propia del puesto: se muestra con otro color. */ resalta?: boolean };
export type SubNav = { base: string; items: [string, string][] };

/**
 * Menú principal. Dentro de una sección con submenú (Analítica), el menú principal sale hacia la izquierda
 * y entran las pestañas de la sección con un botón para volver.
 */
export function Nav({ items, sub, destacado }: { items: ItemNav[]; sub?: SubNav; destacado?: ItemNav }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  const dentro = !!sub && sub.items.length > 1 && ruta.startsWith(sub.base);
  // Una píldora oscura se desliza bajo la sección activa de cada capa.
  const pri = useRef<HTMLDivElement>(null);
  const sec = useRef<HTMLDivElement>(null);
  const [pills, setPills] = useState<{ p: React.CSSProperties; s: React.CSSProperties }>({ p: { opacity: 0 }, s: { opacity: 0 } });
  const [lista, setLista] = useState(false);
  useLayoutEffect(() => {
    const medir = (c: HTMLDivElement | null): React.CSSProperties => {
      const a = c?.querySelector<HTMLElement>('a[aria-current="page"]');
      return a ? { transform: `translateX(${a.offsetLeft}px)`, width: a.offsetWidth, opacity: 1 } : { opacity: 0 };
    };
    const f = () => setPills({ p: medir(pri.current), s: medir(sec.current) });
    f();
    const t = setTimeout(() => setLista(true), 50);
    document.fonts?.ready.then(f).catch(() => {});
    window.addEventListener("resize", f);
    return () => { clearTimeout(t); window.removeEventListener("resize", f); };
  }, [ruta]);
  return (
    <nav className={`nav glass desliza-n con-pill ${dentro ? "dentro" : ""} ${lista ? "lista" : ""}`} aria-label="Secciones">
      <div className="capa-n pri" ref={pri} aria-hidden={dentro || undefined}>
        <span className="pill-n" style={pills.p} aria-hidden="true" />
        {destacado && (
          <Link href={destacado.href} className="destacado-n" tabIndex={dentro ? -1 : undefined} aria-current={activo(destacado.href) ? "page" : undefined}>
            <Icono n={destacado.icono} /><span>{destacado.texto}</span>
          </Link>
        )}
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={i.resalta ? "resalta-datos" : undefined} tabIndex={dentro ? -1 : undefined} aria-current={activo(i.href) ? "page" : undefined}>
            <Icono n={i.icono} />
            <span>{i.texto}</span>
          </Link>
        ))}
      </div>
      {sub && sub.items.length > 1 && (
        <div className="capa-n sub" ref={sec} aria-hidden={!dentro || undefined}>
          <span className="pill-n" style={pills.s} aria-hidden="true" />
          <Link href="/" className="volver-n" tabIndex={dentro ? undefined : -1} aria-label="Volver al menú principal"><Icono n="izquierda" /><span>Volver</span></Link>
          {sub.items.map(([h, t]) => (
            <Link key={h} href={h} className={h === sub.base ? "resalta-resumen" : undefined} tabIndex={dentro ? undefined : -1} aria-current={(h === sub.base ? ruta === h : ruta.startsWith(h)) ? "page" : undefined}>{t}</Link>
          ))}
        </div>
      )}
    </nav>
  );
}
