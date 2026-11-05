"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Modal } from "@/components/ui";
import { alternarPuesto, eliminarPuesto, guardarPuesto, type EstadoPuesto } from "./puestos";
import { EditorPermisos, type GrupoPermisos, type OpcionPuesto } from "./Permisos";

export type PuestoNegocio = OpcionPuesto & { id: string; activo: boolean; base: string; usuarios: number };


/** Crear o editar un puesto: nombre, descripción, plantilla de partida y permisos. */
function FormPuesto({ puesto, plantillas, grupos, descuentoLibre, cerrar, listo }: {
  puesto: PuestoNegocio | null; plantillas: OpcionPuesto[]; grupos: GrupoPermisos[]; descuentoLibre: boolean; cerrar: () => void; listo: (m: string) => void;
}) {
  const [e, accion, guardando] = useActionState<EstadoPuesto, FormData>(guardarPuesto, {});
  const [base, setBase] = useState(puesto ? "" : "personalizado");
  const [marcados, setMarcados] = useState(() => new Set<string>(puesto?.permisos ?? []));
  useEffect(() => { if (e.ok) listo(e.mensaje ?? ""); }, [e.ok, e.n, e.mensaje, listo]);
  const elegir = (v: string) => {
    setBase(v);
    const p = plantillas.find((x) => x.rol === v);
    setMarcados(new Set(p ? p.permisos : []));
  };
  return (
    <Modal abierto cerrar={cerrar} etiqueta={puesto ? "Editar puesto" : "Nuevo puesto"} titulo={puesto ? puesto.texto : "Agregar puesto"} ancho>
      <form action={accion} className="pila">
        {puesto && <input type="hidden" name="id" value={puesto.id} />}
        <label className="campo"><span>Nombre del puesto</span><input className="input" name="nombre" defaultValue={puesto?.texto} placeholder="Ejemplo: Recepcionista" required maxLength={40} /></label>
        <label className="campo"><span>Descripción (opcional)</span><input className="input" name="descripcion" defaultValue={puesto?.detalle} placeholder="Ejemplo: Recibe a los clientes y cobra" maxLength={140} /></label>
        {!puesto && (
          <div className="campo">
            <span>Empezar desde</span>
            <input type="hidden" name="plantilla" value={base === "personalizado" ? "duena" : base} />
            <div className="seg-p" role="radiogroup" aria-label="Empezar desde">
              <button type="button" role="radio" aria-checked={base === "personalizado"} onClick={() => elegir("personalizado")}>Personalizado</button>
              {plantillas.map((p) => <button key={p.rol} type="button" role="radio" aria-checked={base === p.rol} onClick={() => elegir(p.rol)}>{p.texto}</button>)}
            </div>
            <small className="muted">{base === "personalizado" ? "Empieza sin permisos y enciende los que necesite." : "Los permisos de la plantilla quedan marcados; ajústalos antes de guardar."}</small>
          </div>
        )}
        <span className="paso-t">Permisos del puesto</span>
        <EditorPermisos grupos={grupos} marcados={marcados} cambiar={setMarcados} descuentoLibre={descuentoLibre} />
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones"><button className="bt" disabled={guardando}>{guardando ? "Guardando…" : puesto ? "Guardar cambios" : "Crear puesto"}<Fl /></button></div>
      </form>
    </Modal>
  );
}

