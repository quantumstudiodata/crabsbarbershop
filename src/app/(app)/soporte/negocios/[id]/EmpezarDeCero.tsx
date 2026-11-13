"use client";

import { useActionState, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { empezarDeCeroNegocio, type EstadoSoporte } from "../../actions";

type Conteo = { ventas: number; egresos: number; cortes: number; pagos: number; citas: number; historial: number };

/** Quita todo lo que se registró en pruebas y deja la configuración como está. */
export function EmpezarDeCero({ id, nombre, conteo }: { id: string; nombre: string; conteo: Conteo }) {
  const [abierto, setAbierto] = useState(false);
  const [vez, setVez] = useState(0);
  return (
    <section className="glass panel-s cero-s">
      <div>
        <b>Empezar de cero</b>
        <small>Borra ventas, cortes, egresos, pagos al equipo, citas e historial. Cuentas, servicios, precios y ajustes se quedan igual.</small>
      </div>
      <button type="button" className="bt peligro chico" onClick={() => { setAbierto(true); setVez((n) => n + 1); }}><Icono n="basura" />Empezar de cero</button>
      {abierto && <Confirmar key={vez} id={id} nombre={nombre} conteo={conteo} cerrar={() => setAbierto(false)} />}
    </section>
  );
}

function Confirmar({ id, nombre, conteo, cerrar }: { id: string; nombre: string; conteo: Conteo; cerrar: () => void }) {
  const [e, enviar, trabajando] = useActionState<EstadoSoporte, FormData>(empezarDeCeroNegocio, {});
  return (
    <Modal abierto cerrar={cerrar} etiqueta={nombre} titulo={`Empezar de cero en ${nombre}`}>
      {e.ok ? <p className="aviso ok">{e.mensaje}</p> : (
        <form action={enviar} className="pila">
          <input type="hidden" name="negocioId" value={id} />
          <div className="aviso-borrar">
            <span className="icono-alerta grande"><Icono n="basura" /></span>
            <p><b>Se borran para siempre:</b> {conteo.ventas} ventas, {conteo.cortes} cortes de caja, {conteo.egresos} egresos, {conteo.pagos} pagos al equipo, {conteo.citas} citas con sus reseñas y {conteo.historial} registros del historial.</p>
          </div>
          <p className="muted chico-t">Se conservan las cuentas y contraseñas, servicios, precios, formas de pago, horarios, metas y todos los ajustes. Los folios vuelven a empezar en 1. No se puede deshacer.</p>
          <label className="campo"><span>Escribe {nombre} para confirmar</span><input className="input" name="confirmar" autoComplete="off" required /></label>
          {e.error && <p className="aviso error">{e.error}</p>}
          <div className="acciones"><button className="bt peligro" disabled={trabajando}>{trabajando ? "Borrando…" : "Borrar movimientos"}<Fl /></button></div>
        </form>
      )}
    </Modal>
  );
}
