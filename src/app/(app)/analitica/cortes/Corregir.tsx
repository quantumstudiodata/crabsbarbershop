"use client";

import { useState } from "react";
import { Fl } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { corregirCierre } from "../../caja/actions";

export function Corregir({ id, dia }: { id: string; dia: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="enlace" onClick={() => setAbierto(true)} aria-label={`Registrar un ajuste al corte del ${dia}`}>Registrar ajuste</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={`Corte del ${dia}`} titulo="Ajuste posterior al corte">
        <form action={corregirCierre} className="pila">
          <input type="hidden" name="turnoId" value={id} />
          <p className="muted">Sirve cuando, después de cerrar, aparece dinero que no se contó o se descubre un faltante.<br />El corte original no cambia: se agrega este ajuste con tu nombre y el motivo.</p>
          <div className="seg" role="radiogroup" aria-label="Tipo de corrección">
            <label><input type="radio" name="signo" value="mas" defaultChecked />Apareció dinero</label>
            <label><input type="radio" name="signo" value="menos" />Faltó dinero</label>
          </div>
          <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
          <label className="campo"><span>Motivo</span><input className="input" name="motivo" placeholder="Ejemplo: se encontró un billete en el cajón" required /></label>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt">Guardar ajuste<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
