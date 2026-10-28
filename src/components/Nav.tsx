"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cangrejo } from "./Cangrejo";

export type ItemNav = { href: string; texto: string };

export function Nav({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  return (
    <nav className="nav glass" aria-label="Secciones">
      <Link href="/" className="logo" aria-label="Crabs, inicio">
        <Cangrejo />
        CRABS
      </Link>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={activo(i.href) ? "page" : undefined}>
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}
