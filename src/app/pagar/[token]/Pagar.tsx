"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icono } from "@/components/Icono";
import { PalomitaAnimada } from "@/components/PalomitaAnimada";
import { formatoDinero } from "@/lib/money";
import { elegirPropina, estadoPago } from "../actions";

type Concepto = { nombre: string; con: string; precio: number; precioTxt: string };

const apariencia = {
  theme: "stripe" as const,
  variables: { colorPrimary: "#13171c", colorText: "#13171c", colorTextSecondary: "#56616c", borderRadius: "12px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", spacingUnit: "4px" },
};

/** Página de pago del cliente: lo que paga, propina opcional y el formulario de Stripe. */
export function Pagar(p: {
  token: string; negocio: string; estado: string; cuenta: string; secreto: string | null; llavePublica: string;
  conceptos: Concepto[]; descuento: number; monto: number; propina: number; cargo: number; propinaFija: boolean; folio: string | null; tarjeta: string; encuesta: string | null; pagadoTxt: string | null;
}) {
  const promesa = useMemo<Promise<Stripe | null> | null>(() => (p.llavePublica && p.cuenta ? loadStripe(p.llavePublica, { stripeAccount: p.cuenta, locale: "es-419" }) : null), [p.llavePublica, p.cuenta]);
  return (
    <main className="pg">
      <header className="pg-cab"><span className="rv-logo" aria-hidden="true"><Icono n="cobro" /></span><span><b>{p.negocio}</b><small>Pago de tu servicio</small></span></header>
      {p.estado === "pagado" ? <Recibo {...p} />
        : p.estado === "reembolsado" ? <Aviso t="Este pago se devolvió" x="Si tienes dudas, pregunta en el negocio." />
        : p.estado === "cancelado" ? <Aviso t="Este cobro se canceló" x="Pide en el negocio un código nuevo para pagar." />
        : !p.secreto || !promesa ? <Aviso t="El pago no está disponible por ahora" x="Paga directamente en el negocio." />
        : <Elements stripe={promesa} options={{ clientSecret: p.secreto, appearance: apariencia }}><Formulario {...p} /></Elements>}
    </main>
  );
}

function Conceptos({ conceptos, descuento }: { conceptos: Concepto[]; descuento: number }) {
  return (
    <section className="pg-lista">
      {conceptos.map((c, i) => <div key={i}><span>{c.nombre}{c.con ? <small>con {c.con}</small> : null}</span><b>{c.precioTxt}</b></div>)}
      {descuento > 0 && <div><span>Descuento</span><b>−{formatoDinero(descuento)}</b></div>}
    </section>
  );
}

