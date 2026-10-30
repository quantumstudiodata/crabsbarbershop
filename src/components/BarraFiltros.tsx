"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Periodo } from "@/lib/periodo";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { SelectorPeriodo } from "./Periodo";
import { Selector } from "./ui";

/** Periodo (o todo), persona, buscador y descarga con lo mismo que se ve. */
export function BarraFiltros({ p, hoy, personas, persona, buscar, conBuscar = true, sinPeriodo, descarga, textoBuscar = "Buscar por folio, servicio o barbero" }: {
  p: Periodo | null; hoy: string; personas: { id: string; nombre: string; avatar: string }[]; persona: string; buscar: string;
  conBuscar?: boolean; sinPeriodo?: string; descarga?: string; textoBuscar?: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(buscar);
  const ir = (cambios: Record<string, string>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) { if (v) n.set(k, v); else n.delete(k); }
    n.delete("pagina");
    const t = n.toString();
    router.push(t ? `${ruta}?${t}` : ruta);
  };
  const hayFiltros = !!(p && sinPeriodo) || !!persona || !!buscar;
  return (
    <div className="barra-filtros">
      <SelectorPeriodo p={p} hoy={hoy} sinPeriodo={sinPeriodo} />
      <div className="fila filtros-extra">
        {conBuscar && (
          <form className="con-icono buscar-f" onSubmit={(e) => { e.preventDefault(); ir({ q: q.trim() }); }}>
            <Icono n="buscar" />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { if (q.trim() !== buscar) ir({ q: q.trim() }); }} placeholder={textoBuscar} aria-label="Buscar" />
          </form>
        )}
        <div style={{ minWidth: 200 }}>
          <Selector etiqueta="Filtrar por barbero" valor={persona} onChange={(v) => ir({ persona: v })}
            opciones={[{ valor: "", texto: "Todo el equipo" }, ...personas.map((x) => ({ valor: x.id, texto: x.nombre.split(" ").slice(0, 2).join(" "), icono: <Avatar avatar={x.avatar} nombre={x.nombre} t={22} /> }))]} />
        </div>
        {hayFiltros && <button type="button" className="enlace" onClick={() => { setQ(""); router.push(ruta); }}>Quitar filtros</button>}
        {descarga && <a className="chipf" href={descarga}><Icono n="descargar" />Descargar</a>}
      </div>
    </div>
  );
}
