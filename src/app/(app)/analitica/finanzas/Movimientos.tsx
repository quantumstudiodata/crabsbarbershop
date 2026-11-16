"use client";

import { useState } from "react";
import { Vacio } from "@/components/Vacio";
import { Icono } from "@/components/Icono";
import { FilaVentaVista, type FilaVenta } from "@/components/HistorialVentas";
import { FilaCorte, type Corte } from "../cortes/HistorialCortes";
import type { Opciones } from "../ventas/ModificarVenta";
import { formatoDinero } from "@/lib/money";
import { Cancelar, type FilaEgreso, Nuevo, type OpcionesEgreso } from "../gastos/Egresos";

export type Movimiento = {
  id: string; tipo: "egreso" | "pago" | "renta" | "caja" | "propina" | "gasto"; titulo: string; sub: string; monto: number; hora: string; cancelado?: boolean; /** Liquidado pero sin entregar todavía. */ pendiente?: boolean;
  detalle: [string, string][]; comprobante?: { id: string; nombre: string }; egreso?: FilaEgreso;
};
/** Todo lo que pasó en el negocio, en un solo historial: ventas, cortes de caja y movimientos de dinero. */
/** `corte`: el corte de caja al que pertenece (propinas y pagos que se entregaron al cerrar); se muestra justo debajo de ese corte. */
export type ItemHistorial = { t: number; corte?: string; /** Pago pendiente que se dejó en ese corte. */ pend?: boolean } & ({ k: "venta"; f: FilaVenta } | { k: "corte"; c: Corte; ver: boolean } | { k: "mov"; m: Movimiento });
export type DiaHistorial = { fecha: string; titulo: string; total: number; sinTotal?: boolean; items: ItemHistorial[] };
type Categoria = { id: string; nombre: string; activo: boolean };

const firma = (c: number) => `${c < 0 ? "−" : "+"}${formatoDinero(Math.abs(c))}`;
const ETIQUETA: Record<Movimiento["tipo"], string> = { egreso: "Egreso", pago: "Pago al equipo", renta: "Renta", caja: "Caja", propina: "Propina", gasto: "Gasto de caja" };
/** Cada tipo lleva un tono de gris azulado distinto, sutil, para distinguirlos de un vistazo. */
const TONO: Record<Movimiento["tipo"], string> = { egreso: "t-egreso", pago: "t-equipo", renta: "t-equipo", propina: "t-equipo", caja: "t-caja", gasto: "t-caja" };

/** Historial de movimientos: ventas, cortes de caja, egresos, pagos al equipo y dinero que entró o salió de la caja, el más reciente arriba. */
export function Movimientos({ dias, registrar, hoy, cajaAbierta, categorias, opciones, filtros, abrirEgreso, botonCaja, regreso, opcionesVenta, conteo, corregir, abrirCorte }: {
  corregir: boolean; abrirCorte?: string;
  abrirEgreso?: boolean; botonCaja?: React.ReactNode; dias: DiaHistorial[]; registrar: boolean; hoy: string; cajaAbierta: boolean; categorias: Categoria[];
  opciones: OpcionesEgreso; filtros: React.ReactNode; regreso: string; opcionesVenta?: Opciones; conteo?: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(abrirEgreso && registrar ? 1 : 0);
  const [cancelar, setCancelar] = useState<FilaEgreso | null>(null);
  return (
    <>
      <div className="tit-fuera">
        <span className="lab">Historial de movimientos{conteo ? <span className="muted" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>{conteo}</span> : null}</span>
        <span className="fila" style={{ gap: 8 }}>
          {botonCaja}
          {registrar && <button type="button" className="bt chico" onClick={() => setNuevo((n) => n + 1)}><Icono n="mas" />Registrar egreso</button>}
        </span>
      </div>
      {nuevo > 0 && <Nuevo key={nuevo} hoy={hoy} categorias={categorias.filter((c) => c.activo)} cerrar={() => setNuevo(0)} otro={() => setNuevo((n) => n + 1)} opciones={opciones} />}
      {cancelar && <Cancelar f={cancelar} cerrar={() => setCancelar(null)} />}
      <section className="glass panel-hist subir d1">
        {filtros}
        {dias.length === 0
          ? <Vacio icono="archivo" titulo="No hay movimientos con esos filtros" texto="Aquí aparecen las ventas, los cortes de caja y todo el dinero que entra o sale. Prueba con otras fechas u otro filtro." />
          : (
            <div className="historial sin-marco">
              <div className="hist-scroll movs-f" data-lista-mov>
                {dias.map((d) => (
                  <div key={d.fecha}>
                    <div className={`hist-dia ${d.sinTotal ? "pend-dia" : ""}`}><span>{d.titulo}</span>{!d.sinTotal && <b className="num">{formatoDinero(d.total)}</b>}</div>
                    {d.items.map((it) => it.k === "corte" ? <FilaCorte key={it.c.id} c={it.c} ver={it.ver} corregir={corregir} abrir={abrirCorte === it.c.id} />
                      : it.k === "venta" ? <FilaVentaVista key={it.f.id} f={it.f} abierta={abierto === it.f.id} alternar={() => setAbierto(abierto === it.f.id ? null : it.f.id)} regreso={regreso} opciones={opcionesVenta} />
                      : <FilaMov key={it.m.id} m={it.m} abierto={abierto === it.m.id} alternar={() => setAbierto(abierto === it.m.id ? null : it.m.id)} cancelar={setCancelar} />)}
                  </div>
                ))}
              </div>
            </div>
          )}
      </section>
    </>
  );
}

/** Un movimiento de dinero con el mismo formato que una venta: hora, qué fue, de qué tipo y cuánto. */
function FilaMov({ m, abierto, alternar, cancelar }: { m: Movimiento; abierto: boolean; alternar: () => void; cancelar: (f: FilaEgreso) => void }) {
  return (
    <div className={`hist-fila mov-h ${m.tipo} ${TONO[m.tipo]} ${m.pendiente ? "pendiente" : ""} ${m.cancelado ? "cancelada" : ""} ${abierto ? "abierta" : ""}`}>
      <button type="button" className="hist-linea mov-fila" aria-expanded={abierto} onClick={alternar}>
        <span className="t">{m.hora}</span>
        <span className="mov-tp"><i />{m.pendiente ? "Pendiente" : ETIQUETA[m.tipo]}</span>
        <span className="srv"><span>{m.titulo}</span><small className="mov-sub">{m.sub}</small></span>
        <span className={`num ${m.pendiente ? "muted" : ""}`}>{m.cancelado || m.pendiente ? formatoDinero(Math.abs(m.monto)) : firma(m.monto)}</span>
        <Icono n="abajo" />
      </button>
      {abierto && (
        <div className="hist-det">
          {m.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
          {m.comprobante && <span><small>Comprobante</small><a className="enlace" href={`/api/comprobante/${m.comprobante.id}`} target="_blank" rel="noreferrer">{m.comprobante.nombre}</a></span>}
          {m.egreso?.puedeCancelar && <span className="anular"><button type="button" className="bt sec solo chico" onClick={() => cancelar(m.egreso!)}>Cancelar egreso</button></span>}
        </div>
      )}
    </div>
  );
}
