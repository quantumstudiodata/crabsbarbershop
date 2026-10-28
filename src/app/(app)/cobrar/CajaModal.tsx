"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import type { MovimientosTurno } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimiento, type EstadoCaja } from "../caja/actions";

export type Turno = {
  desde: string; abrio: string; deOtroDia: boolean; m: MovimientosTurno; esperado: number; ventas: number;
  otros: { metodo: string; total: number; ventas: number }[];
  movimientos: { id: string; hora: string; titulo: string; detalle: string; monto: number }[];
};
type Vista = "abrir" | "detalle" | "retiro" | "gasto" | "corte";

const CATEGORIAS = ["Insumos", "Limpieza", "Servicios del local", "Publicidad", "Mantenimiento", "Otros"];
const abrirVista = (v: Vista) => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: v }));

function Estado({ e }: { e: EstadoCaja }) {
  if (e.error) return <p className="aviso error" role="alert">{e.error}</p>;
  return null;
}

/** Barra de la caja, siempre visible arriba de Cobro. */
export function BarraCaja({ turno, opera, folio }: { turno: Turno | null; opera: boolean; folio: string }) {
  if (!turno) {
    return (
      <div className="barra-caja cerrada subir">
        <span className="icono-caja" aria-hidden="true"><Icono n="caja" /></span>
        <span><b>La caja está cerrada</b><small>{opera ? "Ábrela con el efectivo para dar cambio y empieza a cobrar." : "Pide que la abran para poder cobrar."}</small></span>
        {opera && <button type="button" className="bt" onClick={() => abrirVista("abrir")}>Abrir caja<Fl /></button>}
      </div>
    );
  }
  return (
    <div className={`barra-caja subir ${turno.deOtroDia ? "atrasada" : ""}`}>
      <span className="icono-caja abierta" aria-hidden="true"><Icono n="caja" /></span>
      <span>
        <b className="vivo" style={{ color: turno.deOtroDia ? "var(--warn)" : undefined }}>{turno.deOtroDia ? "Caja abierta desde ayer" : "Caja abierta"}</b>
        <small>Desde las {turno.desde}, la abrió {turno.abrio}. Siguiente folio <span className="folio">{folio}</span></small>
      </span>
      <button type="button" className="dato-caja" onClick={() => abrirVista("detalle")} disabled={!opera}>
        <small>Efectivo esperado</small><b>{formatoDinero(turno.esperado)}</b>
      </button>
      {opera && (
        <span className="fila" style={{ gap: 6 }}>
          <button type="button" className="bt sec solo chico" onClick={() => abrirVista("retiro")}><Icono n="salida" />Retiro</button>
          <button type="button" className="bt sec solo chico" onClick={() => abrirVista("gasto")}><Icono n="etiqueta" />Gasto</button>
          <button type="button" className="bt chico solo" onClick={() => abrirVista("corte")}><Icono n="candado" />Corte de caja</button>
        </span>
      )}
    </div>
  );
}

function useLimpiar(e: EstadoCaja) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (e.ok) ref.current?.reset(); }, [e.n, e.ok]);
  return ref;
}

