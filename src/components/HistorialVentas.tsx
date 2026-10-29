"use client";

import { useState } from "react";
import { CancelarVenta } from "@/app/(app)/analitica/ventas/CancelarVenta";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";

export type FilaVenta = {
  id: string; folio: string; hora: string; servicios: string; monto: number; cancelada: boolean;
  detalle: [string, string][];
  /** Cancelar (quien tiene permiso) o anular (el propio barbero en sus primeros minutos). */
  accion?: { tipo: "cancelar" | "anular"; hasta?: string };
};
export type DiaVentas = { fecha: string; titulo: string; total: number; filas: FilaVenta[] };

/** Historial agrupado por día: una fila por folio; al tocarla se ven los detalles. */
export function HistorialVentas({ dias, regreso }: { dias: DiaVentas[]; regreso: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  if (dias.length === 0) return <p className="muted">No hay ventas en estas fechas.</p>;
  return (
    <div className="glass historial">
      <div className="hist-scroll">
        {dias.map((d) => (
          <div key={d.fecha}>
            <div className="hist-dia"><span>{d.titulo}</span><b className="num">{formatoDinero(d.total)}</b></div>
            {d.filas.map((f) => (
              <div key={f.id} className={`hist-fila ${f.cancelada ? "cancelada" : ""} ${abierta === f.id ? "abierta" : ""}`}>
                <button type="button" className="hist-linea" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                  <span className="t">{f.hora}</span>
                  <span className="srv">{f.servicios}</span>
                  <span className="folio">{f.folio}</span>
                  <span className="num">{formatoDinero(f.monto)}</span>
                  <Icono n="abajo" />
                </button>
                {abierta === f.id && (
                  <div className="hist-det">
                    {f.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
                    {f.accion && (
                      <span className="anular">
                        <small>{f.accion.tipo === "anular" ? "¿Te equivocaste?" : "Cancelar venta"}</small>
                        <span className="fila" style={{ gap: 8 }}>
                          {f.accion.tipo === "anular" ? `Puedes anularla hasta las ${f.accion.hasta}` : "Queda tachada con su motivo; no se borra."}
                          <CancelarVenta id={f.id} folio={f.folio} total={formatoDinero(f.monto)} regreso={regreso} texto={f.accion.tipo === "anular" ? "Anular" : "Cancelar"} />
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
