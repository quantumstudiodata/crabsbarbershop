"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Periodo } from "@/lib/periodo";
import { Avatar } from "./Avatar";
import { CalendarioFiltro } from "./CalendarioFiltro";
import { Icono } from "./Icono";
import { Selector } from "./ui";

/** Filtro corto, igual en todas las pantallas: buscador, calendario, equipo y descargar. Solo ocupa lo que necesita. */
export function BarraFiltros({ p, hoy, personas, persona, buscar, conBuscar = true, sinPeriodo, descarga, textoBuscar = "Buscar", extra }: {
  p: Periodo | null; hoy: string; personas: { id: string; nombre: string; avatar: string }[]; persona: string; buscar: string;
  conBuscar?: boolean; sinPeriodo?: string; descarga?: string; textoBuscar?: string; extra?: React.ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(buscar);
  const primera = useRef(true);
  const ir = (cambios: Record<string, string>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) { if (v) n.set(k, v); else n.delete(k); }
    n.delete("pagina");
    const t = n.toString();
    router.replace(t ? `${ruta}?${t}` : ruta, { scroll: false });
  };
  // Búsqueda en vivo: espera a que se deje de escribir.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const t = setTimeout(() => { if (q.trim() !== buscar) ir({ q: q.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="filtro-c">
      {conBuscar && (
        <label className="con-icono buscar-c"><Icono n="buscar" />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={textoBuscar} aria-label="Buscar" />
        </label>
      )}
      <CalendarioFiltro p={p} hoy={hoy} conTodas={!!sinPeriodo} todas={sinPeriodo ?? "Todas las fechas"} />
      {personas.length > 1 && (
        <div className="sel-equipo">
          <Selector etiqueta="Filtrar por persona" valor={persona} onChange={(v) => ir({ persona: v })}
            opciones={[{ valor: "", texto: "Todo el equipo" }, ...personas.map((x) => ({ valor: x.id, texto: x.nombre.split(" ").slice(0, 2).join(" "), icono: <Avatar avatar={x.avatar} nombre={x.nombre} t={22} /> }))]} />
        </div>
      )}
      {extra}
      {descarga && <a className="icb descarga-c" href={descarga} title="Descargar en Excel" aria-label="Descargar en Excel"><Icono n="descargar" /></a>}
    </div>
  );
}
