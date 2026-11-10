"use client";

import { useState } from "react";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { Cancelar, type FilaEgreso, Nuevo, type OpcionesEgreso } from "../gastos/Egresos";

export type Movimiento = {
  id: string; tipo: "venta" | "egreso" | "pago" | "renta"; titulo: string; sub: string; monto: number; cancelado?: boolean;
  detalle: [string, string][]; comprobante?: { id: string; nombre: string }; egreso?: FilaEgreso;
};
export type DiaMovimientos = { fecha: string; titulo: string; neto: number; movs: Movimiento[] };
type Categoria = { id: string; nombre: string; activo: boolean };

const firma = (c: number) => `${c < 0 ? "−" : "+"}${formatoDinero(Math.abs(c))}`;

/** Lista de movimientos del negocio: ventas del día, egresos y pagos al equipo. Cada uno se abre para ver su detalle. */
export function Movimientos({ dias, registrar, hoy, cajaAbierta, categorias, opciones, filtros, abrirEgreso }: {
  abrirEgreso?: boolean; dias: DiaMovimientos[]; registrar: boolean; hoy: string; cajaAbierta: boolean; categorias: Categoria[]; opciones: OpcionesEgreso; filtros: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(abrirEgreso && registrar ? 1 : 0);
  const [cancelar, setCancelar] = useState<FilaEgreso | null>(null);
  return (
    <>
      <div className="tit-fuera">
        <span className="lab">Movimientos</span>
        {registrar && <button type="button" className="bt chico" onClick={() => setNuevo((n) => n + 1)}><Icono n="mas" />Registrar egreso</button>}
      </div>
      {nuevo > 0 && <Nuevo key={nuevo} hoy={hoy} cajaAbierta={cajaAbierta} categorias={categorias.filter((c) => c.activo)} cerrar={() => setNuevo(0)} otro={() => setNuevo((n) => n + 1)} opciones={opciones} />}
      {cancelar && <Cancelar f={cancelar} cerrar={() => setCancelar(null)} />}
      <section className="glass panel-hist subir d1">
        {filtros}
        <MovimientosLista dias={dias} abierto={abierto} setAbierto={setAbierto} setCancelar={setCancelar} />
      </section>
    </>
  );
}

function MovimientosLista({ dias, abierto, setAbierto, setCancelar }: { dias: DiaMovimientos[]; abierto: string | null; setAbierto: (x: string | null) => void; setCancelar: (f: FilaEgreso) => void }) {
  if (dias.length === 0) return <p className="muted" style={{ padding: "8px 4px" }}>No hay movimientos con esos filtros.</p>;
  return (
    <div className="hist-scroll movs-f" data-lista-mov>
      {dias.map((d) => (
        <div key={d.fecha}>
          <div className="hist-dia"><span>{d.titulo}</span><b className="num">{firma(d.neto)}</b></div>
          {d.movs.map((m) => (
            <div key={m.id} className={`mov-f ${m.tipo} ${m.cancelado ? "cancelado" : ""} ${abierto === m.id ? "abierto" : ""}`}>
              <button type="button" className="mov-l" aria-expanded={abierto === m.id} onClick={() => setAbierto(abierto === m.id ? null : m.id)}>
                <span className="marca-f" aria-hidden="true" />
                <span className="mov-t"><b>{m.titulo}</b><small>{m.sub}</small></span>
                <b className="num">{m.cancelado ? formatoDinero(Math.abs(m.monto)) : firma(m.monto)}</b>
                <Icono n="abajo" />
              </button>
              {abierto === m.id && (
                <div className="hist-det mov-det">
                  {m.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
                  {m.comprobante && <span><small>Comprobante</small><a className="enlace" href={`/api/comprobante/${m.comprobante.id}`} target="_blank" rel="noreferrer">{m.comprobante.nombre}</a></span>}
                  {m.egreso?.puedeCancelar && <span className="anular"><button type="button" className="bt sec solo chico" onClick={() => setCancelar(m.egreso!)}>Cancelar egreso</button></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
