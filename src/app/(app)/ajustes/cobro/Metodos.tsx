"use client";

import { useState, useTransition } from "react";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Modal } from "@/components/ui";
import { alternarMetodo, eliminarMetodo, guardarMetodo } from "./actions";

type Metodo = { id: string; nombre: string; descripcion: string; esEfectivo: boolean; activo: boolean };

/** Formas de pago en una lista compacta. Las acciones aparecen en el menú de tres puntos. */
export function Metodos({ metodos, qr = null }: { metodos: Metodo[]; qr?: "activa" | "pendiente" | "sin" | null }) {
  const [lista, setLista] = useState(metodos);
  const [form, setForm] = useState<{ id?: string; nombre: string; descripcion: string } | null>(null);
  const [borrar, setBorrar] = useState<Metodo | null>(null);
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<{ error?: string; id?: string }>, despues: (id?: string) => void, ok?: string) => iniciar(async () => {
    const r = await f();
    setAviso(r.error ? { error: r.error } : { ok });
    if (!r.error) despues(r.id);
  });
  const nota = (m: Metodo) => m.descripcion || (m.esEfectivo ? "Es lo que se cuenta al cerrar la caja." : "Aparece en Cobro.");
  return (
    <div className="pila-chica">
      <div className="entre"><span className="sub-a">Métodos de pago</span>
        <button type="button" className="bt sec solo chico" onClick={() => setForm({ nombre: "", descripcion: "" })}><Icono n="mas" />Agregar método de pago</button></div>
      <div className="lista-cfg">
        {lista.map((m) => (
          <div key={m.id} className={`${m.activo ? "" : "apagada"} ${nuevo === m.id ? "nuevo-s" : ""}`}>
            <span><b>{m.nombre}</b><small>{m.activo ? nota(m) : "Desactivado: no aparece en Cobro. Sus ventas pasadas se conservan."}</small></span>
            <span className={`chip-p ${m.activo ? "si" : ""}`}>{m.activo ? "Activo" : "Desactivado"}</span>
            <MenuPuntos etiqueta={`Opciones de ${m.nombre}`} items={[
              { texto: "Editar", icono: "editar", hacer: () => setForm({ id: m.id, nombre: m.nombre, descripcion: m.descripcion }) },
              { texto: m.activo ? "Desactivar" : "Activar", icono: m.activo ? "candado" : "palomita", hacer: () => correr(() => alternarMetodo(m.id), () => setLista(lista.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x))), m.activo ? `${m.nombre} desactivado.` : `${m.nombre} activado.`) },
              ...(m.esEfectivo ? [] : [{ texto: "Eliminar", icono: "basura", peligro: true, hacer: () => setBorrar(m) }]),
            ]} />
          </div>
        ))}
        {qr && (
          <div className={qr === "activa" ? "" : "apagada"}>
            <span><b className="met-qr"><Icono n="cuadros" />Pago con QR</b><small>{qr === "activa" ? "Se activó al conectar Stripe. El cliente paga desde su teléfono y Stripe confirma el pago." : qr === "pendiente" ? "Se activa solo cuando Stripe termine de revisar tu cuenta." : "Se activa solo al conectar Stripe en Pagos en línea."}</small></span>
            <span className={`chip-p ${qr === "activa" ? "si" : ""}`}>{qr === "activa" ? "Activo" : "Desactivado"}</span>
            <span />
          </div>
        )}
      </div>
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.ok && <p className="confirma" key={aviso.ok}><Icono n="palomita" />{aviso.ok}</p>}
      {form && (
        <Modal abierto cerrar={() => setForm(null)} etiqueta="Métodos de pago" titulo={form.id ? "Editar método de pago" : "Agregar método de pago"}>
          <form className="pila" onSubmit={(e) => {
            e.preventDefault();
            const d = form;
            correr(() => guardarMetodo(d), (id) => {
              if (d.id) setLista(lista.map((x) => (x.id === d.id ? { ...x, nombre: d.nombre.trim(), descripcion: d.descripcion.trim() } : x)));
              else if (id) { setLista([...lista, { id, nombre: d.nombre.trim(), descripcion: d.descripcion.trim(), esEfectivo: false, activo: true }]); setNuevo(id); }
              setForm(null);
            }, "Guardado.");
          }}>
            <label className="campo"><span>Nombre</span><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={40} required autoFocus placeholder="Ejemplo: Vales" /></label>
            <label className="campo"><span>Descripción (opcional)</span><input className="input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={120} placeholder="Ejemplo: Vales de despensa de la empresa" /></label>
            <div className="acciones"><button className="bt" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}<Fl /></button></div>
          </form>
        </Modal>
      )}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Métodos de pago" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Deja de aparecer en Cobro. Los cobros que ya se hicieron con {borrar.nombre} se conservan con ese nombre.</p>
          <div className="acciones">
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarMetodo(borrar.id), () => { setLista(lista.filter((x) => x.id !== borrar.id)); setBorrar(null); }, `${borrar.nombre} se eliminó.`)}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}
