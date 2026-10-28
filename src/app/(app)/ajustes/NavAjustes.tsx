"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/Icono";

export function NavAjustes({ links }: { links: [string, string, string][] }) {
  const ruta = usePathname();
  return (
    <nav className="glass ajustes-nav" aria-label="Ajustes">
      <span className="lab" style={{ padding: "8px 11px 6px" }}>Ajustes</span>
      {links.map(([h, t, i]) => <Link key={h} href={h} aria-current={ruta === h ? "page" : undefined}><Icono n={i} />{t}</Link>)}
    </nav>
  );
}
