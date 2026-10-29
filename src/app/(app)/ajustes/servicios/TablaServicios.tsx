"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { alternarServicio, eliminarServicio, guardarServicio, ordenarServicios, type Resultado } from "./actions";

type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number; activo: boolean; comision: number | null };
type Borrador = { id?: string; nombre: string; categoria: string; precio: string; duracion: string; activo: boolean; comision: string };

const nuevo = (categoria = "Cortes"): Borrador => ({ nombre: "", categoria, precio: "", duracion: "", activo: true, comision: "" });

/** Alta rápida en una sola fila, como llenar un renglón de Excel. */
function FilaAlta({ categorias, cerrar, guardar }: { categorias: string[]; cerrar: () => void; guardar: (b: Borrador, otro: boolean) => Promise<boolean> }) {
  const [b, setB] = useState<Borrador>(nuevo(categorias[0]));
  const [nueva, setNueva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const nombre = useRef<HTMLInputElement>(null);
  const enviar = async (otro: boolean) => {
    setGuardando(true);
    const ok = await guardar(b, otro);
    setGuardando(false);
    if (ok && otro) { setB({ ...nuevo(b.categoria) }); nombre.current?.focus(); }
  };
  return (
    <form className="fila-alta subir" onSubmit={(e) => { e.preventDefault(); enviar(false); }} onKeyDown={(e) => { if (e.key === "Escape") cerrar(); }}>
      <input ref={nombre} className="input" value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} placeholder="Nombre del servicio" aria-label="Nombre" required autoFocus />
      <input className="input" inputMode="numeric" value={b.duracion} onChange={(e) => setB({ ...b, duracion: e.target.value })} placeholder="Minutos" aria-label="Duración en minutos" />
      <input className="input" inputMode="decimal" value={b.precio} onChange={(e) => setB({ ...b, precio: e.target.value })} placeholder="$ Precio" aria-label="Precio" required />
      {nueva
        ? <input className="input" value={b.categoria} onChange={(e) => setB({ ...b, categoria: e.target.value })} placeholder="Nueva categoría" aria-label="Nueva categoría" autoFocus onBlur={() => { if (!b.categoria.trim()) { setNueva(false); setB({ ...b, categoria: categorias[0] }); } }} />
        : <Selector etiqueta="Categoría" valor={b.categoria} onChange={(v) => { if (v === "__nueva") { setNueva(true); setB({ ...b, categoria: "" }); } else setB({ ...b, categoria: v }); }}
          opciones={[...categorias.map((c) => ({ valor: c, texto: c })), { valor: "__nueva", texto: "Crear categoría" }]} />}
      <span className="acts">
        <button className="icb" disabled={guardando} title="Guardar servicio" aria-label="Guardar servicio"><Icono n="palomita" /></button>
        <button type="button" className="icb" disabled={guardando} onClick={() => enviar(true)} title="Guardar y agregar otro" aria-label="Guardar y agregar otro"><Icono n="mas" /></button>
        <button type="button" className="icb" onClick={cerrar} title="Cancelar" aria-label="Cancelar"><Icono n="cerrar" /></button>
      </span>
    </form>
  );
}

function MenuServicio({ s, subir, bajar, eliminar }: { s: Servicio; subir?: () => void; bajar?: () => void; eliminar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  const ir = (f?: () => void) => () => { setAbierto(false); f?.(); };
  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button type="button" className="icb" aria-label={`Más acciones para ${s.nombre}`} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>⋯</button>
      {abierto && (
        <div className="menu acciones-m" role="menu">
          {subir && <button type="button" role="menuitem" className="it" onClick={ir(subir)}><Icono n="arriba" />Subir</button>}
          {bajar && <button type="button" role="menuitem" className="it" onClick={ir(bajar)}><Icono n="abajo" />Bajar</button>}
          <button type="button" role="menuitem" className="it salir" onClick={ir(eliminar)}><Icono n="basura" />Eliminar servicio</button>
        </div>
      )}
    </div>
  );
}

