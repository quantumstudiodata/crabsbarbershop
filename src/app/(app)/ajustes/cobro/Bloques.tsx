"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { alternarCategoria, crearCategoria, eliminarCategoriaGasto, renombrarCategoriaGasto, type EstadoGasto } from "@/app/(app)/analitica/gastos/actions";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector, sinReinicio } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { agregarConcepto, alternarFuncion, alternarMetodoEgreso, type EstadoAjuste, quitarConcepto } from "./actions";

/**
 * Un apartado de Configurar negocio: se despliega para ver cómo está configurado
 * y los cambios se hacen en una ventana, sin salir de la pantalla.
 */
export function Bloque({ numero, titulo, resumen, detalle, puedeEditar, children, abierto }: {
  numero: number; titulo: string; resumen: string; detalle?: React.ReactNode; puedeEditar: boolean; children?: React.ReactNode; abierto?: boolean;
}) {
  const [editar, setEditar] = useState(false);
  return (
    <details className="glass bloque-cfg subir" open={abierto}>
      <summary>
        <span className="num-cfg">{numero}</span>
        <span className="tit-cfg"><b>{titulo}</b><small>{resumen}</small></span>
        <span className="flecha-c" aria-hidden="true">›</span>
      </summary>
      <div className="cuerpo-cfg">
        {detalle}
        {children && (puedeEditar
          ? <button type="button" className="bt sec solo chico" style={{ justifySelf: "start" }} onClick={() => setEditar(true)}><Icono n="editar" />Editar {titulo.toLowerCase()}</button>
          : <p className="ayuda-txt">Solo puedes consultar este apartado.</p>)}
      </div>
      {editar && <Modal abierto cerrar={() => setEditar(false)} etiqueta="Configurar negocio" titulo={titulo} ancho><div className="pila">{children}</div></Modal>}
    </details>
  );
}

/** Lista corta de cómo está configurado un apartado. */
export function Resumen({ filas }: { filas: [string, string][] }) {
  return <div className="datos resumen-cfg">{filas.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}</div>;
}

type Categoria = { id: string; nombre: string; activo: boolean };

export function CategoriasEgresos({ categorias, puede }: { categorias: Categoria[]; puede: boolean }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(crearCategoria, {});
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<EstadoGasto>({});
  const [nueva, setNueva] = useState(false);
  const [renombrar, setRenombrar] = useState<{ c: Categoria; nombre: string } | null>(null);
  const [borrar, setBorrar] = useState<Categoria | null>(null);
  const [todas, setTodas] = useState(false);
  useEffect(() => { if (e.ok) { setNueva(false); setAviso(e); } }, [e.ok, e.n, e]);
  const hacer = (f: () => Promise<EstadoGasto>, despues?: () => void) => iniciar(async () => { const r = await f(); setAviso(r); if (!r.error) despues?.(); });
  return (
    <section className="sub-cfg">
      <div className="entre"><span><b>Categorías</b><small>{categorias.filter((c) => c.activo).length} en uso. Archivar una no cambia los egresos que ya la usan.</small></span>
        {puede && <button type="button" className="bt sec solo chico" onClick={() => setNueva(true)}><Icono n="mas" />Agregar categoría</button>}</div>
      <div className="lista-cfg">
        {(todas ? categorias : categorias.slice(0, 5)).map((c) => (
          <div key={c.id} className={c.activo ? "" : "apagada"}>
            <span><b>{c.nombre}</b></span>
            <span className={`chip-p ${c.activo ? "si" : ""}`}>{c.activo ? "En uso" : "Archivada"}</span>
            {puede ? <MenuPuntos etiqueta={`Opciones de ${c.nombre}`} items={[
              { texto: "Editar nombre", icono: "editar", hacer: () => setRenombrar({ c, nombre: c.nombre }) },
              { texto: c.activo ? "Archivar" : "Volver a usar", icono: c.activo ? "archivo" : "palomita", hacer: () => hacer(() => alternarCategoria(c.id)) },
              { texto: "Eliminar", icono: "basura", peligro: true, hacer: () => setBorrar(c) },
            ]} /> : <span />}
          </div>
        ))}
      </div>
      {categorias.length > 5 && <button type="button" className="link-c ver-mas" onClick={() => setTodas(!todas)}>{todas ? "Ver menos" : `Ver todas (${categorias.length})`}</button>}
      {aviso.error && <p className="aviso error" style={{ margin: 0 }}>{aviso.error}</p>}
      {aviso.mensaje && !aviso.error && <p className="confirma" key={aviso.n}><Icono n="palomita" />{aviso.mensaje}</p>}
      {nueva && (
        <Modal abierto cerrar={() => setNueva(false)} etiqueta="Egresos" titulo="Agregar categoría">
          <form onSubmit={sinReinicio(accion)} className="pila">
            <label className="campo"><span>Nombre de la categoría</span><input className="input" name="nombre" maxLength={40} required autoFocus placeholder="Ejemplo: Productos de limpieza" /></label>
            {e.error && <p className="aviso error">{e.error}</p>}
            <div className="acciones"><button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}<Fl /></button></div>
          </form>
        </Modal>
      )}
      {renombrar && (
        <Modal abierto cerrar={() => setRenombrar(null)} etiqueta="Egresos" titulo="Editar categoría">
          <form className="pila" onSubmit={(x) => { x.preventDefault(); hacer(() => renombrarCategoriaGasto(renombrar.c.id, renombrar.nombre), () => setRenombrar(null)); }}>
            <label className="campo"><span>Nombre de la categoría</span><input className="input" value={renombrar.nombre} onChange={(x) => setRenombrar({ ...renombrar, nombre: x.target.value })} maxLength={40} required autoFocus /></label>
            <p className="ayuda-txt">Los egresos que ya la usan se mueven con el nombre nuevo. Sus importes y fechas no cambian.</p>
            <div className="acciones"><button className="bt" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}<Fl /></button></div>
          </form>
        </Modal>
      )}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Egresos" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Solo se puede eliminar si nunca se usó. Si ya tiene egresos, archívala para conservar el historial.</p>
          <div className="acciones">
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => hacer(() => eliminarCategoriaGasto(borrar.id), () => setBorrar(null))}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
    </section>
  );
}

