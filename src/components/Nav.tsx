"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { grupoDe, pestanaActiva, type GrupoMenu } from "@/lib/menu";
import { Icono } from "./Icono";

export type ItemNav = { href: string; texto: string; icono: string; /** Función propia del puesto: se muestra con otro color. */ resalta?: boolean; tambien?: string[] };
export type SubNav = GrupoMenu;

/** Si la ruta pertenece a la sección (su ruta o alguna de las que agrupa). */
export const enSeccion = (ruta: string, i: ItemNav) =>
  i.href === "/" ? ruta === "/" : [i.href, ...(i.tambien ?? [])].some((h) => ruta === h || ruta.startsWith(h + "/"));

/**
 * Menú principal. Dentro de una sección con pestañas (Analítica, Clientes), el menú principal sale hacia la izquierda
 * y entran las pestañas de la sección con un botón para volver.
 */
export function Nav({ items, grupos, destacado }: { items: ItemNav[]; grupos: SubNav[]; destacado?: ItemNav }) {
  const ruta = usePathname();
  const actual = grupoDe(ruta, grupos);
  const dentro = !!actual;
  return (
    <nav className={`nav glass desliza-n ${dentro ? "dentro" : ""}`} aria-label="Secciones">
      <div className="capa-n pri" aria-hidden={dentro || undefined}>
        {destacado && (
          <Link href={destacado.href} className="destacado-n" tabIndex={dentro ? -1 : undefined} aria-current={enSeccion(ruta, destacado) ? "page" : undefined}>
            <Icono n={destacado.icono} /><span>{destacado.texto}</span>
          </Link>
        )}
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={i.resalta ? "resalta-datos" : undefined} tabIndex={dentro ? -1 : undefined} aria-current={enSeccion(ruta, i) ? "page" : undefined}>
            <Icono n={i.icono} />
            <span>{i.texto}</span>
          </Link>
        ))}
      </div>
      {grupos.map((g) => {
        const on = g === actual;
        return (
          <div key={g.base} className={`capa-n sub ${on ? "on" : ""}`} aria-hidden={!on || undefined}>
            <Link href="/" className="volver-n" tabIndex={on ? undefined : -1} aria-label="Volver al menú principal"><Icono n="izquierda" /><span>Volver</span></Link>
            {g.items.map(([h, t]) => (
              <Link key={h} href={h} className={h === "/analitica" ? "resalta-resumen" : undefined} tabIndex={on ? undefined : -1} aria-current={pestanaActiva(ruta, h, g.items) ? "page" : undefined}>{t}</Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
