"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { Icono } from "@/components/Icono";
import { prepararPagoReserva } from "../actions";

type Datos = { servicioIds: string[]; persona: string | null; fecha: string; minuto: number; nombre: string; telefono: string; notas: string; sitio?: string };
type Props = {
  slug: string; enLinea: { llave: string; cuenta: string }; monto: number; forma: "anticipo" | "total"; apartarMin: number; datos: Datos;
  barra: { t: React.ReactNode; s: string }; atras: () => void;
  alConfirmar: (token: string) => void; alOcupado: () => void;
};

const apariencia = {
  theme: "flat" as const,
  variables: { colorPrimary: "#13171c", colorText: "#13171c", colorTextSecondary: "#6b7680", colorBackground: "#ffffff", borderRadius: "14px", fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif", spacingUnit: "4px" },
  rules: { ".Input": { boxShadow: "inset 0 0 0 1px rgba(19,23,28,.1)" }, ".Input:focus": { boxShadow: "inset 0 0 0 2px #13171c" }, ".Tab": { boxShadow: "inset 0 0 0 1px rgba(19,23,28,.1)" } },
};

/** Pago con tarjeta al confirmar la cita: el formulario de Stripe y la barra con el botón para pagar. */
export function PagoTarjeta(p: Props) {
  const promesa = useMemo<Promise<Stripe | null>>(() => loadStripe(p.enLinea.llave, { stripeAccount: p.enLinea.cuenta, locale: "es-419" }), [p.enLinea.llave, p.enLinea.cuenta]);
  return (
    <Elements stripe={promesa} options={{ mode: "payment", amount: Math.max(p.monto, 1000), currency: "mxn", appearance: apariencia }}>
      <Contenido {...p} />
    </Elements>
  );
}

function Contenido(p: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [preparado, setPreparado] = useState<{ secreto: string; token: string; hasta: number } | null>(null);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { elements?.update({ amount: Math.max(p.monto, 1000) }); }, [elements, p.monto]);
  useEffect(() => { if (!preparado) return; const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, [preparado]);
  const restan = preparado ? Math.max(Math.floor((preparado.hasta - ahora) / 1000), 0) : 0;
  const pagar = async () => {
    if (!stripe || !elements) return;
    setPagando(true); setError(null);
    const enviado = await elements.submit();
    if (enviado.error) { setError(enviado.error.message ?? "Revisa los datos de tu tarjeta."); setPagando(false); return; }
    let prep = preparado;
    if (!prep) {
      const r = await prepararPagoReserva(p.slug, p.datos, p.forma);
      if (r.error || !r.secreto || !r.token) {
        setError(r.error ?? "No se pudo preparar el pago."); setPagando(false);
        if (r.error?.includes("ocup")) p.alOcupado();
        return;
      }
      prep = { secreto: r.secreto, token: r.token, hasta: Date.now() + p.apartarMin * 60000 };
      setPreparado(prep);
    }
    const r = await stripe.confirmPayment({ elements, clientSecret: prep.secreto, confirmParams: { return_url: `${window.location.origin}/reservar/${p.slug}/cita/${prep.token}` }, redirect: "if_required" });
    if (r.error) { setError(r.error.message ?? "No se pudo completar el pago."); setPagando(false); return; }
    p.alConfirmar(prep.token);
  };
  return (
    <>
      <div className="fx-tarjeta">
        <PaymentElement options={{ layout: "tabs" }} />
        <small className="fx-seguro"><Icono n="candado" />{preparado ? <>Tu horario está apartado <b>{Math.floor(restan / 60)}:{String(restan % 60).padStart(2, "0")}</b> mientras pagas.</> : "Pago seguro con Stripe. Nadie en el negocio ve los datos de tu tarjeta."}</small>
        {error && <p className="aviso error" role="alert">{error}</p>}
      </div>
      <footer className="fx-barra">
        <div>
          <button type="button" className="fx-atras" onClick={p.atras} aria-label="Atrás"><Icono n="izquierda" /></button>
          <span className="fx-barra-t"><b>{p.barra.t}</b><small>{p.barra.s}</small></span>
          <button type="button" className="fx-go" disabled={!stripe || pagando} onClick={pagar}>{pagando ? "Pagando…" : "Pagar y reservar"}<Icono n="derecha" /></button>
        </div>
      </footer>
    </>
  );
}