type Gasto = { id: string; concepto: string; categoria: string; monto: number; metodo: string; periodicidad: string };
const METODOS: [string, string][] = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]];
const PERIODOS: [string, string][] = [["", "Sin periodicidad"], ["diaria", "Diaria"], ["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]];

function FormGasto({ g, categorias, metodos, cerrar }: { g: Gasto | null; categorias: string[]; metodos: string[]; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoAjuste, FormData>(agregarConcepto, {});
  const [categoria, setCategoria] = useState(g?.categoria ?? categorias[0] ?? "");
  const [metodo, setMetodo] = useState(g?.metodo ?? metodos[0] ?? "efectivo");
  const [periodo, setPeriodo] = useState(g?.periodicidad ?? "");
  useEffect(() => { if (e.ok) cerrar(); }, [e.ok, e.n, cerrar]);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Gastos frecuentes" titulo={g ? g.concepto : "Agregar gasto frecuente"}>
      <form onSubmit={sinReinicio(accion)} className="pila">
        {g && <input type="hidden" name="id" value={g.id} />}
        <input type="hidden" name="categoria" value={categoria} />
        <input type="hidden" name="metodo" value={metodo} />
        <input type="hidden" name="periodicidad" value={periodo} />
        <label className="campo"><span>Nombre del gasto</span><input className="input" name="concepto" defaultValue={g?.concepto} maxLength={120} required autoFocus placeholder="Ejemplo: Renta del local" /></label>
        <label className="campo"><span>Importe predeterminado (opcional)</span><input className="input" name="monto" inputMode="decimal" defaultValue={g?.monto ? String(g.monto / 100) : ""} placeholder="$0" /></label>
        <div className="campo"><span>Categoría</span><Selector etiqueta="Categoría" valor={categoria} onChange={setCategoria} opciones={categorias.map((c) => ({ valor: c, texto: c }))} /></div>
        <div className="campo"><span>Método de pago predeterminado</span><Selector etiqueta="Método" valor={metodo} onChange={setMetodo} opciones={METODOS.filter(([k]) => metodos.includes(k) || k === metodo).map(([k, t]) => ({ valor: k, texto: t }))} /></div>
        <div className="campo"><span>Periodicidad (opcional)</span><Selector etiqueta="Periodicidad" valor={periodo} onChange={setPeriodo} opciones={PERIODOS.map(([k, t]) => ({ valor: k, texto: t }))} /></div>
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones"><button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}<Fl /></button></div>
      </form>
    </Modal>
  );
}

export function GastosFrecuentes({ gastos, categorias, metodos, puede }: { gastos: Gasto[]; categorias: string[]; metodos: string[]; puede: boolean }) {
  const [form, setForm] = useState<{ g: Gasto | null } | null>(null);
  const [borrar, setBorrar] = useState<Gasto | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <section className="sub-cfg">
      <div className="entre"><span><b>Gastos frecuentes</b><small>Aparecen como atajo al registrar un egreso, con sus datos ya llenos.</small></span>
        {puede && gastos.length > 0 && <button type="button" className="bt sec solo chico" onClick={() => setForm({ g: null })}><Icono n="mas" />Crear gasto frecuente</button>}</div>
      {gastos.length === 0 ? (
        <div className="vacio-cfg">
          <span><b>Todavía no tienes gastos frecuentes</b><small>Puedes crear uno cuando quieras.</small></span>
          {puede && <button type="button" className="bt sec solo chico" onClick={() => setForm({ g: null })}><Icono n="mas" />Crear gasto frecuente</button>}
        </div>
      ) : (
        <div className="lista-cfg">
          {gastos.map((g) => (
            <div key={g.id}>
              <span><b>{g.concepto}</b><small>{[g.categoria, PERIODOS.find(([k]) => k === g.periodicidad && k)?.[1].toLowerCase(), METODOS.find(([k]) => k === g.metodo)?.[1].toLowerCase()].filter(Boolean).join(", ")}</small></span>
              <b className="num">{g.monto ? formatoDinero(g.monto) : ""}</b>
              {puede ? <MenuPuntos etiqueta={`Opciones de ${g.concepto}`} items={[
                { texto: "Editar", icono: "editar", hacer: () => setForm({ g }) },
                { texto: "Eliminar", icono: "basura", peligro: true, hacer: () => setBorrar(g) },
              ]} /> : <span />}
            </div>
          ))}
        </div>
      )}
      {form && <FormGasto g={form.g} categorias={categorias} metodos={metodos} cerrar={() => setForm(null)} />}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Gastos frecuentes" titulo={`¿Eliminar ${borrar.concepto}?`}>
          <p className="muted">Solo se quita de la lista. Los egresos que ya se registraron con él no cambian.</p>
          <div className="acciones"><button type="button" className="bt peligro" disabled={pendiente} onClick={() => iniciar(async () => { await quitarConcepto(borrar.id); setBorrar(null); })}>Sí, eliminar<Fl /></button></div>
        </Modal>
      )}
    </section>
  );
}

