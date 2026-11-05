"use client";

import { useActionState, useEffect, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal, Selector } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { type EstadoModificar, modificarVenta } from "./actions";

export type DatosEdicion = {
  conceptos: { id: string; nombre: string; barberoId: string; precio: number }[];
  pagos: { metodoId: string; monto: number }[];
};
export type Opciones = { equipo: { id: string; nombre: string }[]; metodos: { id: string; nombre: string }[] };

const pesos = (c: number) => String(c / 100);

/** Modifica quién atendió, el precio de cada servicio y cómo se pagó. Queda en el historial. */
export function ModificarVenta({ id, folio, datos, opciones }: { id: string; folio: string; datos: DatosEdicion; opciones: Opciones }) {
  const [abierto, setAbierto] = useState(false);
  const [e, accion, guardando] = useActionState<EstadoModificar, FormData>(modificarVenta, {});
  const [cs, setCs] = useState(() => datos.conceptos.map((c) => ({ ...c, precio: pesos(c.precio) })));
  const [ps, setPs] = useState(() => (datos.pagos.length ? datos.pagos : [{ metodoId: opciones.metodos[0]?.id ?? "", monto: 0 }]).map((p) => ({ ...p, monto: pesos(p.monto) })));
  useEffect(() => { if (e.ok) setAbierto(false); }, [e.ok, e.n]);
  const total = cs.reduce((a, c) => a + (leerPesos(c.precio) ?? 0), 0);
  const pagado = ps.reduce((a, p) => a + (leerPesos(p.monto) ?? 0), 0);
  const equipo = opciones.equipo.map((x) => ({ valor: x.id, texto: x.nombre.split(" ").slice(0, 2).join(" ") }));
  const metodos = opciones.metodos.map((x) => ({ valor: x.id, texto: x.nombre }));
  return (
    <>
      <button type="button" className="icb" onClick={() => setAbierto(true)} aria-label={`Modificar la venta ${folio}`} title="Modificar"><Icono n="editar" /></button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={`Venta ${folio}`} titulo="Modificar venta" ancho>
        <form action={accion} className="pila">
          <input type="hidden" name="ventaId" value={id} />
          <input type="hidden" name="datos" value={JSON.stringify({ conceptos: cs.map(({ id, barberoId, precio }) => ({ id, barberoId, precio })), pagos: ps })} />
          <span className="paso-t">Servicios</span>
          {cs.map((c, i) => (
            <div key={c.id} className="fila-mod">
              <b>{c.nombre}</b>
              <Selector etiqueta="Atendió" valor={c.barberoId} onChange={(v) => setCs(cs.map((x, k) => (k === i ? { ...x, barberoId: v } : x)))} opciones={equipo} />
              <span className="otra ancho" style={{ background: "#fff" }}><span>$</span><input inputMode="decimal" value={c.precio} onChange={(ev) => setCs(cs.map((x, k) => (k === i ? { ...x, precio: ev.target.value } : x)))} aria-label={`Precio de ${c.nombre}`} /></span>
            </div>
          ))}
          <span className="paso-t">Cómo se pagó</span>
          {ps.map((p, i) => (
            <div key={i} className="fila-mod pago">
              <Selector etiqueta="Forma de pago" valor={p.metodoId} onChange={(v) => setPs(ps.map((x, k) => (k === i ? { ...x, metodoId: v } : x)))} opciones={metodos} />
              <span className="otra ancho" style={{ background: "#fff" }}><span>$</span><input inputMode="decimal" value={p.monto} onChange={(ev) => setPs(ps.map((x, k) => (k === i ? { ...x, monto: ev.target.value } : x)))} aria-label="Monto" /></span>
              {ps.length > 1 ? <button type="button" className="icb" onClick={() => setPs(ps.filter((_, k) => k !== i))} aria-label="Quitar"><Icono n="cerrar" /></button> : <span />}
            </div>
          ))}
          {ps.length < 3 && <button type="button" className="enlace" style={{ justifySelf: "start" }} onClick={() => setPs([...ps, { metodoId: opciones.metodos[0]?.id ?? "", monto: pesos(Math.max(total - pagado, 0)) }])}>Agregar otra forma de pago</button>}
          <div className={`aviso ${pagado === total ? "" : "error"}`} style={{ margin: 0 }}>Total de la venta {formatoDinero(total)}. Pagos {formatoDinero(pagado)}.</div>
          <label className="campo"><span>Motivo del cambio</span><input className="input" name="motivo" placeholder="Ejemplo: se registró con el barbero equivocado" required /></label>
          {e.error && <p className="aviso error">{e.error}</p>}
          <p className="ayuda-txt">Queda en el historial con el antes y el después.</p>
          <div className="acciones">
            <button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
