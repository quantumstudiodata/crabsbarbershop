"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { cancelarVenta } from "./actions";

export function CancelarVenta({ id, folio, total, regreso, texto = "Cancelar" }: { id: string; folio: string; total: string; regreso: string; texto?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="icb peligro" onClick={() => setAbierto(true)} aria-label={`${texto} la venta ${folio}`} title={texto}><Icono n="basura" /></button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={`Venta ${folio}`} titulo={`¿${texto} esta venta de ${total}?`}>
        <form action={cancelarVenta} className="pila">
          <input type="hidden" name="ventaId" value={id} />
          <input type="hidden" name="regreso" value={regreso} />
          <p className="muted">No se borra.<br />Queda tachada, con tu nombre y el motivo, y deja de contar en las ventas.</p>
          <label className="campo"><span>Motivo</span><input className="input" name="motivo" placeholder="Ejemplo: se cobró dos veces" required autoFocus /></label>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt peligro">Sí, {texto.toLowerCase()}<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
