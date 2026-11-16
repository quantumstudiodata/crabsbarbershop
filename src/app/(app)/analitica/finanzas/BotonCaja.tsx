"use client";

import { Icono } from "@/components/Icono";
import { abrirMovimientoCaja } from "../../cobrar/CajaModal";

/** Movimiento de caja desde Movimientos, para quien no usa la pantalla de Cobro. */
export function BotonCaja({ abierta }: { abierta: boolean }) {
  return abierta
    ? <button type="button" className="bt sec chico" onClick={abrirMovimientoCaja}><Icono n="salida" />Movimiento de caja</button>
    : <span className="muted chico-t" title="Los movimientos de caja se registran mientras la caja está abierta">Caja cerrada</span>;
}
