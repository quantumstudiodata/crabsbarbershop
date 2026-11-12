"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { cargoEnLinea } from "@/lib/cargo";
import { prepararPagoReserva } from "../actions";

export type FormaPago = "anticipo" | "total" | "negocio";
type Datos = { servicioIds: string[]; persona: string | null; fecha: string; minuto: number; nombre: string; telefono: string; notas: string; sitio?: string };
type Props = {
  slug: string; enLinea: { llave: string; cuenta: string }; modo: string; forma: FormaPago; setForma: (f: FormaPago) => void;
  total: number; anticipo: number; apartarMin: number; politica: string; reembolso: string; datos: Datos;
  alConfirmar: (token: string) => void; alOcupado: () => void; enNegocio: () => void;
};

const apariencia = {
  theme: "stripe" as const,
  variables: { colorPrimary: "#13171c", colorText: "#13171c", colorTextSecondary: "#56616c", borderRadius: "12px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
};

/** Paso Pago de la reservación: el cliente paga con el formulario de Stripe; la cita se confirma cuando Stripe avisa. */
export function PagoReserva(p: Props) {
  const promesa = useMemo<Promise<Stripe | null>>(() => loadStripe(p.enLinea.llave, { stripeAccount: p.enLinea.cuenta, locale: "es-419" }), [p.enLinea.llave, p.enLinea.cuenta]);
  const monto = p.forma === "total" ? p.total : p.anticipo;
  return (
    <Elements stripe={promesa} options={{ mode: "payment", amount: Math.max(monto + cargoEnLinea(monto), 1000), currency: "mxn", appearance: apariencia }}>
      <Contenido {...p} monto={monto} />
    </Elements>
  );
}

function Contenido(p: Props & { monto: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [preparado, setPreparado] = useState<{ secreto: string; token: string; hasta: number } | null>(null);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const cargo = cargoEnLinea(p.monto);
  useEffect(() => { elements?.update({ amount: Math.max(p.monto + cargo, 1000) }); }, [elements, p.monto, cargo]);
  useEffect(() => { if (!preparado) return; const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, [preparado]);
  const restan = preparado ? Math.max(Math.floor((preparado.hasta - ahora) / 1000), 0) : 0;
  const opciones: [FormaPago, string, string][] = p.modo === "completo"
    ? [["total", `Pagar ahora, ${formatoDinero(p.total)}`, "Este negocio pide el pago completo al reservar"]]
    : p.modo === "opcional"
      ? [["total", `Pagar ahora, ${formatoDinero(p.total)}`, "Llegas y solo te atienden"], ["negocio", "Pagar en el negocio", "Al terminar tu servicio"]]
      : [["anticipo", `Pagar anticipo ahora, ${formatoDinero(p.anticipo)}`, `El resto, ${formatoDinero(Math.max(p.total - p.anticipo, 0))}, lo pagas en el negocio`], ["total", `Pagar todo ahora, ${formatoDinero(p.total)}`, "Llegas y solo te atienden"]];
  const enNegocio = p.forma === "negocio";
  const pagar = async () => {
    if (!stripe || !elements) return;
    setPagando(true); setError(null);
    const enviado = await elements.submit();
    if (enviado.error) { setError(enviado.error.message ?? "Revisa los datos de tu tarjeta."); setPagando(false); return; }
    let prep = preparado;
    if (!prep) {
      const r = await prepararPagoReserva(p.slug, p.datos, p.forma === "total" ? "total" : "anticipo");
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
      <h1>Pago</h1>
      <div className="rv-aparta"><Icono n="reloj" /><span>{preparado ? <>Tu horario está apartado <b>{Math.floor(restan / 60)}:{String(restan % 60).padStart(2, "0")} min</b> mientras pagas.</> : <>Al pagar, tu horario queda apartado {p.apartarMin} minutos.</>}</span></div>
      <div className="rv-pago" role="radiogroup" aria-label="Cómo quieres pagar">
        {opciones.map(([k, t, x]) => (
          <button type="button" key={k} role="radio" aria-checked={p.forma === k} disabled={!!preparado} className={`rv-opc ${p.forma === k ? "on" : ""}`} onClick={() => p.setForma(k)}>
            <i className="radio-p" /><span><b>{t}</b><small>{x}</small></span>
          </button>
        ))}
      </div>
      {!enNegocio && (
        <div className="rv-desglose">
          <div className="entre"><span>{p.monto < p.total ? "Anticipo" : "Servicio"}</span><span>{formatoDinero(p.monto)}</span></div>
          <div className="entre"><span>Cargo por pago en línea</span><span>{formatoDinero(cargo)}</span></div>
          <div className="entre rv-desglose-t"><span>Pagas ahora</span><b>{formatoDinero(p.monto + cargo)}</b></div>
          <small>El cargo es la comisión del banco por pagar con tarjeta. Si pagas en el negocio no se cobra.</small>
        </div>
      )}
      {!enNegocio && (
        <div className="rv-stripe">
          <PaymentElement options={{ layout: "tabs" }} />
          <small className="rv-seguro"><Icono n="candado" />Pago seguro con Stripe. Nadie en el negocio ve ni guarda los datos de tu tarjeta.</small>
        </div>
      )}
      {p.politica && <p className="rv-politica"><b>Cancelaciones.</b> {p.politica}{p.monto > 0 && !enNegocio ? " Si cancelas a tiempo, se te devuelve lo pagado." : ""}</p>}
      {p.reembolso && <p className="rv-politica"><b>Reembolsos.</b> {p.reembolso}</p>}
      {error && <p className="aviso error" role="alert">{error}</p>}
      <footer className="rv-barra">
        <span className="rv-sum"><b>{formatoDinero(enNegocio ? p.total : p.monto + cargo)}</b><small>{enNegocio ? "Pagas en el negocio" : p.monto < p.total ? `Anticipo con cargo en línea` : "Incluye cargo en línea"}</small></span>
        {enNegocio
          ? <button type="button" className="bt" onClick={p.enNegocio}>Continuar</button>
          : <button type="button" className="bt" disabled={!stripe || pagando} onClick={pagar}>{pagando ? "Pagando…" : "Pagar y confirmar"}</button>}
      </footer>
    </>
  );
}