export function TablaServicios({ servicios: inicial }: { servicios: Servicio[] }) {
  const [servicios, setServicios] = useState(inicial);
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [borrar, setBorrar] = useState<Servicio | null>(null);
  const [res, setRes] = useState<Resultado>({});
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [alta, setAlta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => setServicios(inicial), [inicial]);

  const categorias = [...new Set(["Cortes", "Barba y paquetes", "Niños y extras", ...servicios.map((s) => s.categoria)])];
  const correr = (f: () => Promise<Resultado>, alTerminar?: () => void) => iniciar(async () => {
    const r = await f();
    setRes(r);
    if (!r.error) alTerminar?.();
  });

  /** Mueve un servicio a la posición de otro (misma categoría) y guarda el orden. */
  const mover = (id: string, destino: string) => {
    if (id === destino) return;
    const lista = [...servicios];
    const de = lista.findIndex((s) => s.id === id), a = lista.findIndex((s) => s.id === destino);
    if (de < 0 || a < 0 || lista[de].categoria !== lista[a].categoria) return;
    const [x] = lista.splice(de, 1);
    lista.splice(a, 0, x);
    setServicios(lista);
    correr(() => ordenarServicios(lista.map((s) => s.id)));
  };
  const vecino = (s: Servicio, d: -1 | 1) => {
    const misma = servicios.filter((x) => x.categoria === s.categoria);
    return misma[misma.findIndex((x) => x.id === s.id) + d];
  };

  return (
    <>
      {res.error && <p className="aviso error">{res.error}</p>}
      {res.mensaje && <p className="aviso ok">{res.mensaje}</p>}
      <div className="entre">
        <p className="ayuda-txt"><Icono n="lista" className="ic" /> Arrastra un servicio para cambiar su lugar. Los primeros aparecen primero en Cobro.</p>
        {!alta && <button type="button" className="bt solo chico" onClick={() => setAlta(true)}><Icono n="mas" />Agregar servicio</button>}
      </div>
      {alta && (
        <FilaAlta categorias={categorias} cerrar={() => setAlta(false)} guardar={async (b, otro) => {
          const r = await guardarServicio(b);
          setRes(r.error ? r : { mensaje: `${b.nombre} se agregó.` });
          if (!r.error && !otro) setAlta(false);
          return !r.error;
        }} />
      )}
      {categorias.filter((c) => servicios.some((s) => s.categoria === c)).map((c) => (
        <section key={c} className="glass cat-s">
          <div className="cat-h"><b>{c}</b><span className="muted">{servicios.filter((s) => s.categoria === c).length} servicios</span></div>
          {servicios.filter((s) => s.categoria === c).map((s) => {
            const arriba = vecino(s, -1), abajo = vecino(s, 1);
            return (
              <div key={s.id} className={`svc-f ${s.activo ? "" : "oculto"} ${arrastrando === s.id ? "arrastra" : ""}`} draggable
                onDragStart={(e) => { setArrastrando(s.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => setArrastrando(null)}
                onDragOver={(e) => { e.preventDefault(); if (arrastrando && arrastrando !== s.id) mover(arrastrando, s.id); }}>
                <span className="asa-d" aria-hidden="true">⋮⋮</span>
                <span className="nom-s"><b>{s.nombre}</b>{!s.activo && <small>Oculto en Cobro</small>}</span>
                <span className="num">{formatoDinero(s.precio)}</span>
                <span className="acts">
                  <button type="button" className="icb" onClick={() => setEdit({ id: s.id, nombre: s.nombre, categoria: s.categoria, precio: String(s.precio / 100), duracion: s.duracionMin ? String(s.duracionMin) : "", activo: s.activo, comision: s.comision === null ? "" : String(s.comision / 100) })} aria-label={`Editar ${s.nombre}`} title="Editar"><Icono n="editar" /></button>
                  <button type="button" className={`icb ojo ${s.activo ? "" : "apagado"}`} onClick={() => correr(() => alternarServicio(s.id))} aria-pressed={!s.activo} aria-label={s.activo ? `Ocultar ${s.nombre} en Cobro` : `Mostrar ${s.nombre} en Cobro`} title={s.activo ? "Visible en Cobro" : "Oculto en Cobro"}><Icono n={s.activo ? "ojo" : "ojoNo"} /></button>
                  <MenuServicio s={s} subir={arriba ? () => mover(s.id, arriba.id) : undefined} bajar={abajo ? () => mover(s.id, abajo.id) : undefined} eliminar={() => setBorrar(s)} />
                </span>
              </div>
            );
          })}
        </section>
      ))}

      {edit && (
        <Modal abierto cerrar={() => setEdit(null)} etiqueta={edit.id ? "Editar servicio" : "Nuevo servicio"} titulo={edit.id ? edit.nombre || "Servicio" : "Agregar servicio"}>
          <form className="pila" onSubmit={(e) => { e.preventDefault(); correr(() => guardarServicio(edit), () => setEdit(null)); }}>
            <label className="campo"><span>Nombre del servicio</span><input className="input" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} required autoFocus /></label>
            <div className="fila" style={{ alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: "1 1 120px" }}><span>Precio</span><input className="input" inputMode="decimal" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} placeholder="$0" required /></label>
              <label className="campo" style={{ flex: "1 1 120px" }}><span>Duración estimada</span><input className="input" inputMode="numeric" value={edit.duracion} onChange={(e) => setEdit({ ...edit, duracion: e.target.value })} placeholder="Opcional, en minutos" /></label>
            </div>
            <div className="campo">
              <span>Categoría</span>
              {categorias.includes(edit.categoria)
                ? <Selector etiqueta="Categoría" valor={edit.categoria} onChange={(v) => setEdit({ ...edit, categoria: v === "__nueva" ? "" : v })} opciones={[...categorias.map((c) => ({ valor: c, texto: c })), { valor: "__nueva", texto: "Crear categoría" }]} />
                : <input className="input" value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} placeholder="Nueva categoría" autoFocus />}
            </div>
            <label className="campo">
              <span>Comisión del barbero en este servicio<Ayuda titulo="Comisión por servicio">Solo si este servicio paga un porcentaje distinto. Aplica a los barberos que ganan por comisión. Vacío = la comisión de cada barbero.</Ayuda></span>
              <span className="otra ancho" style={{ background: "#fff" }}><input inputMode="decimal" value={edit.comision} onChange={(e) => setEdit({ ...edit, comision: e.target.value })} placeholder="La de cada barbero" /><span>%</span></span>
            </label>
            <div className="entre"><span>Visible en Cobro</span><Interruptor etiqueta="Visible en Cobro" checked={edit.activo} onChange={(v) => setEdit({ ...edit, activo: v })} /></div>
            <div className="acciones">
              <button type="button" className="bt sec solo" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="bt" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar servicio"}<Fl /></button>
            </div>
          </form>
        </Modal>
      )}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Eliminar servicio" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Si ya se cobró alguna vez, solo se oculta para no perder las ventas pasadas.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setBorrar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarServicio(borrar.id), () => setBorrar(null))}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
    </>
  );
}