export function CajaModal({ inicial, turno, limiteDiferencia }: { inicial: Vista | null; turno: Turno | null; limiteDiferencia: number }) {
  const [vista, setVista] = useState<Vista | null>(inicial);
  const [eAbrir, accAbrir, abriendo] = useActionState<EstadoCaja, FormData>(abrirCaja, {});
  const [eMov, accMov, guardandoMov] = useActionState<EstadoCaja, FormData>(registrarMovimiento, {});
  const [eGasto, accGasto, guardandoGasto] = useActionState<EstadoCaja, FormData>(registrarGasto, {});
  const [eCerrar, accCerrar, cerrando] = useActionState<EstadoCaja, FormData>(cerrarCaja, {});
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");
  const [revisado, setRevisado] = useState<Record<string, boolean>>({});
  const [tipoMov, setTipoMov] = useState<"retiro" | "entrada">("retiro");
  const [concepto, setConcepto] = useState("");
  const fGasto = useLimpiar(eGasto);
  const [hecho, setHecho] = useState<string | null>(null);

  useEffect(() => {
    const abrir = (e: Event) => { setHecho(null); setVista((e as CustomEvent).detail as Vista); };
    window.addEventListener("crabs:caja", abrir);
    return () => window.removeEventListener("crabs:caja", abrir);
  }, []);
  useEffect(() => { if (eAbrir.ok) { setVista(null); setFondo(""); } }, [eAbrir.n, eAbrir.ok]);
  useEffect(() => { if (eMov.ok) { setHecho(eMov.mensaje ?? null); setConcepto(""); } }, [eMov.n, eMov.ok, eMov.mensaje]);
  useEffect(() => { if (eGasto.ok) setHecho(eGasto.mensaje ?? null); }, [eGasto.n, eGasto.ok, eGasto.mensaje]);
  useEffect(() => { if (eCerrar.ok) { setHecho(eCerrar.mensaje ?? null); setContado(""); setRevisado({}); } }, [eCerrar.n, eCerrar.ok, eCerrar.mensaje]);

  const cerrar = () => { setVista(null); setHecho(null); };
  const listo = (titulo: string) => (
    <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo={titulo}>
      <div className="cronometro"><span className="exito"><Icono n="palomita" /></span><p className="muted">{hecho}</p></div>
      <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
    </Modal>
  );
  if (!vista) return null;
  if (hecho) return listo(vista === "corte" ? "Corte guardado" : "Guardado");

  if (vista === "abrir" || !turno) {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Abrir la caja">
        <form action={accAbrir} className="pila">
          <div className="tarjeta-m">
            <label className="campo">
              <span>Fondo de apertura<Ayuda titulo="Fondo de apertura">El efectivo que se deja en la caja al empezar para poder dar cambio. Si no hay, escribe 0.</Ayuda></span>
              <input className="input grande" name="fondo" inputMode="decimal" placeholder="$0" value={fondo} onChange={(e) => setFondo(e.target.value)} required autoFocus />
            </label>
            <div className="billetes">{[0, 300, 500, 1000].map((v) => <button type="button" key={v} onClick={() => setFondo(String(v))}>{formatoDinero(v * 100)}</button>)}</div>
          </div>
          <p className="ayuda-txt">Se abre para todo el equipo. Cualquiera puede cobrar mientras esté abierta.</p>
          <Estado e={eAbrir} />
          <div className="acciones"><button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button><button className="bt" disabled={abriendo}>{abriendo ? "Abriendo…" : "Abrir caja"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  const m = turno.m;
  if (vista === "detalle") {
    return (
      <Modal abierto cerrar={cerrar} etiqueta={`Caja abierta desde las ${turno.desde}`} titulo={`La abrió ${turno.abrio}`}>
        <div className="caja-hero">
          <span className="lab">Efectivo esperado en caja<Ayuda titulo="Efectivo esperado">El fondo de apertura más los cobros y propinas en efectivo, menos retiros y gastos pagados con la caja.<br /><br />Al cerrar, se compara con lo que se cuente.</Ayuda></span>
          <div className="big">{formatoDinero(turno.esperado)}</div>
          <small>{turno.ventas} {turno.ventas === 1 ? "venta cobrada" : "ventas cobradas"} en este turno</small>
        </div>
        <div className="tarjeta-m">
          <div className="lista">
            <div><span>Fondo de apertura<Ayuda titulo="Fondo de apertura">El efectivo con que se abrió la caja para dar cambio.</Ayuda></span><span className="num">{formatoDinero(m.fondoInicial)}</span></div>
            <div><span>Cobros en efectivo</span><span className="num">{formatoDinero(m.cobrosEfectivo)}</span></div>
            <div><span>Propinas en efectivo<Ayuda titulo="Propinas en efectivo">Son de quien atendió, pero mientras no se entreguen están en la caja. Al entregarlas, regístralas como retiro.</Ayuda></span><span className="num">{formatoDinero(m.propinasEfectivo)}</span></div>
            {m.entradas > 0 && <div><span>Entradas</span><span className="num">{formatoDinero(m.entradas)}</span></div>}
            <div><span>Retiros<Ayuda titulo="Retiros">Efectivo que se sacó de la caja: un depósito al banco, propinas entregadas o dinero que se llevó el propietario.</Ayuda></span><span className="num">{m.retiros ? `−${formatoDinero(m.retiros)}` : "$0"}</span></div>
            <div><span>Gastos pagados con la caja<Ayuda titulo="Gastos pagados con la caja">Compras pagadas con el efectivo de la caja, como insumos o limpieza.</Ayuda></span><span className="num">{m.gastosDeCaja ? `−${formatoDinero(m.gastosDeCaja)}` : "$0"}</span></div>
            {m.devolucionesEfectivo > 0 && <div><span>Devoluciones en efectivo</span><span className="num">−{formatoDinero(m.devolucionesEfectivo)}</span></div>}
          </div>
        </div>
        {turno.otros.length > 0 && (
          <div className="tarjeta-m">
            <span className="lab">No entran a la caja física</span>
            <div className="lista">{turno.otros.map((o) => <div key={o.metodo}><span>{o.metodo}<small>{o.ventas} {o.ventas === 1 ? "venta" : "ventas"}</small></span><span className="num">{formatoDinero(o.total)}</span></div>)}</div>
          </div>
        )}
        {turno.movimientos.length > 0 && (
          <div className="tarjeta-m">
            <span className="lab">Movimientos</span>
            <div className="feed">{turno.movimientos.map((x) => <div key={x.id}><span className="t">{x.hora}</span><span>{x.titulo}<small>{x.detalle}</small></span><span className="num">{formatoDinero(x.monto)}</span></div>)}</div>
          </div>
        )}
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={() => setVista("retiro")}><Icono n="salida" />Retiro</button>
          <button type="button" className="bt sec solo" onClick={() => setVista("gasto")}><Icono n="etiqueta" />Gasto</button>
          <button type="button" className="bt solo" onClick={() => setVista("corte")}><Icono n="candado" />Corte de caja</button>
        </div>
      </Modal>
    );
  }

  if (vista === "retiro") {
    const sugeridos = tipoMov === "retiro" ? ["Depósito al banco", "Propinas entregadas", "Lo llevó el propietario"] : ["Más cambio", "Reposición del fondo"];
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Retiro o entrada de efectivo">
        <form action={accMov} className="pila">
          <div className="opciones-t" role="radiogroup">
            <label className="opcion-t"><input type="radio" name="tipo" value="retiro" checked={tipoMov === "retiro"} onChange={() => setTipoMov("retiro")} />
              <span className="fila" style={{ gap: 8 }}><span className="ic-op"><Icono n="salida" /></span><b>Retiro</b></span><small>Sale efectivo de la caja</small></label>
            <label className="opcion-t"><input type="radio" name="tipo" value="entrada" checked={tipoMov === "entrada"} onChange={() => setTipoMov("entrada")} />
              <span className="fila" style={{ gap: 8 }}><span className="ic-op"><Icono n="entrada" /></span><b>Entrada</b></span><small>Se agrega efectivo, como más cambio</small></label>
          </div>
          <div className="tarjeta-m">
            <label className="campo"><span>Monto</span><input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus /></label>
            <label className="campo"><span>Para qué</span><input className="input" name="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Escribe o elige abajo" required /></label>
            <div className="billetes">{sugeridos.map((x) => <button type="button" key={x} onClick={() => setConcepto(x)}>{x}</button>)}</div>
          </div>
          <Estado e={eMov} />
          <div className="acciones"><button type="button" className="bt sec solo" onClick={() => setVista("detalle")}>Regresar</button><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  if (vista === "gasto") {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Gasto pagado con la caja">
        <form action={accGasto} ref={fGasto} className="pila">
          <div className="tarjeta-m">
            <label className="campo"><span>Monto</span><input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus /></label>
            <label className="campo"><span>En qué se gastó</span><input className="input" name="concepto" placeholder="Ejemplo: toallas desechables" required /></label>
            <div className="campo"><span>Tipo de gasto</span><Selector name="categoria" etiqueta="Tipo de gasto" opciones={CATEGORIAS.map((c) => ({ valor: c, texto: c }))} /></div>
          </div>
          <p className="ayuda-txt">Solo gastos pagados con el efectivo de esta caja. Se restan del efectivo esperado.</p>
          <Estado e={eGasto} />
          <div className="acciones"><button type="button" className="bt sec solo" onClick={() => setVista("detalle")}>Regresar</button><button className="bt" disabled={guardandoGasto}>{guardandoGasto ? "Guardando…" : "Guardar gasto"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  // Corte de caja: el efectivo se cuenta; transferencias y tarjeta se comparan con el banco y los comprobantes.
  const contadoC = leerPesos(contado);
  const dif = contadoC === null ? null : contadoC - turno.esperado;
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Turno desde las ${turno.desde}`} titulo="Corte de caja" ancho>
      <form action={accCerrar} className="pila">
        <div className="tarjeta-m">
          <div className="corte">
            <div style={{ borderTop: 0 }}>
              <span><b>Efectivo</b><small>Se cuenta</small></span>
              <span><small>Esperado</small><b className="num">{formatoDinero(turno.esperado)}</b></span>
              <span className="pila-chica">
                <input className="input" name="contado" inputMode="decimal" placeholder="Contado" value={contado} onChange={(e) => setContado(e.target.value)} required aria-label="Efectivo contado" autoFocus />
                {dif !== null && <small style={{ color: dif === 0 ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{dif === 0 ? "Cuadra" : dif > 0 ? `Sobran ${formatoDinero(dif)}` : `Faltan ${formatoDinero(-dif)}`}</small>}
              </span>
            </div>
            {turno.otros.map((o) => (
              <div key={o.metodo}>
                <span><b>{o.metodo}</b><small>{/tarjeta/i.test(o.metodo) ? "Comprobantes de la terminal" : "Revisar en el banco"}</small></span>
                <span><small>Registrado</small><b className="num">{formatoDinero(o.total)}</b></span>
                <label className="fila" style={{ gap: 8, fontSize: 13 }}>
                  <Interruptor name={`ver:${o.metodo}`} etiqueta={`${o.metodo} coincide`} checked={!!revisado[o.metodo]} onChange={(v) => setRevisado((x) => ({ ...x, [o.metodo]: v }))} />Coincide
                </label>
              </div>
            ))}
          </div>
        </div>
        <label className="campo">
          <span>Notas</span>
          <textarea className="input" name="notas" placeholder={dif !== null && Math.abs(dif) > limiteDiferencia ? "La diferencia es grande. Escribe qué pasó." : "Si algo no coincide, escribe qué pasó."} />
        </label>
        <Estado e={eCerrar} />
        <div className="acciones"><button type="button" className="bt sec solo" onClick={() => setVista("detalle")}>Regresar</button><button className="bt" disabled={cerrando}><Icono n="candado" />{cerrando ? "Cerrando…" : "Cerrar caja"}<Fl /></button></div>
      </form>
    </Modal>
  );
}
