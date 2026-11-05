"use client";

import { useActionState, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { type EstadoLimpieza, limpiarDatosDePrueba } from "./actions";

export function Limpiar({ negocio }: { negocio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [e, accion, borrando] = useActionState<EstadoLimpieza, FormData>(limpiarDatosDePrueba, {});
  return (
    <>
      {e.ok && <p className="aviso ok">{e.resumen}</p>}
      <button type="button" className="bt peligro" onClick={() => setAbierto(true)}><Icono n="basura" />Borrar datos de prueba</button>
      <Modal abierto={abierto && !e.ok} cerrar={() => setAbierto(false)} etiqueta="Soporte" titulo={`¿Dejar ${negocio} como recién instalado?`}>
        <form action={accion} className="pila">
          <div className="aviso-borrar">
            <span className="icono-alerta grande"><Icono n="basura" /></span>
            <p><b>Se borran para siempre:</b> ventas, cobros, propinas, cortes de caja, movimientos de caja, egresos y comprobantes, pagos al equipo, ideas, solicitudes de contraseña e historial. También las cuentas que ya estaban eliminadas.</p>
          </div>
          <p className="muted" style={{ fontSize: 13 }}><b>Se conservan:</b> las cuentas activas, servicios y precios, formas de pago, categorías, conceptos frecuentes, ajustes y los meses capturados del Excel. Los folios vuelven a empezar en 1.</p>
          <label className="campo"><span>Escribe BORRAR para confirmar</span><input className="input" name="confirmar" autoComplete="off" required /></label>
          {e.error && <p className="aviso error">{e.error}</p>}
          <div className="acciones">
            <button className="bt peligro" disabled={borrando}>{borrando ? "Borrando…" : "Sí, borrar todo"}<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
