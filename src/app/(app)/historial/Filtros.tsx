"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { SelectorPeriodo } from "@/components/Periodo";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import type { Periodo } from "@/lib/periodo";

export function Filtros({ categorias, gente, hoy, periodo }: { categorias: [string, string][]; gente: { id: string; nombre: string; avatar: string }[]; hoy: string; periodo: Periodo | null }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
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
  return (
    <div className="filtros-h">
      <SelectorPeriodo p={periodo} hoy={hoy} sinPeriodo="Todo" medio={empleado} />
      <div style={{ flex: "1 1 170px", maxWidth: 220 }}>
        <Selector etiqueta="Categoría" valor={params.get("tipo") ?? ""} onChange={(v) => ir({ tipo: v })} opciones={categorias.map(([k, t]) => ({ valor: k, texto: t }))} />
      </div>
      <form className="con-icono" style={{ flex: "2 1 220px" }} onSubmit={(e) => { e.preventDefault(); ir({ q: q.trim() }); }}>
        <Icono n="buscar" />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, folio o acción" aria-label="Buscar en el historial" />
      </form>
      {(params.get("q") || params.get("tipo") || params.get("usuario") || periodo) && <button type="button" className="enlace" onClick={() => { setQ(""); router.push(ruta); }}>Quitar filtros</button>}
    </div>
  );
}
