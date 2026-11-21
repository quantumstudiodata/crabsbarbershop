"use client";

import { Icono } from "@/components/Icono";
import { abrirMovimientoCaja } from "../../cobrar/CajaModal";

/** Movimiento de caja desde Movimientos, para quien no usa la pantalla de Cobro. */
export function BotonCaja({ abierta, pendiente = false }: { abierta: boolean; /** Hay algo pendiente de depositar a la dueña: se puede registrar aunque la caja esté cerrada. */ pendiente?: boolean }) {
  return abierta || pendiente
    ? <button type="button" className="bt sec chico" onClick={abrirMovimientoCaja}><Icono n="salida" />Movimiento de caja</button>
    : <span className="muted chico-t" title="Los movimientos de caja se registran mientras la caja está abierta">Caja cerrada</span>;
}
