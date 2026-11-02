"use client";

import Link from "next/link";
import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";

/** Para barberos: ventana emergente cuando la caja de un día anterior sigue abierta. */
export function AvisoCajaEmergente({ dia }: { dia: string }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta="Cierre de caja" titulo="Tienes un corte de caja pendiente" sinX>
      <div className="aviso-corte">
        <span className="reloj-suave"><Icono n="reloj" /></span>
        <div>
          <span className="pill-caja"><i />La caja sigue abierta</span>
          <p>La jornada del {dia} aún no se ha cerrado. Realiza el corte para registrar el efectivo y finalizar el día.</p>
        </div>
      </div>
      <div className="acciones">
        <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Recordármelo después</button>
        <Link className="bt principal-corte" href="/cobrar?caja=cerrar">Realizar corte de caja<Fl /></Link>
      </div>
    </Modal>
  );
}
