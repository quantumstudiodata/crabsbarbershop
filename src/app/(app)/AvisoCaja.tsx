"use client";

import Link from "next/link";
import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";

/** Para barberos: ventana emergente cuando la caja de ayer sigue abierta. */
export function AvisoCajaEmergente({ dia }: { dia: string }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta="Caja" titulo={`La caja del ${dia} no se cerró`}>
      <div className="cronometro"><span className="exito alerta-i"><Icono n="reloj" /></span><p className="muted">Ya pasaron las 12 de la noche.<br />Haz el corte de caja para poder seguir cobrando.</p></div>
      <div className="acciones">
        <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Después</button>
        <Link className="bt" href="/cobrar?caja=cerrar">Hacer corte de caja<Fl /></Link>
      </div>
    </Modal>
  );
}
