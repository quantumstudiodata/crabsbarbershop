"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";

export type FilaActividad = { id: string; t: string; titulo: string; detalle: string; avatar?: string; nombre?: string; tachada?: boolean };

/** Lo reciente para un barbero: sus servicios, los del equipo y los cortes de caja. */
export function ActividadBarbero({ mios, equipo, cortes }: { mios: FilaActividad[]; equipo: FilaActividad[]; cortes: FilaActividad[] }) {
  const [vista, setVista] = useState<"mios" | "equipo" | "cortes">(mios.length ? "mios" : "equipo");
  const filas = vista === "mios" ? mios : vista === "equipo" ? equipo : cortes;
  const vacio = vista === "mios" ? "Aquí aparecerán tus servicios en cuanto se cobren." : vista === "equipo" ? "Todavía no hay servicios cobrados." : "Todavía no hay cortes de caja.";
  return (
    <>
      <div className="seg chico" role="tablist" aria-label="Actividad">
        <button type="button" role="tab" aria-selected={vista === "mios"} className={vista === "mios" ? "on" : ""} onClick={() => setVista("mios")}>Mis servicios</button>
        <button type="button" role="tab" aria-selected={vista === "equipo"} className={vista === "equipo" ? "on" : ""} onClick={() => setVista("equipo")}>Equipo</button>
        <button type="button" role="tab" aria-selected={vista === "cortes"} className={vista === "cortes" ? "on" : ""} onClick={() => setVista("cortes")}>Cortes de caja</button>
      </div>
      {filas.length === 0 ? <p className="muted">{vacio}</p> : (
        <div className="feed" key={vista}>
          {filas.map((f, i) => (
            <div key={f.id} className={`subir ${f.tachada ? "tachada" : ""}`} style={{ animationDelay: `${0.05 + i * 0.04}s` }}>
              <span className="t">{f.t}</span>
              <span><b style={{ fontWeight: 600 }}>{f.titulo}</b><small>{f.detalle}</small></span>
              {f.nombre ? <Avatar avatar={f.avatar ?? "iniciales"} nombre={f.nombre} t={24} /> : <span />}
            </div>
          ))}
        </div>
      )}
      <Link href={vista === "mios" ? "/mis-ventas" : "/historial"} className="enlace" style={{ display: "inline-block", paddingTop: 12 }}>
        {vista === "mios" ? "Ver todo en Mis ventas" : "Ver todo en Historial"}
      </Link>
    </>
  );
}
