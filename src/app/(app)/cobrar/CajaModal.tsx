"use client";

import { useActionState, useEffect, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import type { MovimientosTurno } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimiento, type EstadoCaja, type ResumenCorte } from "../caja/actions";

export type Turno = {
  desde: string; abrio: string; dia: string; deOtroDia: boolean; folioCorte: string; m: MovimientosTurno; esperado: number; ventas: number;
  propinas: number; otros: { metodo: string; total: number; ventas: number }[];
};
type Vista = "retiro" | "gasto" | "corte";

const CATEGORIAS = ["Insumos", "Limpieza", "Servicios del local", "Mantenimiento", "Otros"];
const abrir = (v: Vista) => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: v }));

/** Línea discreta arriba de Cobro mientras la caja está abierta. */
export function BarraCaja({ turno, folioVenta }: { turno: Turno; folioVenta: string }) {
  return (
    <div className="estado-c subir">
      <span className="vivo"><b>Caja abierta</b></span>
      <span className="meta-c">{turno.desde} - Abrió {turno.abrio} - Folio {folioVenta}</span>
      <span className="efectivo-c">Efectivo en caja <b>{formatoDinero(turno.esperado)}</b></span>
      <span className="acc-c">
        <button type="button" className="fantasma" onClick={() => abrir("retiro")}><Icono n="salida" />Retiro</button>
        <button type="button" className="fantasma" onClick={() => abrir("gasto")}><Icono n="etiqueta" />Gasto</button>
        <button type="button" className="bt chico solo" onClick={() => abrir("corte")}><Icono n="candado" />Corte de caja</button>
      </span>
    </div>
  );
}

/** Con la caja cerrada no se muestra nada de Cobro: solo abrirla. */
export function CajaCerrada({ opera }: { opera: boolean }) {
  const [e, accion, abriendo] = useActionState<EstadoCaja, FormData>(abrirCaja, {});
  const [fondo, setFondo] = useState("");
  return (
    <section className="caja-puerta subir">
      <span className="icono-caja"><Icono n="caja" /></span>
      <h1 className="titulo">La caja está cerrada</h1>
      {opera ? (
        <form action={accion} className="pila" style={{ width: "min(360px, 100%)" }}>
          <p className="muted">Escribe el efectivo con que se abre para dar cambio.</p>
          <input className="input grande" name="fondo" inputMode="decimal" placeholder="$0" value={fondo} onChange={(x) => setFondo(x.target.value)} required autoFocus aria-label="Fondo de apertura" style={{ textAlign: "center" }} />
          <div className="billetes" style={{ justifyContent: "center" }}>{[0, 50, 100, 200, 500].map((v) => <button type="button" key={v} onClick={() => setFondo(String(v))}>{formatoDinero(v * 100)}</button>)}</div>
          {e.error && <p className="aviso error">{e.error}</p>}
          <button className="bt grande" disabled={abriendo}>{abriendo ? "Abriendo…" : "Abrir caja"}<Fl /></button>
        </form>
      ) : <p className="muted">Pide que la abran para poder cobrar.</p>}
    </section>
  );
}

/** Pasaron las 12 de la noche y la caja sigue abierta: hay que hacer el corte antes de seguir. */
export function CajaPendiente({ dia, opera }: { dia: string; opera: boolean }) {
  return (
    <section className="caja-puerta alerta subir">
      <span className="icono-caja"><Icono n="reloj" /></span>
      <h1 className="titulo">La caja del {dia} no se cerró</h1>
      <p className="muted">Ya pasaron las 12 de la noche.<br />Haz el corte de caja para seguir cobrando.</p>
      {opera ? <button type="button" className="bt grande" style={{ width: "min(360px, 100%)" }} onClick={() => abrir("corte")}>Hacer corte de caja<Fl /></button>
        : <p className="muted">Pide que hagan el corte.</p>}
    </section>
  );
}