/** Qué información y opciones hay al registrar un egreso, como una lista de configuración. */
export function OpcionesRegistro({ metodos, comprobantes, obligatorio = false, periodicidad, puede }: { metodos: string[]; comprobantes: boolean; obligatorio?: boolean; periodicidad: boolean; puede: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mets, setMets] = useState(metodos);
  const [fun, setFun] = useState({ comprobantes, obligatorio, periodicidad });
  const opciones: ["comprobantes" | "obligatorio" | "periodicidad", string, string][] = [
    ["comprobantes", "Comprobantes", fun.comprobantes ? "Se puede adjuntar foto o archivo a los egresos con transferencia o tarjeta. En efectivo no se pide." : "Los egresos se registran sin adjuntar comprobante."],
    ...(fun.comprobantes ? [["obligatorio", "Comprobante obligatorio", fun.obligatorio
      ? "Cada egreso pagado con transferencia o tarjeta necesita su comprobante para guardarse."
      : "El comprobante es opcional: se puede guardar el egreso sin adjuntarlo."] as ["obligatorio", string, string]] : []),
    ["periodicidad", "Periodicidad", fun.periodicidad ? "Cada egreso puede marcarse como diario, semanal, quincenal o mensual." : "Todos los egresos se registran como de una sola vez."],
  ];
  return (
    <section className="sub-cfg">
      <span><b>Al registrar un egreso</b><small>Qué se pide y qué opciones aparecen.</small></span>
      <div className="eg-formas">
        <span className="sub-a">Formas de pago permitidas</span>
        <div className="eg-chips" role="group" aria-label="Formas de pago para egresos">
          {METODOS.map(([k, t]) => (
            <button key={k} type="button" aria-pressed={mets.includes(k)} disabled={!puede || pendiente} className={`chipf ${mets.includes(k) ? "on-suave" : ""}`}
              onClick={() => {
                // Cambia al momento; si el servidor no lo acepta, regresa a como estaba.
                const antes = mets;
                setMets(mets.includes(k) ? mets.filter((x) => x !== k) : [...mets, k]);
                iniciar(async () => { const r = await alternarMetodoEgreso(k); setError(r.error ?? null); if (r.error) setMets(antes); });
              }}>{mets.includes(k) && <Icono n="palomita" />}{t}</button>
          ))}
        </div>
        <small className="muted">Solo el efectivo que sale de la caja afecta el corte.</small>
      </div>
      <div className="lista-cfg sin-chip">
        {opciones.map(([k, t, d]) => (
          <label key={k} className={`${fun[k] ? "" : "apagada"} ${k === "obligatorio" ? "sangria" : ""}`}>
            <span><b>{t}</b><small>{d}</small></span>
            <Interruptor etiqueta={t} checked={fun[k]} disabled={!puede} onChange={() => { setFun({ ...fun, [k]: !fun[k] }); iniciar(async () => { await alternarFuncion(k); }); }} />
          </label>
        ))}
      </div>
      {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
    </section>
  );
}
