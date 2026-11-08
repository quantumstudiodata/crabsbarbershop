"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

export type OpcionVista = { como: string; texto: string };

/** Cambia de puesto en el modo de visualización sin salir de la página en la que se está. */
export function CambiarVista({ opciones, actual }: { opciones: OpcionVista[]; actual: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  const q = params.toString();
  const volver = encodeURIComponent(q ? `${ruta}?${q}` : ruta);
  return (
    <>
    <a className="bt chico sec solo" href={`/soporte/vista?pagina=${volver}&disp=movil`}>Ver en móvil</a>
    <div className="cambiar-v" ref={caja}>
      <button type="button" className="bt chico sec solo" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        Cambiar experiencia<Icono n="abajo" />
      </button>
      {abierto && (
        <div className="menu-v" role="menu">
          {opciones.map((o) => (
            <a key={o.como} role="menuitemradio" aria-checked={o.texto === actual} href={`/api/vista?como=${o.como}&volver=${volver}`}>
              {o.texto}{o.texto === actual && <Icono n="palomita" />}
            </a>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
