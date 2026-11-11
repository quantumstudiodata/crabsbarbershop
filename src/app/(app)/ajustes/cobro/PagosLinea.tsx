"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { IconosPago } from "@/components/IconosPago";
import { formatoDinero } from "@/lib/money";
import { conectarStripe, revisarStripe } from "./actions";

type Estado = "sin" | "pendiente" | "activa";
const CHIP: Record<Estado, string> = { sin: "Sin conectar", pendiente: "Pendiente", activa: "Conectada" };

/** Pagos en línea, dentro de Cobros y métodos de pago: cada negocio conecta su propia cuenta de Stripe y recibe su dinero directo. */
export function PagosLinea({ estado, revisar, puede, mes, usos }: {
  estado: Estado; revisar: boolean; puede: boolean;
  mes: { cobrado: number; qr: number; anticipos: number };
  usos: { qr: boolean; anticipo: string };
}) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Al regresar de Stripe se consulta si la cuenta ya quedó lista.
    if (revisar) iniciar(async () => { const r = await revisarStripe(); if (r.error) setError(r.error); router.replace("/ajustes/cobro"); router.refresh(); });
  }, [revisar]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = () => iniciar(async () => { setError(null); const r = await conectarStripe(); if (r.url) window.location.href = r.url; else setError(r.error ?? "No se pudo abrir Stripe."); });
  const boton = puede && estado !== "activa" && (
    <button type="button" className="bt" disabled={pend} onClick={abrir}>{pend ? "Abriendo Stripe…" : estado === "sin" ? "Conectar con Stripe" : "Continuar en Stripe"}<span className="fl" aria-hidden="true"><Icono n="derecha" /></span></button>
  );
  return (
    <section className="pa-sub" aria-label="Pagos en línea">
        <div className="entre"><span className="pa-marca"><span className="pm-qr"><Icono n="cuadros" /></span><span className="pa-nom"><b>Pagos en línea</b><small>Con Stripe: Pago con QR y anticipos de citas</small></span></span><span className={`pl-chip ${estado === "activa" ? "on" : ""}`}>{CHIP[estado]}</span></div>
        {estado === "activa" ? (
          <>
            <div className="pl-fila"><span>Cobrado en línea este mes</span><b>{formatoDinero(mes.cobrado)}</b></div>
            <div className="pl-fila"><span>Pagos con QR</span><b>{mes.qr}</b></div>
            <div className="pl-fila"><span>Anticipos de citas</span><b>{mes.anticipos}</b></div>
          </>
        ) : (
          <>
            <span className="pl-t"><b>Cobra con tarjeta desde el teléfono del cliente</b><small>El dinero llega directo a tu cuenta bancaria. Stripe confirma cada pago.</small></span>
            <div className="pa-pasos">
              <div className={estado === "pendiente" ? "hecho" : ""}><i>{estado === "pendiente" ? <Icono n="palomita" /> : 1}</i><span>Conecta tu cuenta<small>Stripe te pide tus datos y tu cuenta bancaria.</small></span></div>
              <div className={estado === "pendiente" ? "ahora" : ""}><i>2</i><span>Stripe revisa<small>{estado === "pendiente" ? "En revisión. Si te faltó algo, continúa donde te quedaste." : "Tarda unos minutos."}</small></span></div>
              <div><i>3</i><span>Listo<small>Aparece Pago con QR en Cobro.</small></span></div>
            </div>
          </>
        )}
        <span className="sub-a pa-sub-t">{estado === "activa" ? "Con qué puede pagar el cliente" : "Tus clientes podrán pagar con"}</span>
        <IconosPago />
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        {boton}
        {estado === "activa" && <a className="eq2-link" href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">Abrir el panel de Stripe</a>}
        <div className="pa-usos">
          <div className="pl-fila"><span>Pago con QR en Cobro</span><b>{usos.qr ? "Activo" : "Al conectar"}</b></div>
          <div className="pl-fila"><span>Anticipo al reservar una cita</span><b>{usos.anticipo}</b></div>
          <Link href="/ajustes/citas" className="eq2-link">Configurar el anticipo en Citas y agenda</Link>
        </div>
        <small className="pl-nota"><Icono n="candado" />Crabs nunca ve ni guarda datos de tarjetas. Un pago cuenta solo cuando Stripe lo confirma.</small>
    </section>
  );
}
