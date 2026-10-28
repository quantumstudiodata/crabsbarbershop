"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "./actions";

export function Pagar({ id, nombre, semana, renta, pendiente }: { id: string; nombre: string; semana: string; renta: boolean; pendiente: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="bt sec solo" style={{ fontSize: 13 }} onClick={() => setAbierto(true)}><Icono n="efectivo" />Registrar pago</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={nombre} titulo="Registrar pago">
        <form action={registrarPago} className="pila">
          <input type="hidden" name="barberoId" value={id} />
          <input type="hidden" name="semana" value={semana} />
          <div className="seg" role="radiogroup" aria-label="Tipo de pago">
            <label><input type="radio" name="tipo" value="pago" defaultChecked />Pago del negocio</label>
            {renta && <label><input type="radio" name="tipo" value="renta" />Pago de renta</label>}
          </div>
          <p className="ayuda-txt">Pago del negocio: lo que se le entrega por su trabajo. {renta ? "Pago de renta: lo que entrega por usar la silla." : ""} Saldo de la semana: {pendiente}.</p>
          <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required autoFocus /></label>
          <label className="campo"><span>Nota</span><input className="input" name="nota" placeholder="Opcional" /></label>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt">Guardar<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
