"use client";

import { useState } from "react";
import { Vacio } from "@/components/Vacio";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";

export type FilaUltimo = {
  id: string; t: string; servicios: string; quien: string; avatar: string; metodo: string; folio: string; monto: string; cancelada: boolean;
  /** Pago con QR confirmado por Stripe (o devuelto). */
  verificado?: "si" | "devuelto";
  detalle: [string, string][];
};

/** Lista de lo último cobrado; al tocar una fila se despliegan sus datos, como en el historial. */
export function UltimosServicios({ filas }: { filas: FilaUltimo[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  if (filas.length === 0) return <Vacio icono="cobro" titulo="Todavía no hay servicios cobrados" texto="Cada vez que se cobre un servicio aparecerá aquí con su hora, quién lo hizo y cómo pagaron." />;
  return (
    <div className="glass historial">
      {filas.map((f) => (
        <div key={f.id} className={`hist-fila ${f.cancelada ? "cancelada" : ""} ${abierta === f.id ? "abierta" : ""}`}>
          <button type="button" className="hist-linea ultimo-l" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
            <span className="t">{f.t}</span>
            <Avatar avatar={f.avatar} nombre={f.quien} t={26} />
            <span className="srv">{f.servicios}<small>{f.quien.split(" ")[0]}, {f.metodo}{f.verificado && <i className={`vs-mini ${f.verificado === "devuelto" ? "dev" : ""}`}><Icono n="palomita" />{f.verificado === "devuelto" ? "Devuelto" : "Verificado"}</i>}</small></span>
            <span className="folio">{f.folio}</span>
            <span className="num">{f.monto}</span>
            <Icono n="abajo" />
          </button>
          {abierta === f.id && (
            <div className="hist-det">
              {f.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
