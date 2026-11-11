"use client";

import { useEffect, useState } from "react";
import { consultarPagoStripe, type ConsultaStripe } from "@/app/(app)/analitica/ventas/actions";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";

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
  return (
    <span className="vs-caja">
      <span className="vs-tit"><Icono n="candado" /><b>Verificado por Stripe</b>{!r && <i className="vs-viva" aria-label="Comprobando con Stripe" />}</span>
      <span className="vs-grid">
        <span><small>Confirmado</small>{confirmado}</span>
        <span><small>Estado en Stripe</small>{estado}</span>
        {r?.monto !== undefined && r.estado !== "error" && <span><small>Monto cobrado</small>{formatoDinero(r.monto)}{r.reembolsado ? `, devuelto ${formatoDinero(r.reembolsado)}` : ""}</span>}
        {(r?.tarjeta || tarjeta) && <span><small>Tarjeta</small>{r?.tarjeta || tarjeta}</span>}
        {(r?.referencia || referencia) && <span className="vs-ref"><small>Referencia de Stripe</small><code>{r?.referencia || referencia}</code></span>}
      </span>
      {r?.consultado && <small className="muted">Comprobado con Stripe a las {r.consultado}.</small>}
    </span>
  );
}
