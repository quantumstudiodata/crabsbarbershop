"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "../../analitica/equipo/actions";

export type DatosFila = {
  id: string; nombre: string; avatar: string; modalidad: string; frecuencia: string; periodo: string; semana: string;
  renta: boolean; monto: string; estado: string; parcial: boolean; detalle: [string, string][]; puedePagar: boolean;
};

/** Fila de Pagos: al tocarla se ve el desglose del periodo y, con permiso, se registra el pago. */
export function FilaPago({ f }: { f: DatosFila }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="eq-fila pg" onClick={() => setAbierto(true)}>
        <Avatar avatar={f.avatar} nombre={f.nombre} t={34} />
        <span className="eq-m"><b>{f.nombre}</b><small>{f.modalidad}</small><small>{f.frecuencia}</small></span>
        <span className="eq-r"><b className="eq-monto">{f.monto}</b><small className={`eq-est ${f.parcial ? "parcial" : ""}`}>{f.estado}</small></span>
      </button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={f.periodo} titulo={f.nombre}>
        <div className="pila">
          <dl className="eq-desg">{f.detalle.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {f.puedePagar && (
            <form action={registrarPago} className="pila">
              <input type="hidden" name="barberoId" value={f.id} />
              <input type="hidden" name="semana" value={f.semana} />
              <input type="hidden" name="regreso" value="/equipo/pagos" />
              <input type="hidden" name="tipo" value={f.renta ? "renta" : "pago"} />
              <div className="tarjeta-m">
                <label className="campo"><span>{f.renta ? "Monto recibido" : "Monto pagado"}</span><input className="input grande" name="monto" inputMode="decimal" placeholder={f.monto} required /></label>
                <label className="campo"><span>Nota</span><input className="input" name="nota" placeholder="Opcional" /></label>
              </div>
              <div className="acciones"><button className="bt">{f.renta ? "Registrar cobro" : "Registrar pago"}<Fl /></button></div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}
