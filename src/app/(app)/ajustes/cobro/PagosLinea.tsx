"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { conectarStripe, revisarStripe } from "./actions";

/** Pagos en línea: cada negocio conecta su propia cuenta de Stripe y recibe su dinero directo. */
export function PagosLinea({ estado, revisar, puede, cobradoMes }: { estado: "sin" | "pendiente" | "activa"; revisar: boolean; puede: boolean; cobradoMes: number }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Al regresar de Stripe se consulta si la cuenta ya quedó lista.
    if (revisar) iniciar(async () => { const r = await revisarStripe(); if (r.error) setError(r.error); router.replace("/ajustes/cobro"); router.refresh(); });
  }, [revisar]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = () => iniciar(async () => { setError(null); const r = await conectarStripe(); if (r.url) window.location.href = r.url; else setError(r.error ?? "No se pudo abrir Stripe."); });
  const chip = { sin: "Sin conectar", pendiente: "Pendiente", activa: "Conectada" }[estado];
  return (
    <section className="glass pl-card subir" aria-label="Pagos en línea">
      <div className="entre"><b>Pagos en línea</b><span className="pl-chip">{chip}</span></div>
      {estado === "sin" && <span className="pl-t"><b>Conecta tu cuenta de Stripe</b><small>Para cobrar anticipos de citas y pagos con QR. Stripe te pide tus datos y tu cuenta bancaria; tarda unos minutos. El dinero llega directo a tu cuenta.</small></span>}
      {estado === "pendiente" && <span className="pl-t"><b>Stripe está revisando tus datos</b><small>Mientras tanto no se pueden cobrar pagos en línea. Si te faltó algo, continúa donde te quedaste.</small></span>}
      {estado === "activa" && (
        <>
          <span className="pl-t"><b>Ya recibes pagos en línea</b><small>En Cobro aparece Pago con QR y en Ajustes, Citas y agenda puedes pedir anticipo al reservar.</small></span>
          <div className="pl-fila"><span>Cobrado en línea este mes</span><b>{formatoDinero(cobradoMes)}</b></div>
        </>
      )}
      {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
      {puede && estado !== "activa" && <button type="button" className="bt" disabled={pend} onClick={abrir}>{pend ? "Abriendo Stripe…" : estado === "sin" ? "Conectar con Stripe" : "Continuar en Stripe"}<span className="fl" aria-hidden="true"><Icono n="derecha" /></span></button>}
      {estado === "activa" && <a className="eq2-link" href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">Abrir el panel de Stripe</a>}
      <small className="pl-nota"><Icono n="candado" />Crabs nunca ve ni guarda datos de tarjetas. Un pago cuenta solo cuando Stripe lo confirma.</small>
    </section>
  );
}
