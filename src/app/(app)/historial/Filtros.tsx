"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CalendarioFiltro } from "@/components/CalendarioFiltro";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import type { Periodo } from "@/lib/periodo";

export function Filtros({ categorias, gente, hoy, periodo }: { categorias: [string, string][]; gente: { id: string; nombre: string; avatar: string }[]; hoy: string; periodo: Periodo | null }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  // Busca mientras se escribe: espera un instante después de la última tecla para no recargar en cada letra.
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const t = setTimeout(() => {
      const n = new URLSearchParams(window.location.search);
      if (q.trim()) n.set("q", q.trim()); else n.delete("q");
      n.delete("pagina");
      const txt = n.toString();
      router.replace(txt ? `${ruta}?${txt}` : ruta, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, ruta, router]);
  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) { if (v) p.set(k, v); else p.delete(k); }
    p.delete("pagina");
    router.push(`${ruta}?${p.toString()}`);
  };
  const empleado = (
    <div className="sel-equipo">
      <Selector etiqueta="Empleado" valor={params.get("usuario") ?? ""} onChange={(v) => ir({ usuario: v })}
        opciones={[{ valor: "", texto: "Todo el equipo" }, ...gente.map((g) => ({ valor: g.id, texto: g.nombre.split(" ").slice(0, 2).join(" "), icono: <Avatar avatar={g.avatar} nombre={g.nombre} t={20} /> }))]} />
    </div>
  );
  // El mismo filtro que en el resto de la app: buscador, calendario, equipo y categoría, en una fila.
  return (
    <div className="filtro-c filtro-hist">
      <label className="con-icono buscar-c"><Icono n="buscar" />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, folio o acción" aria-label="Buscar en el historial" />
      </label>
      <CalendarioFiltro p={periodo} hoy={hoy} conTodas todas="Todas las fechas" />
      {empleado}
      <div className="sel-equipo sel-tipo">
        <Selector etiqueta="Categoría" valor={params.get("tipo") ?? ""} onChange={(v) => ir({ tipo: v })} opciones={categorias.map(([k, t]) => ({ valor: k, texto: t }))} />
      </div>
    </div>
  );
}
