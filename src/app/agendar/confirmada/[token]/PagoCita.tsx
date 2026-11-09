"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type ElementPago = { mount(target: HTMLElement): void; unmount(): void };
type AccionesCheckout = { confirm(): Promise<{ error?: { message?: string } } | undefined> };
type CheckoutSdk = {
  session?: { total?: { total?: { amount?: string } } };
  createPaymentElement(): ElementPago;
  loadActions(): Promise<{ actions?: AccionesCheckout; error?: { message?: string } }>;
};
type StripeSdk = { initCheckoutElementsSdk(options: { clientSecret: string }): CheckoutSdk };
declare global { interface Window { Stripe?: (key: string) => StripeSdk } }

export function PagoCita({ token, precio }: { token: string; precio: number }) {
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [stripeReady, setStripeReady] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [montoStripe, setMontoStripe] = useState("");
  const mountRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<AccionesCheckout | null>(null);
  const elementRef = useRef<ElementPago | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let alive = true;
    setCargando(true); setError(""); setEstado(""); setListo(false); setClientSecret("");
    fetch(`/api/agendar/cita/${token}/checkout`, { method: "POST" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "No se pudo preparar el pago."); return d; })
      .then((d) => {
        if (!alive) return;
        if (d.pagada) { setEstado("Esta cita ya aparece pagada."); return; }
        setClientSecret(d.clientSecret);
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "No se pudo preparar el pago."); })
      .finally(() => { if (alive) setCargando(false); });
    return () => { alive = false; };
  }, [abierto, token]);

  useEffect(() => {
    if (!abierto || !clientSecret || !stripeReady || !mountRef.current || !window.Stripe) return;
    let alive = true;
    const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishable) { setError("Falta configurar la clave pública de Stripe."); return; }
    const checkout = window.Stripe(publishable).initCheckoutElementsSdk({ clientSecret });
    const element = checkout.createPaymentElement();
    elementRef.current = element;
    element.mount(mountRef.current);
    setMontoStripe(checkout.session?.total?.total?.amount ?? "");
    checkout.loadActions().then((r) => {
      if (!alive) return;
      if (r.error || !r.actions) setError(r.error?.message ?? "No se pudo preparar el formulario de pago.");
      else { actionsRef.current = r.actions; setListo(true); }
    }).catch(() => { if (alive) setError("No se pudo cargar el formulario de pago."); });
    return () => {
      alive = false; actionsRef.current = null; elementRef.current?.unmount(); elementRef.current = null;
    };
  }, [abierto, clientSecret, stripeReady]);

  async function pagar() {
    if (!actionsRef.current) return;
    setEnviando(true); setError("");
    try {
      const r = await actionsRef.current.confirm();
      if (r?.error) setError(r.error.message ?? "No se pudo completar el pago. Revisa los datos e intenta otra vez.");
      else setEstado("El pago se envió a Stripe. Esta página mostrará el estado en cuanto Stripe lo confirme.");
    } catch { setError("No se pudo completar el pago. Intenta de nuevo o paga al llegar."); }
    finally { setEnviando(false); }
  }

  return (
    <>
      <Script src="https://js.stripe.com/basil/stripe.js" strategy="afterInteractive" onReady={() => setStripeReady(true)} />
      <button className="bt solo" type="button" onClick={() => setAbierto(true)}>Pagar {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(precio / 100)} en línea</button>
      {abierto && <div className="cita-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) setAbierto(false); }}>
        <section className="glass modal cita-pago" role="dialog" aria-modal="true" aria-labelledby="titulo-pago">
          <header className="modal-h"><div><span className="lab">PAGO SEGURO</span><h2 id="titulo-pago" className="titulo">Completa tu pago</h2></div><button className="icb" aria-label="Cerrar" disabled={enviando} onClick={() => setAbierto(false)}>×</button></header>
          <div className="modal-c">
            <div className="agendar-resumen"><span>Total de la cita</span><b>{montoStripe || new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(precio / 100)}</b></div>
            {cargando && <p className="muted">Preparando el pago…</p>}
            <div ref={mountRef} className="stripe-element" />
            {error && <p className="aviso error" role="alert">{error}</p>}
            {estado && <p className="aviso" role="status">{estado}</p>}
            <div className="acciones">
              <button className="bt sec solo" type="button" disabled={enviando} onClick={() => setAbierto(false)}>Pagar al llegar</button>
              <button className="bt solo" type="button" disabled={!listo || enviando} onClick={pagar}>{enviando ? "Procesando…" : "Pagar ahora"}</button>
            </div>
            <small className="muted">Los datos de pago van directamente a Stripe. Crabs no guarda los datos de tu tarjeta.</small>
          </div>
        </section>
      </div>}
    </>
  );
}
