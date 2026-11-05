"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { alternarCategoria, crearCategoria, eliminarCategoriaGasto, type EstadoGasto } from "@/app/(app)/analitica/gastos/actions";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
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
  const [borrar, setBorrar] = useState<Categoria | null>(null);
  useEffect(() => { if (e.ok) { setNueva(false); setAviso(e); } }, [e.ok, e.n, e]);
  return (
    <div className="sub-cfg">
      <div className="entre"><span><b>Categorías de egresos</b><small>Toca una para archivarla o volver a usarla. Archivar no cambia los egresos que ya la usan.</small></span>
        {puede && <button type="button" className="bt sec solo chico" onClick={() => setNueva(true)}><Icono n="mas" />Agregar categoría</button>}</div>
      <div className="chips-cat">
        {categorias.map((c) => (
          <span key={c.id} className={`chip-cat ${c.activo ? "on" : ""}`}>
            <button type="button" disabled={pendiente || !puede} aria-pressed={c.activo} title={c.activo ? "Archivar" : "Volver a usar"}
              onClick={() => iniciar(async () => setAviso(await alternarCategoria(c.id)))}><Icono n={c.activo ? "palomita" : "cerrar"} />{c.nombre}</button>
            {puede && <button type="button" className="x-cat" aria-label={`Eliminar ${c.nombre}`} title="Eliminar" onClick={() => setBorrar(c)}><Icono n="basura" /></button>}
          </span>
        ))}
      </div>
      {aviso.error && <p className="aviso error" style={{ margin: 0 }}>{aviso.error}</p>}
      {aviso.mensaje && !aviso.error && <p className="aviso ok" style={{ margin: 0 }}>{aviso.mensaje}</p>}
      {nueva && (
        <Modal abierto cerrar={() => setNueva(false)} etiqueta="Egresos" titulo="Agregar categoría">
          <form action={accion} className="pila">
            <label className="campo"><span>Nombre de la categoría</span><input className="input" name="nombre" maxLength={40} required autoFocus placeholder="Ejemplo: Productos de limpieza" /></label>
            {e.error && <p className="aviso error">{e.error}</p>}
            <div className="acciones"><button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}<Fl /></button></div>
          </form>
        </Modal>
      )}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Egresos" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Solo se puede eliminar si nunca se usó. Si ya tiene egresos, archívala para conservar el historial.</p>
          <div className="acciones">
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => iniciar(async () => { setAviso(await eliminarCategoriaGasto(borrar.id)); setBorrar(null); })}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Gasto = { id: string; concepto: string; categoria: string; monto: number; metodo: string; periodicidad: string };
const METODOS: [string, string][] = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]];
const PERIODOS: [string, string][] = [["", "Sin periodicidad"], ["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]];

function FormGasto({ g, categorias, metodos, cerrar }: { g: Gasto | null; categorias: string[]; metodos: string[]; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoAjuste, FormData>(agregarConcepto, {});
  const [categoria, setCategoria] = useState(g?.categoria ?? categorias[0] ?? "");
  const [metodo, setMetodo] = useState(g?.metodo ?? metodos[0] ?? "efectivo");
  const [periodo, setPeriodo] = useState(g?.periodicidad ?? "");
  useEffect(() => { if (e.ok) cerrar(); }, [e.ok, e.n, cerrar]);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Gastos frecuentes" titulo={g ? g.concepto : "Agregar gasto frecuente"}>
      <form action={accion} className="pila">
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
    <div className="sub-cfg">
      <div className="entre"><span><b>Gastos frecuentes</b><small>Guarda los gastos habituales de tu negocio para registrarlos más rápidamente cuando vuelvan a ocurrir.</small></span>
        {puede && <button type="button" className="bt sec solo chico" onClick={() => setForm({ g: null })}><Icono n="mas" />Agregar gasto frecuente</button>}</div>
      {gastos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Todavía no hay gastos frecuentes.</p> : (
        <div className="lista-cf">
          {gastos.map((g) => (
            <div key={g.id}>
              <span><b>{g.concepto}</b><small>{[g.categoria, PERIODOS.find(([k]) => k === g.periodicidad && k)?.[1].toLowerCase(), METODOS.find(([k]) => k === g.metodo)?.[1].toLowerCase()].filter(Boolean).join(", ")}</small></span>
              <b className="num">{g.monto ? formatoDinero(g.monto) : ""}</b>
              {puede && <span className="fila" style={{ gap: 4 }}>
                <button type="button" className="icb" onClick={() => setForm({ g })} aria-label={`Editar ${g.concepto}`} title="Editar"><Icono n="editar" /></button>
                <button type="button" className="icb" onClick={() => setBorrar(g)} aria-label={`Eliminar ${g.concepto}`} title="Eliminar"><Icono n="basura" /></button>
              </span>}
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
    </div>
  );
}

/** Formas de pago de egresos y funciones opcionales al registrar un egreso. */
export function OpcionesRegistro({ metodos, comprobantes, periodicidad, puede }: { metodos: string[]; comprobantes: boolean; periodicidad: boolean; puede: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const opciones: [string, string, string, boolean][] = [
    ["comprobantes", "Registro de comprobantes", "Permite adjuntar fotografías o archivos a cada egreso.", comprobantes],
    ["periodicidad", "Periodicidad de gastos", "Permite marcar cada egreso como semanal, quincenal o mensual.", periodicidad],
  ];
  return (
    <div className="sub-cfg">
      <span><b>Opciones de registro</b><small>Apagar una opción solo la esconde. Lo que ya se registró se conserva.</small></span>
      <div className="opc-reg">
        <div className="ajuste-f">
          <span><b>Métodos de pago de egresos</b><small>Solo el efectivo que sale de la caja afecta el corte de caja.</small></span>
          <div className="metodos-eg">
            {METODOS.map(([k, t]) => (
              <label key={k} className="entre"><span>{t}</span><Interruptor etiqueta={`${t} para egresos`} checked={metodos.includes(k)} disabled={!puede || pendiente}
                onChange={() => iniciar(async () => { const r = await alternarMetodoEgreso(k); setError(r.error ?? null); })} /></label>
            ))}
          </div>
        </div>
        {opciones.map(([k, t, d, v]) => (
          <label key={k} className="ajuste-f entre">
            <span><b>{t}</b><small>{d}</small></span>
            <Interruptor etiqueta={t} checked={v} disabled={!puede || pendiente} onChange={() => iniciar(async () => { await alternarFuncion(k); })} />
          </label>
        ))}
      </div>
      {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
