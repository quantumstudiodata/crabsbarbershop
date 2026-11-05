"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import {
  alternarCategoria, alternarServicio, eliminarCategoria, eliminarServicio, guardarCategoria, guardarServicio,
  ordenarCategorias, ordenarServicios, revisarCategoria, type Resultado,
} from "./actions";

type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number; activo: boolean; comision: number | null; descripcion: string };
type Categoria = { id: string; nombre: string; descripcion: string; activo: boolean };
type Borrador = { id?: string; nombre: string; categoria: string; precio: string; duracion: string; activo: boolean; comision: string; descripcion: string };


export function TablaServicios({ servicios: inicialS, categorias: inicialC, puedeEditar = true, nuevaCategoria }: {
  servicios: Servicio[]; categorias: Categoria[]; puedeEditar?: boolean; nuevaCategoria: number;
}) {
  const [servicios, setServicios] = useState(inicialS);
  const [cats, setCats] = useState(inicialC);
  useEffect(() => setServicios(inicialS), [inicialS]);
  useEffect(() => setCats(inicialC), [inicialC]);
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [editCat, setEditCat] = useState<{ id?: string; nombre: string; descripcion: string } | null>(null);
  const [borrar, setBorrar] = useState<Servicio | null>(null);
  const [borrarCat, setBorrarCat] = useState<(Categoria & { conVentas: string[]; total: number }) | null>(null);
  const [destino, setDestino] = useState("");
  const [res, setRes] = useState<Resultado>({});
  const [arrastra, setArrastra] = useState<{ tipo: "s" | "c"; id: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => { if (nuevaCategoria > 0) setEditCat({ nombre: "", descripcion: "" }); }, [nuevaCategoria]);

  const correr = (f: () => Promise<Resultado>, alTerminar?: (r: Resultado) => void) => iniciar(async () => {
    const r = await f();
    setRes(r.error ? r : { mensaje: r.mensaje });
    if (!r.error) alTerminar?.(r);
  });
  const marcarNuevo = (id?: string) => { if (id) setNuevos((n) => new Set(n).add(id)); };
  const de = (c: string) => servicios.filter((s) => s.categoria === c);

  const moverServicio = (id: string, sobre: string) => {
    if (id === sobre) return;
    const lista = [...servicios];
    const a = lista.findIndex((s) => s.id === id), b = lista.findIndex((s) => s.id === sobre);
    if (a < 0 || b < 0 || lista[a].categoria !== lista[b].categoria) return;
    const [x] = lista.splice(a, 1);
    lista.splice(b, 0, x);
    setServicios(lista);
  };
  const moverCategoria = (id: string, sobre: string) => {
    if (id === sobre) return;
    const lista = [...cats];
    const a = lista.findIndex((c) => c.id === id), b = lista.findIndex((c) => c.id === sobre);
    if (a < 0 || b < 0) return;
    const [x] = lista.splice(a, 1);
    lista.splice(b, 0, x);
    setCats(lista);
  };
  const soltar = () => {
    if (arrastra?.tipo === "s") correr(() => ordenarServicios(servicios.map((s) => s.id)));
    if (arrastra?.tipo === "c") correr(() => ordenarCategorias(cats.map((c) => c.id)));
    setArrastra(null);
  };
  const alternar = (id: string) => setCerradas((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      {res.error && <p className="aviso error">{res.error}</p>}
      {res.mensaje && <p className="aviso ok">{res.mensaje}</p>}
      <p className="ayuda-txt"><Icono n="lista" className="ic" /> Arrastra categorías o servicios para cambiar su lugar. Así aparecen en Cobro.</p>

      <div className="cats-s">
        {cats.map((c) => {
          const lista = de(c.nombre);
          const abierta = !cerradas.has(c.id);
          return (
            <section key={c.id} className={`glass cat-s ${c.activo ? "" : "oculta"} ${nuevos.has(c.id) ? "nuevo-s" : ""} ${arrastra?.id === c.id ? "arrastra" : ""}`}
              onDragOver={(e) => { if (arrastra?.tipo === "c") { e.preventDefault(); moverCategoria(arrastra.id, c.id); } }} onDrop={soltar}>
              <div className="cat-h2" role="button" tabIndex={0} aria-expanded={abierta} onClick={() => alternar(c.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) alternar(c.id); }}
                draggable={puedeEditar} onDragStart={(e) => { setArrastra({ tipo: "c", id: c.id }); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={soltar}>
                {puedeEditar && <span className="asa-d" aria-hidden="true">⋮⋮</span>}
                <span className={`flecha-c ${abierta ? "abierta" : ""}`} aria-hidden="true">›</span>
                <span className="cat-t"><b>{c.nombre}</b>{c.descripcion && <small>{c.descripcion}</small>}</span>
                {!c.activo && <span className="chip-e off"><i />Oculta en Cobro</span>}
                <span className="muted cuenta-c">{lista.length} {lista.length === 1 ? "servicio" : "servicios"}</span>
                {puedeEditar && <MenuPuntos etiqueta={`Opciones de ${c.nombre}`} items={[
                  { texto: "Editar categoría", icono: "editar", hacer: () => setEditCat({ id: c.id, nombre: c.nombre, descripcion: c.descripcion }) },
                  { texto: c.activo ? "Ocultar en Cobro" : "Mostrar en Cobro", icono: c.activo ? "ojoNo" : "ojo", hacer: () => correr(() => alternarCategoria(c.id), () => setCats(cats.map((x) => (x.id === c.id ? { ...x, activo: !x.activo } : x)))) },
                  { texto: "Eliminar categoría", icono: "basura", peligro: true, hacer: () => iniciar(async () => { const r = await revisarCategoria(c.id); if (r.error) { setRes({ error: r.error }); return; } setBorrarCat({ ...c, conVentas: r.conVentas, total: r.servicios }); setDestino(cats.find((x) => x.id !== c.id)?.id ?? ""); }) },
                ]} />}
              </div>
              {abierta && (
                <div className="cat-c">
                  {lista.length === 0 && <p className="muted" style={{ padding: "6px 12px" }}>Todavía no tiene servicios.</p>}
                  {lista.map((s) => (
                    <div key={s.id} className={`svc-f ${s.activo ? "" : "oculto"} ${arrastra?.id === s.id ? "arrastra" : ""} ${nuevos.has(s.id) ? "nuevo-s" : ""}`} draggable={puedeEditar}
                      onDragStart={(e) => { e.stopPropagation(); setArrastra({ tipo: "s", id: s.id }); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={soltar}
                      onDragOver={(e) => { if (arrastra?.tipo === "s") { e.preventDefault(); e.stopPropagation(); moverServicio(arrastra.id, s.id); } }}>
                      <span className="asa-d" aria-hidden="true">{puedeEditar ? "⋮⋮" : ""}</span>
                      <span className="nom-s"><b>{s.nombre}</b>{s.descripcion && <small>{s.descripcion}</small>}{!s.activo && <small>Oculto en Cobro</small>}</span>
                      <span className="num">{formatoDinero(s.precio)}</span>
                      <span className="acts" hidden={!puedeEditar}>
                        <MenuPuntos etiqueta={`Opciones de ${s.nombre}`} items={[
                          { texto: "Editar servicio", icono: "editar", hacer: () => setEdit({ id: s.id, nombre: s.nombre, categoria: s.categoria, precio: String(s.precio / 100), duracion: s.duracionMin ? String(s.duracionMin) : "", activo: s.activo, comision: s.comision === null ? "" : String(s.comision / 100), descripcion: s.descripcion }) },
                          { texto: s.activo ? "Ocultar en Cobro" : "Mostrar en Cobro", icono: s.activo ? "ojoNo" : "ojo", hacer: () => correr(() => alternarServicio(s.id), () => setServicios(servicios.map((x) => (x.id === s.id ? { ...x, activo: !x.activo } : x)))) },
                          { texto: "Eliminar servicio", icono: "basura", peligro: true, hacer: () => setBorrar(s) },
                        ]} />
                      </span>
                    </div>
                  ))}
                  {puedeEditar && <button type="button" className="agregar-s" onClick={() => setEdit({ nombre: "", categoria: c.nombre, precio: "", duracion: "", activo: true, comision: "", descripcion: "" })}><Icono n="mas" />Agregar servicio</button>}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editCat && (
        <Modal abierto cerrar={() => setEditCat(null)} etiqueta={editCat.id ? "Editar categoría" : "Nueva categoría"} titulo={editCat.id ? editCat.nombre || "Categoría" : "Agregar categoría"}>
          <form className="pila" onSubmit={(e) => {
            e.preventDefault();
            const d = editCat;
            correr(() => guardarCategoria(d), (r) => {
              if (d.id) setCats(cats.map((x) => (x.id === d.id ? { ...x, nombre: d.nombre.trim(), descripcion: d.descripcion } : x)));
              else if (r.id) { setCats([...cats, { id: r.id, nombre: d.nombre.trim(), descripcion: d.descripcion, activo: true }]); marcarNuevo(r.id); }
              setEditCat(null);
            });
          }}>
            <label className="campo"><span>Nombre de la categoría</span><input className="input" value={editCat.nombre} onChange={(e) => setEditCat({ ...editCat, nombre: e.target.value })} required maxLength={40} autoFocus placeholder="Ejemplo: Tratamientos" /></label>
            <label className="campo"><span>Descripción (opcional)</span><input className="input" value={editCat.descripcion} onChange={(e) => setEditCat({ ...editCat, descripcion: e.target.value })} maxLength={160} /></label>
            <div className="acciones"><button className="bt" disabled={pendiente}>{pendiente ? "Guardando…" : editCat.id ? "Guardar cambios" : "Crear categoría"}<Fl /></button></div>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal abierto cerrar={() => setEdit(null)} etiqueta={edit.id ? "Editar servicio" : "Nuevo servicio"} titulo={edit.id ? edit.nombre || "Servicio" : "Agregar servicio"}>
          <form className="pila" onSubmit={(e) => {
            e.preventDefault();
            const d = edit;
            correr(() => guardarServicio(d), (r) => {
              const precio = Math.round(Number(d.precio.replace(/[^\d.]/g, "")) * 100);
              const x = { nombre: d.nombre.trim(), categoria: d.categoria, precio, duracionMin: Number(d.duracion) || 0, activo: d.activo, comision: d.comision === "" ? null : Math.round(Number(d.comision) * 100), descripcion: d.descripcion };
              if (d.id) setServicios(servicios.map((s) => (s.id === d.id ? { ...s, ...x } : s)));
              else if (r.id) { setServicios([...servicios, { id: r.id, ...x }]); marcarNuevo(r.id); }
              setEdit(null);
            });
          }}>
            <label className="campo"><span>Nombre del servicio</span><input className="input" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} required autoFocus /></label>
            <label className="campo"><span>Precio</span><input className="input" inputMode="decimal" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} placeholder="$0" required /></label>
            <label className="campo"><span>Descripción (opcional)</span><input className="input" value={edit.descripcion} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} maxLength={160} /></label>
            <div className="campo"><span>Categoría</span><Selector etiqueta="Categoría" valor={edit.categoria} onChange={(v) => setEdit({ ...edit, categoria: v })} opciones={cats.map((c) => ({ valor: c.nombre, texto: c.nombre }))} /></div>
            <div className="entre"><span>Activo en Cobro</span><Interruptor etiqueta="Activo en Cobro" checked={edit.activo} onChange={(v) => setEdit({ ...edit, activo: v })} /></div>
            <details className="revisar-p">
              <summary>Más opciones</summary>
              <div className="pila">
                <label className="campo"><span>Duración estimada</span><input className="input" inputMode="numeric" value={edit.duracion} onChange={(e) => setEdit({ ...edit, duracion: e.target.value })} placeholder="Opcional, en minutos" /></label>
                <label className="campo">
                  <span>Comisión del barbero en este servicio<Ayuda titulo="Comisión por servicio">Solo si este servicio paga un porcentaje distinto. Vacío = la comisión de cada barbero.</Ayuda></span>
                  <span className="otra ancho" style={{ background: "#fff" }}><input inputMode="decimal" value={edit.comision} onChange={(e) => setEdit({ ...edit, comision: e.target.value })} placeholder="La de cada barbero" /><span>%</span></span>
                </label>
              </div>
            </details>
            <div className="acciones"><button className="bt" disabled={pendiente}>{pendiente ? "Guardando…" : edit.id ? "Guardar cambios" : "Agregar servicio"}<Fl /></button></div>
          </form>
        </Modal>
      )}

      {borrarCat && (() => {
        const conVentas = borrarCat.conVentas;
        const quitar = () => {
          const a = cats.find((x) => x.id === destino)?.nombre ?? "";
          setServicios(conVentas.length ? servicios.map((x) => (x.categoria === borrarCat.nombre ? { ...x, categoria: a } : x)) : servicios.filter((x) => x.categoria !== borrarCat.nombre));
          setCats(cats.filter((x) => x.id !== borrarCat.id));
          setBorrarCat(null);
        };
        return (
          <Modal abierto cerrar={() => setBorrarCat(null)} etiqueta="Eliminar categoría" titulo={`¿Eliminar ${borrarCat.nombre}?`}>
            {conVentas.length === 0 ? (
              <>
                <p className="muted">{borrarCat.total ? `Sus ${borrarCat.total === 1 ? "servicio no tiene" : `${borrarCat.total} servicios no tienen`} ventas registradas, así que se eliminan con la categoría.` : "No tiene servicios. Se elimina sin afectar nada."}</p>
                <div className="acciones"><button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarCategoria(borrarCat.id, ""), quitar)}>Sí, eliminar<Fl /></button></div>
              </>
            ) : (
              <>
                <p className="muted">Esta categoría tiene {conVentas.length} {conVentas.length === 1 ? "servicio" : "servicios"} con ventas registradas. ¿Qué deseas hacer?</p>
                <div className="opcion-borrar">
                  <b>Opción 1. Reasignar servicios y eliminar categoría</b>
                  <small>Selecciona dónde quieres trasladar sus servicios.</small>
                  <ul className="lista-mini">{de(borrarCat.nombre).map((x) => <li key={x.id}>{x.nombre}</li>)}</ul>
                  <div className="campo"><span>Pasar sus servicios a</span>
                    <Selector etiqueta="Categoría" valor={destino} onChange={setDestino} opciones={cats.filter((x) => x.id !== borrarCat.id).map((x) => ({ valor: x.id, texto: x.nombre }))} /></div>
                  <button type="button" className="bt peligro chico" style={{ justifySelf: "start" }} disabled={pendiente || !destino} onClick={() => correr(() => eliminarCategoria(borrarCat.id, destino), quitar)}>Reasignar y eliminar</button>
                </div>
                <div className="opcion-borrar">
                  <b>Opción 2. Archivar categoría</b>
                  <small>La categoría y sus servicios dejarán de estar disponibles para nuevos cobros. El historial se conservará.</small>
                  <button type="button" className="bt sec solo chico" style={{ justifySelf: "start" }} disabled={pendiente} onClick={() => correr(() => eliminarCategoria(borrarCat.id, null), () => { setCats(cats.map((x) => (x.id === borrarCat.id ? { ...x, activo: false } : x))); setServicios(servicios.map((x) => (x.categoria === borrarCat.nombre ? { ...x, activo: false } : x))); setBorrarCat(null); })}>Archivar categoría</button>
                </div>
                <p className="ayuda-txt">Las ventas anteriores conservarán sus datos originales.</p>
              </>
            )}
          </Modal>
        );
      })()}

      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Eliminar servicio" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Si ya se cobró alguna vez, solo se oculta para no perder las ventas pasadas.</p>
          <div className="acciones">
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarServicio(borrar.id), (r) => { setServicios(r.mensaje?.includes("ocultó") ? servicios.map((x) => (x.id === borrar.id ? { ...x, activo: false } : x)) : servicios.filter((x) => x.id !== borrar.id)); setBorrar(null); })}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Encabezado con el botón principal y la lista. */
export function PantallaServicios(props: { servicios: Servicio[]; categorias: Categoria[]; puedeEditar: boolean }) {
  const [nueva, setNueva] = useState(0);
  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="titulo">Servicios</h1>
          <p className="sub">El precio de aquí es el que se cobra.</p>
        </div>
        {props.puedeEditar && <button type="button" className="bt" onClick={() => setNueva((n) => n + 1)}>Agregar categoría<span className="fl" aria-hidden="true"><Icono n="mas" /></span></button>}
      </div>
      <TablaServicios {...props} nuevaCategoria={nueva} />
    </>
  );
}