function Formulario(p: Parameters<typeof Pagar>[0]) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [propina, setPropina] = useState(p.propina);
  const [cargo, setCargo] = useState(p.cargo);
  const [otra, setOtra] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opciones = [0, 10, 15, 20].map((pct) => ({ pct, monto: Math.round((p.monto * pct) / 100 / 100) * 100 }));
  const total = p.monto + propina + cargo;
  const cambiar = async (monto: number) => {
    if (p.propinaFija || monto === propina) return;
    setCambiando(true); setError(null);
    const r = await elegirPropina(p.token, monto);
    if (r.error) setError(r.error); else { setPropina(monto); setCargo(r.cargo ?? 0); await elements?.fetchUpdates(); }
    setCambiando(false);
  };
  // Después de pagar, espera la confirmación de Stripe para mostrar el comprobante.
  useEffect(() => {
    if (!listo) return;
    const t = setInterval(async () => { const r = await estadoPago(p.token); if (r.estado === "pagado") { clearInterval(t); router.refresh(); } }, 2000);
    return () => clearInterval(t);
  }, [listo, p.token, router]);
  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPagando(true); setError(null);
    const r = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (r.error) { setError(r.error.message ?? "No se pudo completar el pago."); setPagando(false); return; }
    setListo(true);
  };
  if (listo) return <Aviso t="Confirmando tu pago…" x="Esto tarda unos segundos. No cierres esta página." espera />;
  return (
    <form className="pg-form" onSubmit={pagar}>
      <Conceptos conceptos={p.conceptos} descuento={p.descuento} />
      {!p.propinaFija && (
        <div className="pg-prop">
          <span className="lab">¿Agregar propina?</span>
          <div className="pg-chips">
            {opciones.map((o) => <button type="button" key={o.pct} disabled={cambiando} className={propina === o.monto && !otra ? "on" : ""} onClick={() => { setOtra(""); cambiar(o.monto); }}>{o.pct ? `${o.pct}%` : "Sin propina"}</button>)}
          </div>
          <label className="pg-otra"><span>Otra cantidad</span><input inputMode="decimal" placeholder="$0" value={otra} onChange={(e) => setOtra(e.target.value.replace(/[^\d.]/g, ""))}
            onBlur={() => { const v = Math.round(Number(otra || 0) * 100); if (otra) cambiar(Math.min(Math.max(v, 0), p.monto)); }} /></label>
        </div>
      )}
      {cargo > 0 && <div className="pg-cargo"><span>Comisión por pago con tarjeta</span><b>{formatoDinero(cargo)}</b></div>}
      <div className="pg-stripe"><PaymentElement options={{ layout: "tabs" }} /></div>
      <small className="pg-seguro">Pago seguro con Stripe. {p.negocio} y Crabs no ven ni guardan los datos de tu tarjeta.</small>
      {error && <p className="aviso error" role="alert">{error}</p>}
      <div className="pg-pie">
        <span><small>{propina > 0 ? "Total con propina" : "Total"}{cargo > 0 ? " y comisión" : ""}</small><b>{formatoDinero(total)}</b></span>
        <button className="bt grande" disabled={!stripe || pagando || cambiando}>{pagando ? "Pagando…" : `Pagar ${formatoDinero(total)}`}</button>
      </div>
    </form>
  );
}

function Recibo(p: Parameters<typeof Pagar>[0]) {
  return (
    <>
      <section className="pg-ok" role="status">
        <PalomitaAnimada />
        <h1>Pago recibido</h1>
        <b className="big">{formatoDinero(p.monto + p.propina + p.cargo)}</b>
        <span className="muted">Confirmado por Stripe{p.tarjeta ? `, con ${p.tarjeta}` : ""}</span>
      </section>
      <section className="glass pg-comp" aria-label="Comprobante">
        <b>Comprobante</b>
        <div className="entre"><span className="muted">Negocio</span><span>{p.negocio}</span></div>
        {p.folio && <div className="entre"><span className="muted">Folio</span><b>{p.folio}</b></div>}
        {p.pagadoTxt && <div className="entre"><span className="muted">Fecha</span><span>{p.pagadoTxt}</span></div>}
        <Conceptos conceptos={p.conceptos} descuento={p.descuento} />
        {p.propina > 0 && <div className="entre"><span className="muted">Propina</span><span>{formatoDinero(p.propina)}</span></div>}
        {p.cargo > 0 && <div className="entre"><span className="muted">Comisión por pago con tarjeta</span><span>{formatoDinero(p.cargo)}</span></div>}
        <div className="entre pg-tot"><span>Total pagado</span><b>{formatoDinero(p.monto + p.propina + p.cargo)}</b></div>
        <small className="muted">Guarda esta página: es tu comprobante y siempre muestra el estado real del pago.</small>
      </section>
      {p.encuesta && (
        <a className="glass pg-enc" href={`/e/${p.encuesta}`}>
          <Icono n="estrella" /><span><b>¿Cómo te atendimos?</b><small>Son dos preguntas, menos de un minuto.</small></span><Icono n="derecha" />
        </a>
      )}
    </>
  );
}

function Aviso({ t, x, espera }: { t: string; x: string; espera?: boolean }) {
  return <section className="pg-aviso" role="status">{espera && <span className="pg-spin" aria-hidden="true" />}<b>{t}</b><span className="muted">{x}</span></section>;
}
