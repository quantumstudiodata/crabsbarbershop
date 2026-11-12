"use client";

import { useEffect, useState } from "react";
import { consultarPagoStripe, type ConsultaStripe } from "@/app/(app)/analitica/ventas/actions";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";
import { MarcaTarjeta } from "./IconosPago";

const TXT: Record<ConsultaStripe["estado"], string> = {
  cobrado: "Cobrado y confirmado", reembolsado: "Devuelto al cliente", parcial: "Devuelto en parte", pendiente: "Stripe aún no lo confirma", error: "No se pudo consultar Stripe",
};

/**
 * Al abrir una venta pagada en línea: se ven al instante los datos que Stripe confirmó al cobrar,
 * y en segundo plano se le vuelve a preguntar a Stripe por el estado actual, sin hacer esperar.
 */
export function VerificadoStripe({ ventaId, confirmado, reembolsado, tarjeta, referencia }: { ventaId: string; confirmado: string; reembolsado: boolean; tarjeta: string; referencia: string }) {
  const [r, setR] = useState<ConsultaStripe | null>(null);
  useEffect(() => { consultarPagoStripe(ventaId).then(setR).catch(() => setR({ estado: "error" })); }, [ventaId]);
  const estado = r && r.estado !== "error" ? TXT[r.estado] : reembolsado ? "Devuelto al cliente" : "Cobrado y confirmado";
  const clave = r && r.estado !== "error" ? r.estado : reembolsado ? "reembolsado" : "cobrado";
  const CHIP: Record<string, string> = { cobrado: "Cobrado", reembolsado: "Reembolsado", parcial: "Reembolso parcial", pendiente: "Pendiente" };
  const tj = r?.tarjeta || tarjeta;
  return (
    <span className={`vs-caja ${clave === "reembolsado" ? "dev" : ""}`}>
      <span className="vs-tit"><Icono n={clave === "reembolsado" ? "historial" : "candado"} /><b>{clave === "reembolsado" ? "Pago devuelto al cliente" : "Verificado por Stripe"}</b>{!r && <i className="vs-viva" aria-label="Comprobando con Stripe" />}</span>
      <span className="vs-chips">
        <i className={`vs-est ${clave}`}>{CHIP[clave] ?? "Cobrado"}</i>
        <i className="vs-est">Pago en línea</i>
        {tj && <span className="vs-tj"><MarcaTarjeta tarjeta={tj} />{tj.replace(/^\D+\s*/, "•••• ")}</span>}
      </span>
      <span className="vs-grid">
        <span><small>Confirmado</small>{confirmado}</span>
        <span><small>Estado en Stripe</small>{estado}</span>
        {r?.monto !== undefined && r.estado !== "error" && <span><small>Monto cobrado</small>{formatoDinero(r.monto)}{r.reembolsado ? `, devuelto ${formatoDinero(r.reembolsado)}` : ""}</span>}
        {(r?.referencia || referencia) && <span className="vs-ref"><small>Referencia de Stripe</small><code>{r?.referencia || referencia}</code></span>}
      </span>
      {r?.consultado && <small className="muted">Comprobado con Stripe a las {r.consultado}.</small>}
    </span>
  );
}
