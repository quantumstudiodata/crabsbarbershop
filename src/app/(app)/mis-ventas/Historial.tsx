"use client";

import { useState } from "react";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { CancelarVenta } from "../analitica/ventas/CancelarVenta";

export type FilaVenta = {
  id: string; folio: string; hora: string; servicios: string; monto: number; cancelada: boolean; motivo: string | null;
  metodos: string; propina: number; registro: string; otros: string; anularHasta: string | null; total: number;
};
export type DiaVentas = { fecha: string; titulo: string; total: number; filas: FilaVenta[] };

/** Historial agrupado por día: una fila por folio; al tocarla se ven los detalles. */
export function Historial({ dias }: { dias: DiaVentas[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  if (dias.length === 0) return <p className="muted">No hay servicios en estas fechas.</p>;
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
                    <span><small>Pago</small>{f.metodos || "Sin pago"}</span>
                    {f.propina > 0 && <span><small>Propina</small>{formatoDinero(f.propina)}</span>}
                    <span><small>Registró</small>{f.registro}</span>
                    {f.otros && <span><small>En la misma venta</small>{f.otros}</span>}
                    {f.cancelada && <span><small>Cancelada</small>{f.motivo}</span>}
                    {f.anularHasta && (
                      <span className="anular">
                        <small>¿Te equivocaste?</small>
                        <span className="fila" style={{ gap: 8 }}>Puedes anularlo hasta las {f.anularHasta}<CancelarVenta id={f.id} folio={f.folio} total={formatoDinero(f.total)} regreso="/mis-ventas" texto="Anular" /></span>
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
