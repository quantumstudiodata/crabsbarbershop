"use client";

import { useState } from "react";
import { formatoDinero } from "@/lib/money";
import { Icono } from "./Icono";

export type CuentaTransferencia = { banco: string; clabe: string; titular: string };
const agrupar = (c: string) => c.replace(/(\d{3})(\d{3})(\d{11})(\d)/, "$1 $2 $3 $4");

/** Datos para transferir a la cuenta del negocio: CLABE grande, cada dato se copia con un toque. */
export function DatosTransferencia({ cuenta, monto, concepto, compartir }: { cuenta: CuentaTransferencia; monto?: number; concepto?: string; compartir?: boolean }) {
  const [copiado, setCopiado] = useState("");
  const copiar = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopiado(k); setTimeout(() => setCopiado(""), 1600); } catch { /* sin portapapeles */ } };
  const texto = [`Banco: ${cuenta.banco}`, `CLABE: ${cuenta.clabe}`, `A nombre de: ${cuenta.titular}`, ...(monto ? [`Monto: ${formatoDinero(monto)}`] : []), ...(concepto ? [`Concepto: ${concepto}`] : [])].join("\n");
  const fila = (k: string, t: string, v: string, mostrar = v) => (
    <button type="button" className="dt-f" onClick={() => copiar(k, v)}>
      <span><small>{t}</small><b>{mostrar}</b></span>
      <span className={`dt-c ${copiado === k ? "ok" : ""}`}><Icono n={copiado === k ? "palomita" : "copiar"} />{copiado === k ? "Copiado" : "Copiar"}</span>
    </button>
  );
  return (
    <div className="dt">
      <div className="dt-cab"><span className="dt-i" aria-hidden="true"><Icono n="cobro" /></span><span><b>Transferencia</b><small>{cuenta.banco}, sin comisión</small></span>{monto ? <b className="dt-m">{formatoDinero(monto)}</b> : null}</div>
      {fila("clabe", "CLABE", cuenta.clabe, agrupar(cuenta.clabe))}
      {fila("titular", "A nombre de", cuenta.titular)}
      {concepto && fila("concepto", "Concepto", concepto)}
      <div className="dt-acc">
        <button type="button" className="bt sec chico" onClick={() => copiar("todo", texto)}><Icono n={copiado === "todo" ? "palomita" : "copiar"} />{copiado === "todo" ? "Datos copiados" : "Copiar todo"}</button>
        {compartir && <a className="bt sec chico" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><Icono n="enviar" />WhatsApp</a>}
      </div>
    </div>
  );
}
