"use client";

import { useEffect, useState } from "react";
import { consultarPagoStripe, type ConsultaStripe } from "@/app/(app)/analitica/ventas/actions";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";

const TXT: Record<ConsultaStripe["estado"], string> = {
  cobrado: "Cobrado y confirmado", reembolsado: "Devuelto al cliente", parcial: "Devuelto en parte", pendiente: "Stripe aún no lo confirma", error: "No se pudo consultar Stripe",
};

/** Al abrir una venta pagada en línea: se pregunta a Stripe en ese momento por el estado real del cobro. */
export function VerificadoStripe({ ventaId, confirmado }: { ventaId: string; confirmado: string }) {
  const [r, setR] = useState<ConsultaStripe | null>(null);
  useEffect(() => { consultarPagoStripe(ventaId).then(setR).catch(() => setR({ estado: "error" })); }, [ventaId]);
  return (
    <span className="vs-caja">
      <span className="vs-tit"><Icono n="candado" /><b>Verificado por Stripe</b></span>
      <span className="vs-grid">
        <span><small>Confirmado</small>{confirmado}</span>
        {r === null ? <span><small>Estado en Stripe</small>Consultando…</span> : (
          <>
            <span><small>Estado en Stripe</small>{TXT[r.estado]}</span>
            {r.monto !== undefined && <span><small>Monto cobrado</small>{formatoDinero(r.monto)}{r.reembolsado ? `, devuelto ${formatoDinero(r.reembolsado)}` : ""}</span>}
            {r.tarjeta && <span><small>Tarjeta</small>{r.tarjeta}</span>}
            {r.referencia && <span className="vs-ref"><small>Referencia de Stripe</small>{r.referencia}</span>}
          </>
        )}
      </span>
      {r?.consultado && <small className="muted">Consultado en Stripe a las {r.consultado}. Busca la referencia en tu panel de Stripe para ver el pago.</small>}
    </span>
  );
}
