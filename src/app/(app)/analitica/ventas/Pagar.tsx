"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "../equipo/actions";

export function Pagar({ id, nombre, semana, renta, pendiente, regreso }: { id: string; nombre: string; semana: string; renta: boolean; pendiente: string; regreso: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="bt solo chico" onClick={() => setAbierto(true)}><Icono n="efectivo" />Registrar pago</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={nombre} titulo="Registrar pago">
        <form action={registrarPago} className="pila">
          <input type="hidden" name="barberoId" value={id} />
          <input type="hidden" name="semana" value={semana} />
          <input type="hidden" name="regreso" value={regreso} />
          <div className="opciones-t" role="radiogroup">
            <label className="opcion-t"><input type="radio" name="tipo" value="pago" defaultChecked /><b>Pago del negocio</b><small>Lo que se le entrega por su trabajo</small></label>
            {renta && <label className="opcion-t"><input type="radio" name="tipo" value="renta" /><b>Pago de renta</b><small>Lo que entrega por usar la silla</small></label>}
          </div>
          <div className="tarjeta-m">
            <label className="campo"><span>Monto</span><input className="input grande" name="monto" inputMode="decimal" placeholder={pendiente} required autoFocus /></label>
            <label className="campo"><span>Nota</span><input className="input" name="nota" placeholder="Opcional" /></label>
          </div>
          <p className="ayuda-txt">Saldo en estas fechas: {pendiente}.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt">Guardar<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
