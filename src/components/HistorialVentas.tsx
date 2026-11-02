"use client";

import { useState } from "react";
import { CancelarVenta } from "@/app/(app)/analitica/ventas/CancelarVenta";
import { type DatosEdicion, ModificarVenta, type Opciones } from "@/app/(app)/analitica/ventas/ModificarVenta";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";

export type FilaVenta = {
  id: string; folio: string; hora: string; servicios: string; monto: number; cancelada: boolean;
  detalle: [string, string][];
  /** Cancelar (quien tiene permiso) o anular (el propio barbero en sus primeros minutos). */
  accion?: { tipo: "cancelar" | "anular"; hasta?: string };
  /** Si quien ve puede modificar la venta. */
  edicion?: DatosEdicion;
};
export type DiaVentas = { fecha: string; titulo: string; total: number; filas: FilaVenta[] };

/** Historial agrupado por día: una fila por folio; al tocarla se ven los detalles. */
export function HistorialVentas({ dias, regreso, opciones }: { dias: DiaVentas[]; regreso: string; opciones?: Opciones }) {
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
                    {(f.accion || (f.edicion && opciones)) && (
                      <span className="anular">
                        <small>{f.accion?.tipo === "anular" ? "¿Te equivocaste?" : "Corregir la venta"}</small>
                        <span className="fila" style={{ gap: 8 }}>
                          {f.accion?.tipo === "anular" ? `Puedes anularla hasta las ${f.accion.hasta}` : f.edicion ? "Modifícala o cancélala. Todo queda en el historial." : "Queda tachada con su motivo; no se borra."}
                          {f.edicion && opciones && <ModificarVenta id={f.id} folio={f.folio} datos={f.edicion} opciones={opciones} />}
                          {f.accion && <CancelarVenta id={f.id} folio={f.folio} total={formatoDinero(f.monto)} regreso={regreso} texto={f.accion.tipo === "anular" ? "Anular" : "Cancelar"} />}
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