function Resumen({ r, cerrar }: { r: ResumenCorte; cerrar: () => void }) {
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Folio ${r.folio}`} titulo="Corte guardado">
      <p className="muted" style={{ fontSize: 13 }}>{r.desde} a {r.hasta} - {r.ventas} {r.ventas === 1 ? "venta" : "ventas"}</p>
      <div className="resumen-c">
        {r.metodos.map((m) => <div key={m.metodo}><span>{m.metodo}</span><span className="num">{formatoDinero(m.total)}</span></div>)}
        <div className="total-c"><span>Total vendido</span><b>{formatoDinero(r.total)}</b></div>
      </div>
      <div className={`conteo ${r.diferencia === 0 ? "ok" : "dif"}`}>
        <Icono n={r.diferencia === 0 ? "palomita" : "reloj"} />
        <span>{r.diferencia === 0 ? "El efectivo coincide con el sistema" : r.diferencia > 0 ? `Sobraron ${formatoDinero(r.diferencia)} de efectivo` : `Faltaron ${formatoDinero(-r.diferencia)} de efectivo`}<small>Contado {formatoDinero(r.contado)}, esperado {formatoDinero(r.esperado)}</small></span>
      </div>
      <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
    </Modal>
  );
}

export function CajaModal({ inicial, turno, limiteDiferencia }: { inicial: Vista | null; turno: Turno | null; limiteDiferencia: number }) {
  const [vista, setVista] = useState<Vista | null>(inicial);
  const [eMov, accMov, guardandoMov] = useActionState<EstadoCaja, FormData>(registrarMovimiento, {});
  const [eGasto, accGasto, guardandoGasto] = useActionState<EstadoCaja, FormData>(registrarGasto, {});
  const [eCerrar, accCerrar, cerrando] = useActionState<EstadoCaja, FormData>(cerrarCaja, {});
  const [tipoMov, setTipoMov] = useState<"retiro" | "entrada">("retiro");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [contado, setContado] = useState("");
  const [resumen, setResumen] = useState<ResumenCorte | null>(null);

  useEffect(() => {
    const f = (e: Event) => setVista((e as CustomEvent).detail as Vista);
    window.addEventListener("crabs:caja", f);
    return () => window.removeEventListener("crabs:caja", f);
  }, []);
  useEffect(() => { if (eMov.ok) { setVista(null); setConcepto(""); } }, [eMov.n, eMov.ok]);
  useEffect(() => { if (eGasto.ok) setVista(null); }, [eGasto.n, eGasto.ok]);
  useEffect(() => { if (eCerrar.ok && eCerrar.resumen) { setResumen(eCerrar.resumen); setVista(null); setContado(""); } }, [eCerrar.n, eCerrar.ok, eCerrar.resumen]);

  const cerrar = () => setVista(null);
  if (resumen) return <Resumen r={resumen} cerrar={() => setResumen(null)} />;
  if (!vista || !turno) return null;

  if (vista === "retiro") {
    const sugeridos = tipoMov === "retiro" ? ["Depósito al banco", "Propinas entregadas", "Lo llevó el propietario"] : ["Más cambio", "Reposición del fondo"];
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo={tipoMov === "retiro" ? "Sacar efectivo" : "Meter efectivo"}>
        <form action={accMov} className="pila">
          <input type="hidden" name="tipo" value={tipoMov} />
          <div className="seg" role="radiogroup" aria-label="Tipo">
            <button type="button" className={tipoMov === "retiro" ? "on" : ""} onClick={() => setTipoMov("retiro")}><Icono n="salida" />Retiro</button>
            <button type="button" className={tipoMov === "entrada" ? "on" : ""} onClick={() => setTipoMov("entrada")}><Icono n="entrada" />Entrada</button>
          </div>
          <input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus aria-label="Monto" />
          <div className="pila-chica">
            <div className="billetes">{sugeridos.map((x) => <button type="button" key={x} className={concepto === x ? "on" : ""} onClick={() => setConcepto(x)}>{x}</button>)}</div>
            <input className="input" name="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Motivo" required aria-label="Motivo" />
          </div>
          {eMov.error && <p className="aviso error">{eMov.error}</p>}
          <div className="acciones"><button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  if (vista === "gasto") {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Gasto pagado con la caja">
        <form action={accGasto} className="pila">
          <input type="hidden" name="categoria" value={categoria} />
          <input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus aria-label="Monto" />
          <input className="input" name="concepto" placeholder="En qué se gastó" required aria-label="En qué se gastó" />
          <div className="billetes">{CATEGORIAS.map((c) => <button type="button" key={c} className={categoria === c ? "on" : ""} onClick={() => setCategoria(c)}>{c}</button>)}</div>
          {eGasto.error && <p className="aviso error">{eGasto.error}</p>}
          <div className="acciones"><button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button><button className="bt" disabled={guardandoGasto}>{guardandoGasto ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  const m = turno.m;
  const metodos = [{ metodo: "Efectivo", total: m.cobrosEfectivo }, ...turno.otros.map((o) => ({ metodo: o.metodo, total: o.total }))];
  const total = metodos.reduce((a, x) => a + x.total, 0);
  const c = leerPesos(contado);
  const dif = c === null ? null : c - turno.esperado;
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Folio ${turno.folioCorte}`} titulo="Corte de caja">
      <form action={accCerrar} className="pila">
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{turno.desde} a ahora - Abrió {turno.abrio} - {turno.ventas} {turno.ventas === 1 ? "venta" : "ventas"}</p>
        <div className="resumen-c">
          <span className="lab">Resumen de cobros</span>
          {metodos.map((x) => <div key={x.metodo}><span>{x.metodo}</span><span className="num">{formatoDinero(x.total)}</span></div>)}
          <div className="total-c"><span>Total vendido</span><b>{formatoDinero(total)}</b></div>
          {turno.propinas > 0 && <small className="muted">Propinas aparte: {formatoDinero(turno.propinas)}</small>}
        </div>
        <label className="campo">
          <span>¿Cuánto efectivo contaste?</span>
          <input className="input grande" name="contado" inputMode="decimal" placeholder={formatoDinero(turno.esperado)} value={contado} onChange={(e) => setContado(e.target.value)} required autoFocus />
          {dif !== null && (
            <span className={`conteo-l ${dif === 0 ? "ok" : "dif"}`}><Icono n={dif === 0 ? "palomita" : "reloj"} />{dif === 0 ? "Coincide con el sistema" : dif > 0 ? `Sobran ${formatoDinero(dif)}` : `Faltan ${formatoDinero(-dif)}`}</span>
          )}
        </label>
        <details className="desglose">
          <summary>Conciliación de efectivo<span className="num">{formatoDinero(turno.esperado)}</span></summary>
          <div className="resumen-c chico">
            <div><span>Fondo inicial</span><span className="num">{formatoDinero(m.fondoInicial)}</span></div>
            <div><span>Ventas en efectivo</span><span className="num">+{formatoDinero(m.cobrosEfectivo)}</span></div>
            {m.propinasEfectivo > 0 && <div><span>Propinas en efectivo</span><span className="num">+{formatoDinero(m.propinasEfectivo)}</span></div>}
            {m.entradas > 0 && <div><span>Entradas</span><span className="num">+{formatoDinero(m.entradas)}</span></div>}
            <div><span>Retiros y gastos</span><span className="num">−{formatoDinero(m.retiros + m.gastosDeCaja + m.devolucionesEfectivo)}</span></div>
            <div className="total-c"><span>Debe haber en caja</span><b>{formatoDinero(turno.esperado)}</b></div>
          </div>
          <small className="muted">Tarjeta y transferencia cuentan en las ventas, pero no están en la caja física.</small>
        </details>
        <label className="campo">
          <span>Observaciones</span>
          <textarea className="input" name="notas" placeholder={dif !== null && Math.abs(dif) > limiteDiferencia ? "Hay diferencia. Escribe qué pasó." : "Opcional"} />
        </label>
        {eCerrar.error && <p className="aviso error">{eCerrar.error}</p>}
        <div className="acciones"><button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button><button className="bt" disabled={cerrando}>{cerrando ? "Cerrando…" : "Cerrar caja"}<Fl /></button></div>
      </form>
    </Modal>
  );
}
