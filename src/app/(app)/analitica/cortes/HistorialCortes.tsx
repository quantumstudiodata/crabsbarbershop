"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { Corregir } from "./Corregir";

export type Corte = {
  id: string; folio: string; horario: string; dia: string;
  abrio: { nombre: string; avatar: string }; cerro: { nombre: string; avatar: string };
  metodos: { metodo: string; total: number }[]; total: number; ventas: number;
  fondo: number; ventasEfectivo: number; propinasEfectivo: number; entradas: number; retiros: number; gastos: number;
  esperado: number; contado: number; diferencia: number; notas: string | null;
  movimientos: { hora: string; titulo: string; detalle: string; monto: number }[];
  ajustes: string[];
};
export type DiaCortes = { fecha: string; titulo: string; total: number; diferencia: number; cortes: Corte[] };

export function HistorialCortes({ dias, corregir }: { dias: DiaCortes[]; corregir: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (dias.length === 0) return <p className="muted">No hay cortes en estas fechas.</p>;
  return (
    <div className="glass historial">
      <div className="hist-scroll" style={{ maxHeight: 680 }}>
        {dias.map((d) => (
          <div key={d.fecha}>
            <div className="hist-dia">
              <span>{d.titulo} - {d.cortes.length} {d.cortes.length === 1 ? "corte" : "cortes"}</span>
              <span className="fila" style={{ gap: 12 }}>
                {d.diferencia !== 0 && <span className="pill warn" style={{ padding: "2px 8px" }}>{d.diferencia > 0 ? "Sobraron" : "Faltaron"} {formatoDinero(Math.abs(d.diferencia))}</span>}
                <b className="num">{formatoDinero(d.total)}</b>
              </span>
            </div>
            {d.cortes.map((c) => (
              <div key={c.id} className={`hist-fila ${abierto === c.id ? "abierta" : ""}`}>
                <button type="button" className="hist-linea corte-l" aria-expanded={abierto === c.id} onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                  <span className="folio">{c.folio}</span>
                  <span className="t">{c.horario}</span>
                  <span className="quien"><Avatar avatar={c.cerro.avatar} nombre={c.cerro.nombre} t={24} />{c.cerro.nombre.split(" ")[0]}</span>
                  <span className="est-c">{c.diferencia === 0 ? <span className="cubierto"><i>✓</i>Coincidió</span> : <span className="est temp"><span className="d" style={{ background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />{c.diferencia > 0 ? "Sobraron" : "Faltaron"} {formatoDinero(Math.abs(c.diferencia))}</span>}</span>
                  <span className="num">{formatoDinero(c.total)}</span>
                  <Icono n="abajo" />
                </button>
                {abierto === c.id && (
                  <div className="corte-det">
                    <div className="resumen-c chico">
                      <span className="lab">Cobros del turno</span>
                      {c.metodos.map((m) => <div key={m.metodo}><span>{m.metodo}</span><span className="num">{formatoDinero(m.total)}</span></div>)}
                      <div className="total-c"><span>Total vendido, {c.ventas} {c.ventas === 1 ? "venta" : "ventas"}</span><b>{formatoDinero(c.total)}</b></div>
                    </div>
                    <div className="resumen-c chico">
                      <span className="lab">Conciliación de efectivo</span>
                      <div><span>Fondo inicial</span><span className="num">{formatoDinero(c.fondo)}</span></div>
                      <div><span>Ventas en efectivo</span><span className="num">+{formatoDinero(c.ventasEfectivo)}</span></div>
                      {c.propinasEfectivo > 0 && <div><span>Propinas en efectivo</span><span className="num">+{formatoDinero(c.propinasEfectivo)}</span></div>}
                      {c.entradas > 0 && <div><span>Entradas</span><span className="num">+{formatoDinero(c.entradas)}</span></div>}
                      <div><span>Retiros y gastos</span><span className="num">−{formatoDinero(c.retiros + c.gastos)}</span></div>
                      <div><span>Debía haber</span><span className="num">{formatoDinero(c.esperado)}</span></div>
                      <div className="total-c"><span>Se contó</span><b>{formatoDinero(c.contado)}</b></div>
                    </div>
                    <div className="pila-chica">
                      <span className="lab">Turno</span>
                      <span className="persona" style={{ fontSize: 13 }}><Avatar avatar={c.abrio.avatar} nombre={c.abrio.nombre} t={24} />Abrió {c.abrio.nombre.split(" ")[0]}</span>
                      <span className="persona" style={{ fontSize: 13 }}><Avatar avatar={c.cerro.avatar} nombre={c.cerro.nombre} t={24} />Cerró {c.cerro.nombre.split(" ")[0]}</span>
                      {c.movimientos.length > 0 && <span className="lab" style={{ marginTop: 8 }}>Movimientos</span>}
                      {c.movimientos.map((m, i) => <span key={i} className="mov-c"><span className="t">{m.hora}</span>{m.titulo}<small>{m.detalle}</small><b className="num">{formatoDinero(m.monto)}</b></span>)}
                      {c.notas && <><span className="lab" style={{ marginTop: 8 }}>Observaciones</span><p className="nota-c">{c.notas}</p></>}
                      {c.ajustes.map((a, i) => <p key={i} className="nota-c">{a}</p>)}
                      {corregir && <Corregir id={c.id} dia={c.dia} />}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
