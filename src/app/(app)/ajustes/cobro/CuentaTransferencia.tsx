"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { guardarCuentaTransferencia } from "./actions";

/** Cuenta propia para transferencias: se muestra al cobrar con Transferencia y al reservar. No cobra comisión. */
export function CuentaTransferencia({ cuenta }: { cuenta: { banco: string; clabe: string; titular: string } }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(cuenta);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const guardar = (x: typeof d) => iniciar(async () => {
    const r = await guardarCuentaTransferencia(x);
    if (r.error) { setError(r.error); return; }
    setError(null); setAbierto(false); router.refresh();
  });
  return (
    <div className="pila-chica">
      <span className="sub-a">Cuenta para transferencias</span>
      <div className="lista-cfg">
        <div>
          <span><b>{cuenta.clabe ? `${cuenta.banco}, CLABE terminación ${cuenta.clabe.slice(-4)}` : "Sin cuenta"}</b>
            <small>{cuenta.clabe ? `A nombre de ${cuenta.titular}. Se muestra al cobrar con Transferencia y al reservar.` : "Agrégala para mostrar tus datos al cobrar con Transferencia y dar esa opción al reservar. No cobra comisión."}</small></span>
          <span className={`chip-p ${cuenta.clabe ? "si" : ""}`}>{cuenta.clabe ? "Activa" : "Sin datos"}</span>
          <button type="button" className="bt sec solo chico" onClick={() => { setD(cuenta); setError(null); setAbierto(true); }}><Icono n={cuenta.clabe ? "editar" : "mas"} />{cuenta.clabe ? "Editar" : "Agregar"}</button>
        </div>
      </div>
      {abierto && (
        <Modal abierto cerrar={() => setAbierto(false)} etiqueta="Cuenta para transferencias" titulo="Cuenta para transferencias">
          <form className="pila" onSubmit={(e) => { e.preventDefault(); guardar(d); }}>
            <label className="campo"><span>Banco</span><input className="input" value={d.banco} onChange={(e) => setD({ ...d, banco: e.target.value })} maxLength={40} placeholder="Ejemplo: BBVA" /></label>
            <label className="campo"><span>CLABE</span><input className="input" inputMode="numeric" value={d.clabe} onChange={(e) => setD({ ...d, clabe: e.target.value.replace(/[^\d ]/g, "") })} maxLength={22} placeholder="18 dígitos" /></label>
            <label className="campo"><span>A nombre de</span><input className="input" value={d.titular} onChange={(e) => setD({ ...d, titular: e.target.value })} maxLength={80} placeholder="Como aparece en el banco" /></label>
            <small className="muted">Se comparte con tus clientes para que te paguen. Revisa que esté bien escrita.</small>
            {error && <p className="aviso error" role="alert">{error}</p>}
            <div className="acciones">
              {cuenta.clabe && <button type="button" className="link-c peligro-t" disabled={pend} onClick={() => guardar({ banco: "", clabe: "", titular: "" })}>Quitar cuenta</button>}
              <button type="submit" className="bt" disabled={pend}>{pend ? "Guardando…" : "Guardar"}<Fl /></button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
