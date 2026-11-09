"use client";

import { useState } from "react";
import { Fl } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { corregirCierre } from "../../caja/actions";

/** Ajuste posterior a un corte. Se puede abrir con su propio botón o desde fuera (por ejemplo, desde el comprobante). */
export function Corregir({ id, dia, abierto: controlado, cerrar: cerrarFuera }: { id: string; dia: string; abierto?: boolean; cerrar?: () => void }) {
  const [propio, setPropio] = useState(false);
  const abierto = controlado ?? propio;
  const cerrar = cerrarFuera ?? (() => setPropio(false));
  return (
    <>
      {controlado === undefined && <button type="button" className="enlace" onClick={() => setPropio(true)} aria-label={`Registrar un ajuste al corte del ${dia}`}>Registrar ajuste</button>}
      <Modal abierto={abierto} cerrar={cerrar} etiqueta={`Corte del ${dia}`} titulo="Ajuste posterior al corte">
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
            <button className="bt">Guardar ajuste<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
