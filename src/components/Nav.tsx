"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "./Icono";

export type ItemNav = { href: string; texto: string; icono: string };

export function Nav({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  return (
    <nav className="nav glass" aria-label="Secciones">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={activo(i.href) ? "page" : undefined}>
          <Icono n={i.icono} />
          <span>{i.texto}</span>
        </Link>
      ))}
    </nav>
  );
}
