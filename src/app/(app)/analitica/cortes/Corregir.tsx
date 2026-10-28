"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { corregirCierre } from "../../caja/actions";

export function Corregir({ id, dia }: { id: string; dia: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="icb" onClick={() => setAbierto(true)} aria-label={`Corregir el corte del ${dia}`} title="Corregir"><Icono n="editar" /></button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={`Corte del ${dia}`} titulo="Corregir el corte">
        <form action={corregirCierre} className="pila">
          <input type="hidden" name="turnoId" value={id} />
          <p className="muted">El corte original no cambia.<br />Se agrega una corrección con tu nombre y el motivo.</p>
          <div className="seg" role="radiogroup" aria-label="Tipo de corrección">
            <label><input type="radio" name="signo" value="mas" defaultChecked />Apareció dinero</label>
            <label><input type="radio" name="signo" value="menos" />Faltó dinero</label>
          </div>
          <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
          <label className="campo"><span>Motivo</span><input className="input" name="motivo" placeholder="Ejemplo: se encontró un billete en el cajón" required /></label>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt">Guardar corrección<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
