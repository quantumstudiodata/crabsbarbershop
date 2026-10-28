"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Pestanas({ items }: { items: [string, string][] }) {
  const ruta = usePathname();
  return (
    <nav className="tabs" aria-label="Analítica">
      {items.map(([h, t]) => <Link key={h} href={h} aria-current={ruta === h ? "page" : undefined}>{t}</Link>)}
    </nav>
  );
}