export function Puestos({ plantillas, puestos, grupos, descuentoLibre, puedeEditar, nuevo }: {
  plantillas: OpcionPuesto[]; puestos: PuestoNegocio[]; grupos: GrupoPermisos[]; descuentoLibre: boolean; puedeEditar: boolean; nuevo: number;
}) {
  const [form, setForm] = useState<{ p: PuestoNegocio | null } | null>(null);
  const [ver, setVer] = useState<OpcionPuesto | null>(null);
  const [borrar, setBorrar] = useState<{ p: PuestoNegocio; paso: "confirmar" | "definitivo" } | null>(null);
  const [escrito, setEscrito] = useState("");
  const [aviso, setAviso] = useState<EstadoPuesto>({});
  const [pendiente, iniciar] = useTransition();
  const [lista, setLista] = useState(false);
  useEffect(() => { if (nuevo > 0) setLista(true); }, [nuevo]);
  const total = grupos.reduce((a, g) => a + g.permisos.length, 0);
  const ejecutar = (f: () => Promise<EstadoPuesto>) => iniciar(async () => {
    const r = await f();
    if (r.conUsuarios && !r.error && borrar) { setBorrar({ p: borrar.p, paso: "definitivo" }); setEscrito(""); return; }
    setBorrar(null);
    setAviso(r);
  });

  return (
    <>
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.mensaje && <p className="aviso ok">{aviso.mensaje}</p>}
      {lista && !form && !ver && !borrar && (
        <Modal abierto cerrar={() => setLista(false)} etiqueta="Usuarios" titulo="Puestos" ancho>
          <div className="entre" style={{ gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>Las plantillas son el punto de partida. Los puestos del negocio guardan sus propios permisos.</p>
            {puedeEditar && <button type="button" className="bt chico" onClick={() => setForm({ p: null })}><Icono n="mas" />Crear puesto</button>}
          </div>
          <div className="lista-pu">
            {plantillas.map((p) => (
              <div key={p.valor} role="button" tabIndex={0} onClick={() => setVer(p)} onKeyDown={(e) => { if (e.key === "Enter") setVer(p); }}>
                <span><b>{p.texto}</b><small>{p.detalle}</small></span>
                <span className="chip-p">Plantilla</span>
                <small className="muted">{p.permisos.length} de {total}</small>
                <span className="flecha-c" aria-hidden="true">›</span>
              </div>
            ))}
            {puestos.map((p) => (
              <div key={p.id} className={p.activo ? "" : "inactivo"} role="button" tabIndex={0} onClick={() => setVer(p)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setVer(p); }}>
                <span><b>{p.texto}</b><small>{p.detalle || `Parte de ${p.base}`}, {p.usuarios} {p.usuarios === 1 ? "usuario" : "usuarios"}</small></span>
                <span className={`chip-p ${p.activo ? "si" : ""}`}>{p.activo ? "Activo" : "Desactivado"}</span>
                <small className="muted">{p.permisos.length} de {total}</small>
                {puedeEditar ? <MenuPuntos etiqueta={`Opciones de ${p.texto}`} items={[
                  { texto: "Editar puesto", icono: "editar", hacer: () => setForm({ p }) },
                  { texto: p.activo ? "Desactivar" : "Reactivar", icono: p.activo ? "candado" : "palomita", hacer: () => ejecutar(() => alternarPuesto(p.id)) },
                  { texto: "Eliminar puesto", icono: "basura", peligro: true, hacer: () => setBorrar({ p, paso: "confirmar" }) },
                ]} /> : <span />}
              </div>
            ))}
          </div>
          {aviso.mensaje && <p className="aviso ok" style={{ margin: 0 }}>{aviso.mensaje}</p>}
        </Modal>
      )}

      {form && <FormPuesto puesto={form.p} plantillas={plantillas} grupos={grupos} descuentoLibre={descuentoLibre} cerrar={() => setForm(null)} listo={(m) => { setForm(null); setAviso({ ok: true, mensaje: m }); }} />}
      {ver && (
        <Modal abierto cerrar={() => setVer(null)} etiqueta={"id" in ver ? "Puesto del negocio" : "Plantilla"} titulo={ver.texto} ancho>
          <p className="muted">{ver.detalle || "Puesto personalizado"}</p>
          <EditorPermisos grupos={grupos} marcados={new Set(ver.permisos)} descuentoLibre={descuentoLibre} soloLectura />
          {!("id" in ver) && <p className="ayuda-txt">Al asignar esta plantilla a una persona, sus permisos se cargan solos y se pueden ajustar solo para ella.</p>}
        </Modal>
      )}
      {borrar?.paso === "confirmar" && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Eliminar puesto" titulo={`¿Eliminar ${borrar.p.texto}?`}>
          <p className="muted">{borrar.p.usuarios
            ? `${borrar.p.usuarios} ${borrar.p.usuarios === 1 ? "usuario tiene" : "usuarios tienen"} este puesto. ${borrar.p.activo ? "Primero se desactiva: así ya no tienen acceso y sus datos se conservan." : "Ya está desactivado; el siguiente paso borra sus datos."}`
            : "Nadie tiene este puesto. Se borra sin afectar ningún registro."}</p>
          <div className="acciones">
            {borrar.p.usuarios > 0 && borrar.p.activo
              ? <button type="button" className="bt peligro" disabled={pendiente} onClick={() => ejecutar(() => alternarPuesto(borrar.p.id))}>Desactivar puesto<Fl /></button>
              : <button type="button" className="bt peligro" disabled={pendiente} onClick={() => ejecutar(() => eliminarPuesto(borrar.p.id))}>{borrar.p.usuarios ? "Continuar" : "Sí, eliminar"}<Fl /></button>}
          </div>
        </Modal>
      )}
      {borrar?.paso === "definitivo" && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Eliminación definitiva" titulo={`Borrar ${borrar.p.texto} y sus usuarios`}>
          <div className="aviso-borrar">
            <span className="icono-alerta grande"><Icono n="basura" /></span>
            <p><b>Esto no se puede deshacer.</b><br />Se borran el nombre, usuario, contraseña y permisos de {borrar.p.usuarios} {borrar.p.usuarios === 1 ? "persona" : "personas"}. Sus ventas, cortes y pagos se quedan para que las cuentas cuadren y aparecerán en los registros como &quot;Usuario eliminado&quot;.</p>
          </div>
          <label className="campo"><span>Escribe {borrar.p.texto} para confirmar</span><input className="input" value={escrito} onChange={(x) => setEscrito(x.target.value)} autoComplete="off" /></label>
          <div className="acciones">
            <button type="button" className="bt peligro" disabled={pendiente || escrito.trim().toLowerCase() !== borrar.p.texto.toLowerCase()} onClick={() => ejecutar(() => eliminarPuesto(borrar.p.id, true))}>{pendiente ? "Borrando…" : "Eliminar definitivamente"}<Fl /></button>
          </div>
        </Modal>
      )}
    </>
  );
}
