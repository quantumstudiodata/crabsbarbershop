"use client";

import { useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { Interruptor, Modal } from "@/components/ui";
import { alternarMetodo, eliminarMetodo, renombrarMetodo } from "./actions";

type Metodo = { id: string; nombre: string; esEfectivo: boolean; activo: boolean };

/** Formas de pago: cada una se puede renombrar, activar o desactivar y eliminar (el efectivo solo se desactiva). */
export function Metodos({ metodos }: { metodos: Metodo[] }) {
  const [lista, setLista] = useState(metodos);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [borrar, setBorrar] = useState<Metodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<{ error?: string }>, despues?: () => void) => iniciar(async () => {
    const r = await f();
    setError(r.error ?? null);
    if (!r.error) despues?.();
  });
  return (
    <div className="pila-chica">
      <div className="permisos metodos-e">
        {lista.map((m) => (
          <div key={m.id} className={m.activo ? "" : "inactivo-m"}>
            {editando === m.id ? (
              <form className="fila" style={{ gap: 8, flex: 1 }} onSubmit={(e) => { e.preventDefault(); correr(() => renombrarMetodo(m.id, nombre), () => { setLista(lista.map((x) => (x.id === m.id ? { ...x, nombre: nombre.trim() } : x))); setEditando(null); }); }}>
                <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={40} aria-label="Nombre de la forma de pago" style={{ flex: 1 }} />
                <button className="icb" disabled={pendiente} aria-label="Guardar nombre" title="Guardar"><Icono n="palomita" /></button>
                <button type="button" className="icb" onClick={() => setEditando(null)} aria-label="Cancelar" title="Cancelar"><Icono n="cerrar" /></button>
              </form>
            ) : (
              <span>
                <b style={{ fontWeight: 600 }}>{m.nombre}</b>
                <small>{m.esEfectivo ? (m.activo ? "Es lo que se cuenta al cerrar la caja." : "No se recibe efectivo.") : m.activo ? "Aparece en Cobro." : "No aparece en Cobro. Sus ventas pasadas se conservan."}</small>
              </span>
            )}
            {editando !== m.id && (
              <span className="fila" style={{ gap: 6 }}>
                <button type="button" className="icb" onClick={() => { setEditando(m.id); setNombre(m.nombre); }} aria-label={`Cambiar el nombre de ${m.nombre}`} title="Cambiar nombre"><Icono n="editar" /></button>
                {!m.esEfectivo && <button type="button" className="icb" onClick={() => setBorrar(m)} aria-label={`Eliminar ${m.nombre}`} title="Eliminar"><Icono n="basura" /></button>}
                <Interruptor etiqueta={`${m.nombre} activo`} checked={m.activo} disabled={pendiente}
                  onChange={() => correr(() => alternarMetodo(m.id), () => setLista(lista.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x))))} />
              </span>
            )}
          </div>
        ))}
      </div>
      {error && <p className="aviso error">{error}</p>}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Formas de pago" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Deja de aparecer en Cobro y en Ajustes. Los cobros que ya se hicieron con {borrar.nombre} se conservan con ese nombre.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setBorrar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarMetodo(borrar.id), () => { setLista(lista.filter((x) => x.id !== borrar.id)); setBorrar(null); })}>Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
