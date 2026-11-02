"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";

export type FilaActividad = { id: string; t: string; titulo: string; detalle: string; avatar?: string; nombre?: string; tachada?: boolean; chip?: string; monto?: string };

/** Lo reciente para un barbero: sus servicios, los del equipo y los cortes de caja. */
export function ActividadBarbero({ mios, equipo, cortes }: { mios: FilaActividad[]; equipo: FilaActividad[]; cortes: FilaActividad[] }) {
  const [vista, setVista] = useState<"mios" | "equipo" | "cortes">(mios.length ? "mios" : "equipo");
  // Solo las más recientes, para que la tarjeta mida lo mismo que la de al lado.
  const filas = (vista === "mios" ? mios : vista === "equipo" ? equipo : cortes).slice(0, 5);
  const vacio = vista === "mios" ? "Aquí aparecerán tus ventas en cuanto se cobren." : vista === "equipo" ? "Todavía no hay servicios cobrados." : "Todavía no hay cortes de caja.";
  return (
    <>
      <div className="seg chico" role="tablist" aria-label="Actividad">
        <button type="button" role="tab" aria-selected={vista === "mios"} className={vista === "mios" ? "on" : ""} onClick={() => setVista("mios")}>Mis ventas</button>
        <button type="button" role="tab" aria-selected={vista === "equipo"} className={vista === "equipo" ? "on" : ""} onClick={() => setVista("equipo")}>Equipo</button>
        <button type="button" role="tab" aria-selected={vista === "cortes"} className={vista === "cortes" ? "on" : ""} onClick={() => setVista("cortes")}>Cortes de caja</button>
      </div>
      {filas.length === 0 ? <p className="muted">{vacio}</p> : (
        <div className="feed feed-corto" key={vista}>
          {filas.map((f, i) => (
            <div key={f.id} className={`subir ${f.tachada ? "tachada" : ""}`} style={{ animationDelay: `${0.05 + i * 0.04}s` }}>
              <span className="t">{f.t}</span>
              <span><b style={{ fontWeight: 600 }}>{f.titulo}</b><small>{f.detalle}</small></span>
              <span className="der">{f.chip && <span className="folio">{f.chip}</span>}{f.monto && <span className="num">{f.monto}</span>}{f.nombre && <Avatar avatar={f.avatar ?? "iniciales"} nombre={f.nombre} t={22} />}</span>
            </div>
          ))}
        </div>
      )}
      <Link href={vista === "mios" ? "/mis-ventas" : "/historial"} className="enlace ver-todo-a">
        {vista === "mios" ? "Ver todo en Mis ventas" : "Ver todo en Historial"}
      </Link>
    </>
  );
}
