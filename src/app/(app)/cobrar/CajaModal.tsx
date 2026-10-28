"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Fl } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import type { MovimientosTurno } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimiento, type EstadoCaja } from "../caja/actions";

type Turno = {
  desde: string; m: MovimientosTurno; esperado: number; ventas: number;
  otros: { metodo: string; total: number; ventas: number }[];
  movimientos: { id: string; hora: string; titulo: string; detalle: string; monto: number }[];
};
type Pestana = "resumen" | "movimiento" | "gasto" | "cerrar";

const CATEGORIAS = ["Insumos", "Limpieza", "Servicios del local", "Publicidad", "Mantenimiento", "Otros"];

function Estado({ e }: { e: EstadoCaja }) {
  if (e.error) return <p className="aviso error" role="alert">{e.error}</p>;
  if (e.ok && e.mensaje) return <p className="aviso ok" role="status">{e.mensaje}</p>;
  return null;
}

/** Hace que el formulario se limpie después de guardar. */
function useLimpiar(e: EstadoCaja) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (e.ok) ref.current?.reset(); }, [e.n, e.ok]);
  return ref;
}

export function CajaModal({ inicial, turno, limiteDiferencia }: { inicial: Pestana | null; turno: Turno | null; limiteDiferencia: number }) {
  const [abierto, setAbierto] = useState(inicial !== null);
  const [pestana, setPestana] = useState<Pestana>(inicial ?? "resumen");
  const [eAbrir, accAbrir, abriendo] = useActionState<EstadoCaja, FormData>(abrirCaja, {});
  const [eMov, accMov, guardandoMov] = useActionState<EstadoCaja, FormData>(registrarMovimiento, {});
  const [eGasto, accGasto, guardandoGasto] = useActionState<EstadoCaja, FormData>(registrarGasto, {});
  const [eCerrar, accCerrar, cerrando] = useActionState<EstadoCaja, FormData>(cerrarCaja, {});
  const [contado, setContado] = useState("");
  const [revisado, setRevisado] = useState<Record<string, boolean>>({});
  const fMov = useLimpiar(eMov);
  const fGasto = useLimpiar(eGasto);

  useEffect(() => {
    const abrir = (e: Event) => { setPestana(((e as CustomEvent).detail as Pestana) ?? "resumen"); setAbierto(true); };
    window.addEventListener("crabs:caja", abrir);
    return () => window.removeEventListener("crabs:caja", abrir);
  }, []);
  useEffect(() => { if (eAbrir.ok) setAbierto(false); }, [eAbrir.n, eAbrir.ok]);
  useEffect(() => { if (eCerrar.ok) { setContado(""); setRevisado({}); } }, [eCerrar.n, eCerrar.ok]);

  const cerrar = () => setAbierto(false);

  if (!turno) {
    return (
      <Modal abierto={abierto} cerrar={cerrar} etiqueta="Caja" titulo={eCerrar.ok ? "Corte guardado" : "Abrir la caja"}>
        {eCerrar.ok && <p className="aviso ok">{eCerrar.mensaje}</p>}
        <form action={accAbrir} className="pila">
          <label className="campo">
            <span>Fondo de apertura<Ayuda titulo="Fondo de apertura">El efectivo que se deja en la caja al empezar el día para poder dar cambio. Si no hay, escribe 0.</Ayuda></span>
            <input className="input" name="fondo" inputMode="decimal" placeholder="Ejemplo: 500" required autoFocus />
          </label>
          <Estado e={eAbrir} />
          <button className="bt grande" disabled={abriendo}>{abriendo ? "Abriendo…" : "Abrir caja"}<Fl /></button>
        </form>
      </Modal>
    );
  }

  const m = turno.m;
  const contadoC = leerPesos(contado);
  const dif = contadoC === null ? null : contadoC - turno.esperado;

  return (
    <Modal abierto={abierto} cerrar={cerrar} etiqueta={`Caja abierta desde las ${turno.desde}`} titulo="Caja" ancho>
      <div className="seg" role="tablist" aria-label="Opciones de caja">
        {([["resumen", "Resumen"], ["movimiento", "Retiro o entrada"], ["gasto", "Gasto"], ["cerrar", "Corte de caja"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} className={pestana === k ? "on" : ""} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>

      {pestana === "resumen" && (
        <div className="pila">
          <div>
            <span className="lab">Efectivo esperado en caja</span>
            <div className="big" style={{ fontSize: 60, marginTop: 10 }}>{formatoDinero(turno.esperado)}</div>
            <span className="ctx">{turno.ventas} {turno.ventas === 1 ? "venta cobrada" : "ventas cobradas"} desde que se abrió.</span>
          </div>
          <div className="lista">
            <div><span>Fondo de apertura<Ayuda titulo="Fondo de apertura">El efectivo con que se abrió la caja para dar cambio.</Ayuda></span><span className="num">{formatoDinero(m.fondoInicial)}</span></div>
            <div><span>Cobros en efectivo</span><span className="num">{formatoDinero(m.cobrosEfectivo)}</span></div>
            <div><span>Propinas en efectivo<Ayuda titulo="Propinas en efectivo">Son de quien atendió, pero mientras no se entreguen están dentro de la caja. Al entregarlas, regístralas como retiro.</Ayuda></span><span className="num">{formatoDinero(m.propinasEfectivo)}</span></div>
            {m.entradas > 0 && <div><span>Entradas</span><span className="num">{formatoDinero(m.entradas)}</span></div>}
            <div><span>Retiros<Ayuda titulo="Retiros">Efectivo que se sacó de la caja: un depósito al banco, propinas entregadas o dinero que se llevó el propietario.</Ayuda></span><span className="num">{m.retiros ? `−${formatoDinero(m.retiros)}` : formatoDinero(0)}</span></div>
            <div><span>Gastos pagados con la caja<Ayuda titulo="Gastos pagados con la caja">Compras pagadas con el efectivo de la caja, como insumos o limpieza. Se restan porque ese dinero ya no está.</Ayuda></span><span className="num">{m.gastosDeCaja ? `−${formatoDinero(m.gastosDeCaja)}` : formatoDinero(0)}</span></div>
            {m.devolucionesEfectivo > 0 && <div><span>Devoluciones en efectivo</span><span className="num">−{formatoDinero(m.devolucionesEfectivo)}</span></div>}
          </div>
          {turno.otros.length > 0 && (
            <div className="pila-chica">
              <span className="lab">Otras formas de pago</span>
              <div className="lista">
                {turno.otros.map((o) => <div key={o.metodo}><span>{o.metodo}<small>{o.ventas} {o.ventas === 1 ? "venta" : "ventas"}. No entra a la caja física</small></span><span className="num">{formatoDinero(o.total)}</span></div>)}
              </div>
            </div>
          )}
          {turno.movimientos.length > 0 && (
            <div className="pila-chica">
              <span className="lab">Movimientos</span>
              <div className="feed">
                {turno.movimientos.map((x) => <div key={x.id}><span className="t">{x.hora}</span><span>{x.titulo}<small>{x.detalle}</small></span><span className="num">{formatoDinero(x.monto)}</span></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {pestana === "movimiento" && (
        <form action={accMov} ref={fMov} className="pila">
          <div className="seg" role="radiogroup" aria-label="Tipo de movimiento">
            <label><input type="radio" name="tipo" value="retiro" defaultChecked />Retiro</label>
            <label><input type="radio" name="tipo" value="entrada" />Entrada</label>
          </div>
          <p className="ayuda-txt">Retiro: sale efectivo de la caja. Entrada: se agrega efectivo, por ejemplo más cambio.</p>
          <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
          <label className="campo"><span>Para qué</span><input className="input" name="concepto" placeholder="Ejemplo: depósito al banco" required /></label>
          <Estado e={eMov} />
          <div className="acciones"><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      )}

      {pestana === "gasto" && (
        <form action={accGasto} ref={fGasto} className="pila">
          <p className="ayuda-txt">Solo gastos pagados con el efectivo de esta caja.</p>
          <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
          <label className="campo"><span>En qué se gastó</span><input className="input" name="concepto" placeholder="Ejemplo: toallas desechables" required /></label>
          <div className="campo"><span>Tipo de gasto</span><Selector name="categoria" etiqueta="Tipo de gasto" opciones={CATEGORIAS.map((c) => ({ valor: c, texto: c }))} /></div>
          <Estado e={eGasto} />
          <div className="acciones"><button className="bt" disabled={guardandoGasto}>{guardandoGasto ? "Guardando…" : "Guardar gasto"}<Fl /></button></div>
        </form>
      )}

      {pestana === "cerrar" && (
        <form action={accCerrar} className="pila">
          <p className="ayuda-txt">Cuenta el efectivo y revisa que las demás formas de pago coincidan con el banco o la terminal.</p>
          <div className="corte">
            <div style={{ borderTop: 0 }}>
              <span><b>Efectivo</b><small>Esperado {formatoDinero(turno.esperado)}</small></span>
              <input className="input" name="contado" inputMode="decimal" placeholder="Lo que contaste" value={contado} onChange={(e) => setContado(e.target.value)} required aria-label="Efectivo contado" />
              <span className="num" style={{ textAlign: "right", color: dif === null ? undefined : dif === 0 ? "var(--ok)" : "var(--warn)" }}>
                {dif === null ? "" : dif === 0 ? "Cuadra" : dif > 0 ? `Sobran ${formatoDinero(dif)}` : `Faltan ${formatoDinero(-dif)}`}
              </span>
            </div>
            {turno.otros.map((o) => (
              <div key={o.metodo}>
                <span><b>{o.metodo}</b><small>{o.ventas} {o.ventas === 1 ? "venta" : "ventas"}</small></span>
                <span className="num">{formatoDinero(o.total)}</span>
                <label className="fila" style={{ gap: 8, justifyContent: "flex-end", fontSize: 13 }}>
                  <Interruptor name={`ver:${o.metodo}`} etiqueta={`${o.metodo} coincide`} checked={!!revisado[o.metodo]} onChange={(v) => setRevisado((x) => ({ ...x, [o.metodo]: v }))} />
                  Coincide
                </label>
              </div>
            ))}
          </div>
          <label className="campo">
            <span>Notas</span>
            <textarea className="input" name="notas" placeholder={dif !== null && Math.abs(dif) > limiteDiferencia ? "La diferencia es grande. Escribe qué pasó." : "Si algo no coincide, escribe qué pasó."} />
          </label>
          <Estado e={eCerrar} />
          <div className="acciones"><button className="bt" disabled={cerrando}>{cerrando ? "Cerrando…" : "Cerrar la caja"}<Fl /></button></div>
        </form>
      )}
    </Modal>
  );
}
