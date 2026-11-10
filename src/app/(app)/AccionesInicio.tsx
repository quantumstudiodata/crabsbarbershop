"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/Icono";

export type AccionInicio = { k: string; href: string; texto: string; corto: string; icono: string; dato?: string; principal?: boolean; aviso?: boolean };

/** Escritorio: grupo compacto a la derecha del saludo. Cobrar primero; lo que no cabe va en el botón de tres puntos. */
export function AccionesEscritorio({ acciones }: { acciones: AccionInicio[] }) {
  const visibles = acciones.slice(0, 4);
  const mas = acciones.slice(4);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  if (!acciones.length) return null;
  return (
    <nav className="ini-acc glass" aria-label="Acciones rápidas">
      {visibles.map((a) => (
        <Link key={a.k} href={a.href} className={`${a.principal ? "pri" : ""} ${a.aviso ? "pend" : ""}`} title={a.dato}><Icono n={a.icono} />{a.corto}</Link>
      ))}
      {mas.length > 0 && (
        <div ref={caja} className="ini-mas">
          <button type="button" className="ini-pts" aria-label={`Más acciones: ${mas.map((a) => a.texto.toLowerCase()).join(" y ")}`} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}><Icono n="puntos" /></button>
          {abierto && (
            <div className="menu ini-menu" role="menu">
              {mas.map((a) => <Link key={a.k} href={a.href} role="menuitem" className="it" onClick={() => setAbierto(false)}><Icono n={a.icono} />{a.texto}</Link>)}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

/** Teléfono: lista de acciones en una tarjeta. Cobrar vive en la barra de abajo. Si son más de cuatro, el resto se despliega. */
export function AccionesMovil({ acciones }: { acciones: AccionInicio[] }) {
  const sinCobrar = acciones.filter((a) => a.k !== "cobrar");
  const [abierto, setAbierto] = useState(false);
  if (!sinCobrar.length) return null;
  const directas = sinCobrar.length > 4 ? sinCobrar.slice(0, 3) : sinCobrar;
  const resto = sinCobrar.length > 4 ? sinCobrar.slice(3) : [];
  const fila = (a: AccionInicio) => (
    <Link key={a.k} href={a.href} className="ini-fila"><Icono n={a.icono} /><span>{a.texto}</span>{a.dato && <small className={a.aviso ? "pend" : undefined}>{a.dato}</small>}<Icono n="derecha" /></Link>
  );
  return (
    <section className="glass ini-lista solo-movil" aria-label="Acciones rápidas">
      {directas.map(fila)}
      {resto.length > 0 && (
        <>
          <button type="button" className="ini-fila" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
            <Icono n="puntos" /><span>Más acciones</span><small>{resto.map((a) => a.corto.toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase())}</small><Icono n={abierto ? "arriba" : "abajo"} />
          </button>
          {abierto && resto.map(fila)}
        </>
      )}
    </section>
  );
}
