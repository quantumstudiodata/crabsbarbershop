"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { anularPagoEquipo } from "../../analitica/equipo/actions";

/** Anular un pago o cobro de renta del historial, con su motivo. */
export function AnularPago({ id, texto }: { id: string; texto: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  return (
    <>
      <button type="button" className="pg-anular" aria-label={`Anular: ${texto}`} title="Anular registro" onClick={() => setAbierto(true)}><Icono n="basura" /></button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta="Historial de pagos" titulo="¿Anular este registro?">
        <div className="pila">
          <p className="muted" style={{ margin: 0 }}>{texto}. Queda en el historial en cero y el monto vuelve a contar como pendiente.</p>
          <label className="campo"><span>Motivo</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo, no pagó la renta esta semana" /></label>
          {error && <p className="aviso error">{error}</p>}
          <div className="acciones"><button type="button" className="bt peligro" disabled={pend || !motivo.trim()} onClick={() => iniciar(async () => { const r = await anularPagoEquipo(id, motivo); if (r.error) setError(r.error); else { setAbierto(false); router.refresh(); } })}>{pend ? "Anulando…" : "Sí, anular"}</button></div>
        </div>
      </Modal>
    </>
  );
}
