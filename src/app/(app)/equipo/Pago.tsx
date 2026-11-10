"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "../analitica/equipo/actions";

export type DatosFila = {
  id: string; nombre: string; avatar: string; modalidad: string; frecuencia: string; periodo: string; semana: string;
  renta: boolean; monto: string; estado: string; parcial: boolean; detalle: [string, string][]; puedePagar: boolean;
};

/** Desglose del periodo en curso y, con permiso, el registro del pago (o del cobro de renta). */
export function FormPago({ f, regreso }: { f: DatosFila; regreso: string }) {
  return (
    <div className="pila">
      <dl className="eq-desg">{f.detalle.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {f.puedePagar && (
        <form action={registrarPago} className="pila">
          <input type="hidden" name="barberoId" value={f.id} />
          <input type="hidden" name="semana" value={f.semana} />
          <input type="hidden" name="regreso" value={regreso} />
          <input type="hidden" name="tipo" value={f.renta ? "renta" : "pago"} />
          <div className="tarjeta-m">
            <label className="campo"><span>{f.renta ? "Monto recibido" : "Monto pagado"}</span><input className="input grande" name="monto" inputMode="decimal" placeholder={f.monto} required /></label>
            <label className="campo"><span>Nota</span><input className="input" name="nota" placeholder="Opcional" /></label>
          </div>
          <div className="acciones"><button className="bt">{f.renta ? "Registrar cobro" : "Registrar pago"}<Fl /></button></div>
        </form>
      )}
    </div>
  );
}

/** Botón único de Equipo: elige a la persona y registra su pago o el cobro de su renta. */
export function RegistrarPago({ filas, regreso, texto = "Registrar pago", clase = "eq2-pri" }: { filas: DatosFila[]; regreso: string; texto?: string; clase?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<DatosFila | null>(filas.length === 1 ? filas[0] : null);
  const cerrar = () => { setAbierto(false); setElegida(filas.length === 1 ? filas[0] : null); };
  if (!filas.length) return null;
  return (
    <>
      <button type="button" className={clase} onClick={() => setAbierto(true)}>{texto}</button>
      <Modal abierto={abierto} cerrar={cerrar} etiqueta={elegida ? elegida.periodo : "Pagos del equipo"} titulo={elegida ? elegida.nombre : "¿A quién?"}>
        {elegida ? (
          <div className="pila">
            {filas.length > 1 && <button type="button" className="eq2-atras" onClick={() => setElegida(null)}><Icono n="izquierda" />Elegir a otra persona</button>}
            <FormPago f={elegida} regreso={regreso} />
          </div>
        ) : (
          <div className="eq2-elige">
            {filas.map((f) => (
              <button type="button" key={f.id} className="eq2-fila" onClick={() => setElegida(f)}>
                <Avatar avatar={f.avatar} nombre={f.nombre} t={32} />
                <span><b>{f.nombre}</b><small>{f.renta ? "Renta de silla" : f.modalidad}, {f.frecuencia.toLowerCase()}</small></span>
                <span className="eq2-m"><b>{f.monto}</b><small>{f.renta ? "por cobrar" : "por pagar"}</small></span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
