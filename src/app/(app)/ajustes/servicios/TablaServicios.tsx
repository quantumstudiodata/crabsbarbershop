"use client";

import { useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { alternarServicio, eliminarServicio, guardarServicio, type Resultado } from "./actions";

type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number; activo: boolean };
type Borrador = { id?: string; nombre: string; categoria: string; precio: string; duracion: string };

export function TablaServicios({ servicios }: { servicios: Servicio[] }) {
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [borrar, setBorrar] = useState<Servicio | null>(null);
  const [res, setRes] = useState<Resultado>({});
  const [pendiente, iniciar] = useTransition();
  const categorias = [...new Set(["Cortes", "Barba y paquetes", "Niños y extras", ...servicios.map((s) => s.categoria)])];
  const correr = (f: () => Promise<Resultado>, alTerminar?: () => void) => iniciar(async () => {
    const r = await f();
    setRes(r);
    if (!r.error) alTerminar?.();
  });
  const guardar = () => edit && correr(() => guardarServicio(edit), () => setEdit(null));

  // Funciones, no componentes: así los campos no pierden el foco al escribir.
  const fila = (s: Servicio) => {
    if (edit?.id === s.id) return <div key={s.id}>{edicion()}</div>;
    return (
      <div key={s.id} className={`svc-fila ${s.activo ? "" : "oculto"}`}>
        <span><b style={{ fontWeight: 600 }}>{s.nombre}</b>{!s.activo && <small>Oculto en Cobro</small>}</span>
        <span className="muted dur">{s.duracionMin} min</span>
        <span className="num">{formatoDinero(s.precio)}</span>
        <span className="acts">
          <button type="button" className="icb" onClick={() => setEdit({ id: s.id, nombre: s.nombre, categoria: s.categoria, precio: String(s.precio / 100), duracion: String(s.duracionMin) })} aria-label={`Editar ${s.nombre}`} title="Editar"><Icono n="editar" /></button>
          <button type="button" className="icb" onClick={() => correr(() => alternarServicio(s.id))} aria-label={s.activo ? `Ocultar ${s.nombre} en Cobro` : `Mostrar ${s.nombre} en Cobro`} title={s.activo ? "Visible en Cobro" : "Oculto en Cobro"}><Icono n={s.activo ? "ojo" : "ojoNo"} /></button>
          <button type="button" className="icb peligro" onClick={() => setBorrar(s)} aria-label={`Eliminar ${s.nombre}`} title="Eliminar"><Icono n="basura" /></button>
        </span>
      </div>
    );
  };

  const edicion = () => edit && (
    <div className="svc-fila edit" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } if (e.key === "Escape") setEdit(null); }}>
      <span className="pila-chica">
        <input className="input" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="Nombre del servicio" aria-label="Nombre" autoFocus />
        <input className="input" list="categorias" value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} placeholder="Categoría" aria-label="Categoría" />
      </span>
      <span className="dur"><input className="input" inputMode="numeric" value={edit.duracion} onChange={(e) => setEdit({ ...edit, duracion: e.target.value })} aria-label="Minutos" /></span>
      <span><input className="input" inputMode="decimal" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} placeholder="Precio" aria-label="Precio" /></span>
      <span className="acts">
        <button type="button" className="icb" onClick={guardar} disabled={pendiente} aria-label="Guardar" title="Guardar"><Icono n="palomita" /></button>
        <button type="button" className="icb" onClick={() => setEdit(null)} aria-label="Cancelar" title="Cancelar"><Icono n="cerrar" /></button>
      </span>
    </div>
  );

  return (
    <>
      {res.error && <p className="aviso error">{res.error}</p>}
      {res.mensaje && <p className="aviso ok">{res.mensaje}</p>}
      <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="glass panel svc-tabla" style={{ padding: "4px 10px 14px" }}>
        <div className="svc-fila" style={{ borderTop: 0 }}>
          <span className="lab">Servicio</span><span className="lab dur">Duración</span><span className="lab">Precio</span><span />
        </div>
        {categorias.filter((c) => servicios.some((s) => s.categoria === c) || (edit && !edit.id && edit.categoria === c)).map((c) => (
          <div key={c}>
            <div className="cat">{c}</div>
            {servicios.filter((s) => s.categoria === c).map(fila)}
          </div>
        ))}
        {edit && !edit.id ? <div style={{ marginTop: 10 }}>{edicion()}</div> : (
          <button type="button" className="bt sec solo" style={{ marginTop: 14 }} onClick={() => setEdit({ nombre: "", categoria: "Cortes", precio: "", duracion: "30" })}><Icono n="mas" />Agregar servicio</button>
        )}
      </div>
      <p className="ayuda-txt"><Icono n="ojo" className="ic" /> El ojo muestra u oculta el servicio en Cobro sin borrarlo.</p>
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Eliminar servicio" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Si ya se cobró alguna vez, solo se oculta para no perder las ventas pasadas.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setBorrar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarServicio(borrar.id), () => setBorrar(null))}>Sí, eliminar<span className="fl" aria-hidden="true"><Icono n="basura" /></span></button>
          </div>
        </Modal>
      )}
    </>
  );
}
