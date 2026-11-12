"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { EvidenciasCorte } from "./EvidenciasCorte";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import type { MovimientosTurno } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimiento, type EstadoCaja, type ResumenCorte } from "../caja/actions";

export type Turno = {
  desde: string; abrio: string; abrioAvatar: string; abiertoEn: string; dia: string; deOtroDia: boolean; folioCorte: string; m: MovimientosTurno; esperado: number; ventas: number; ventasEfectivo?: number;
  propinas: number; otros: { metodo: string; total: number; ventas: number }[];
};
type Vista = "retiro" | "gasto" | "corte";

/** "2 h 15 min abierta" */
const duracion = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} min abierta` : `${Math.floor(min / 60)} h ${min % 60} min abierta`;
};

const abrir = (v: Vista) => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: v }));

/** Línea discreta arriba de Cobro mientras la caja está abierta. */
export function BarraCaja({ turno, folioVenta }: { turno: Turno; folioVenta: string }) {
  return (
    <>
    <CajaMovil turno={turno} />
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
    </>
  );
}

/** Teléfono: la caja en una sola línea; Retiro, Gasto y Corte de caja viven en el botón de tres puntos. */
function CajaMovil({ turno }: { turno: Turno }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".estado-m")) setMenu(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menu]);
  const ir = (v: Vista) => { setMenu(false); abrir(v); };
  return (
    <div className="estado-m subir">
      <span className="vivo"><b>Caja abierta</b></span>
      <span className="muted">{formatoDinero(turno.esperado)} en caja</span>
      <button type="button" className="em-pts" aria-label="Retiro, gasto o corte de caja" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((x) => !x)}><Icono n="puntos" /></button>
      {menu && (
        <div className="menu em-menu" role="menu">
          <button type="button" role="menuitem" className="it" onClick={() => ir("retiro")}><Icono n="salida" />Retiro</button>
          <button type="button" role="menuitem" className="it" onClick={() => ir("gasto")}><Icono n="etiqueta" />Gasto</button>
          <button type="button" role="menuitem" className="it" onClick={() => ir("corte")}><Icono n="candado" />Corte de caja</button>
        </div>
      )}
    </div>
  );
}

/** Con la caja cerrada no se muestra nada de Cobro: solo abrirla. */
export function CajaCerrada({ opera, sugerido }: { opera: boolean; sugerido: number }) {
  const [e, accion, abriendo] = useActionState<EstadoCaja, FormData>(abrirCaja, {});
  const [fondo, setFondo] = useState(sugerido ? String(sugerido / 100) : "");
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
      <span className="lab">Cierre de caja</span>
      <h1 className="titulo">Tienes un corte de caja pendiente</h1>
      <p className="muted">La caja del {dia} aún no se ha cerrado.<br />Realiza el corte para registrar el efectivo y finalizar la jornada.</p>
      {opera ? <button type="button" className="bt grande" style={{ width: "min(360px, 100%)" }} onClick={() => abrir("corte")}>Realizar corte de caja<Fl /></button>
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
      <div className={`resultado-c ${r.diferencia === 0 ? "ok" : "dif"}`}>
        <span className="sello" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle className="aro" cx="26" cy="26" r="23" pathLength={1} />
            {r.diferencia === 0 ? <path className="trazo" d="M15 27l7 7 15-16" pathLength={1} /> : <path className="trazo" d="M26 14v15M26 37v1" pathLength={1} />}
          </svg>
          {r.diferencia === 0 && [0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ rotate: `${i * 60}deg` }} />)}
        </span>
        <span>
          <b>{r.diferencia === 0 ? "El efectivo coincide con el sistema" : r.diferencia > 0 ? `Sobraron ${formatoDinero(r.diferencia)}` : `Faltaron ${formatoDinero(-r.diferencia)}`}</b>
          <span className="cifras-r"><span><small>Contado</small>{formatoDinero(r.contado)}</span><span><small>Esperado</small>{formatoDinero(r.esperado)}</span></span>
        </span>
      </div>
      <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
    </Modal>
  );
}

export function CajaModal({ inicial, turno, limiteDiferencia, categorias, evidencias = false }: { inicial: Vista | null; turno: Turno | null; limiteDiferencia: number; categorias: string[]; evidencias?: boolean }) {
  const [vista, setVista] = useState<Vista | null>(inicial);
  const [eMov, accMov, guardandoMov] = useActionState<EstadoCaja, FormData>(registrarMovimiento, {});
  const [eGasto, accGasto, guardandoGasto] = useActionState<EstadoCaja, FormData>(registrarGasto, {});
  const [eCerrar, accCerrar, cerrando] = useActionState<EstadoCaja, FormData>(cerrarCaja, {});
  const [tipoMov, setTipoMov] = useState<"retiro" | "entrada">("retiro");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState(categorias[0] ?? "Otros");
  const [gasto, setGasto] = useState("");
  // Al elegir una categoría se llena "En qué se gastó" con su nombre, salvo que la persona ya haya escrito algo propio.
  const elegirCategoria = (c: string) => { setCategoria(c); setGasto((g) => (g === "" || categorias.includes(g) ? c : g)); };
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

  const cerrar = () => { setVista(null); setGasto(""); };
  if (resumen) return <Resumen r={resumen} cerrar={() => setResumen(null)} />;
  if (!vista || !turno) return null;

  if (vista === "retiro") {
    const sugeridos = tipoMov === "retiro" ? ["Depósito al banco", "Pago de comisiones", "Pago de servicios"] : ["Más cambio", "Reposición del fondo"];
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
          <div className="acciones"><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
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
          <input className="input" name="concepto" value={gasto} onChange={(e) => setGasto(e.target.value)} placeholder="En qué se gastó" required aria-label="En qué se gastó" />
          <div className="billetes">{categorias.map((c) => <button type="button" key={c} className={categoria === c ? "on" : ""} onClick={() => elegirCategoria(c)}>{c}</button>)}</div>
          {eGasto.error && <p className="aviso error">{eGasto.error}</p>}
          <div className="acciones"><button className="bt" disabled={guardandoGasto}>{guardandoGasto ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  return <CortePasos turno={turno} accion={accCerrar} cerrando={cerrando} error={eCerrar.error} contado={contado} setContado={setContado} limiteDiferencia={limiteDiferencia} evidencias={evidencias} cerrar={cerrar} />;
}

const EN_LINEA = ["Pago con QR", "Anticipo en línea", "Pago en línea"];
const COLORES = ["#3c5163", "#6f8597", "#9fb3c4", "#13171c", "#b9c6d1", "#56646f"];
const iconoDe = (m: string) => (m === "Efectivo" ? "efectivo" : EN_LINEA.includes(m) ? "cuadros" : /transfer/i.test(m) ? "enviar" : "tarjeta");

/** Anillo con lo vendido por forma de pago y el total al centro. */
function Anillo({ partes, total }: { partes: { metodo: string; total: number; color: string }[]; total: number }) {
  const R = 60, C = 2 * Math.PI * R;
  let acum = 0;
  return (
    <span className="ck-anillo">
      <svg viewBox="0 0 150 150" aria-hidden="true">
        <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(30,45,60,.08)" strokeWidth="18" />
        {total > 0 && partes.filter((x) => x.total > 0).map((x) => {
          const largo = (x.total / total) * C;
          const el = <circle key={x.metodo} cx="75" cy="75" r={R} fill="none" stroke={x.color} strokeWidth="18" strokeDasharray={`${Math.max(largo - 2, 0.5)} ${C}`} strokeDashoffset={-acum} transform="rotate(-90 75 75)" />;
          acum += largo;
          return el;
        })}
      </svg>
      <span><small>Total<br />vendido</small><b>{formatoDinero(total)}</b></span>
    </span>
  );
}

/**
 * Corte de caja en cuatro pasos: resumen del turno, conteo del efectivo, comprobantes y cierre.
 * Todo vive en un solo formulario; los pasos solo muestran u ocultan su parte.
 */
function CortePasos({ turno, accion, cerrando, error, contado, setContado, limiteDiferencia, evidencias, cerrar }: {
  turno: Turno; accion: (d: FormData) => void; cerrando: boolean; error?: string; contado: string; setContado: (v: string) => void;
  limiteDiferencia: number; evidencias: boolean; cerrar: () => void;
}) {
  const m = turno.m;
  const metodos = [{ metodo: "Efectivo", total: m.cobrosEfectivo, ventas: turno.ventasEfectivo ?? 0 }, ...turno.otros.map((o) => ({ metodo: o.metodo, total: o.total, ventas: o.ventas }))]
    .filter((x) => x.metodo === "Efectivo" || x.total > 0)
    .map((x, i) => ({ ...x, color: COLORES[i % COLORES.length] }));
  const total = metodos.reduce((a, x) => a + x.total, 0);
  const grupos = turno.otros.filter((o) => o.total > 0).map((o) => ({ metodo: o.metodo, total: o.total, ventas: o.ventas, icono: iconoDe(o.metodo), enLinea: EN_LINEA.includes(o.metodo) }));
  const conComprobantes = evidencias && grupos.length > 0;
  const pasos = conComprobantes ? 4 : 3;
  const [paso, setPaso] = useState(1);
  const [faltan, setFaltan] = useState(() => grupos.filter((g) => !g.enLinea).length);
  const c = leerPesos(contado);
  const dif = c === null ? null : c - turno.esperado;
  const nombre = ["Resumen del turno", "Efectivo", ...(conComprobantes ? ["Comprobantes"] : []), "Cierre"][paso - 1];
  const esCierre = paso === pasos;
  const puedeSeguir = paso !== 2 || c !== null;
  const qr = grupos.filter((g) => g.enLinea).reduce((a, g) => a + g.ventas, 0);
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Folio ${turno.folioCorte}`} titulo="Corte de caja">
      {/* Enter en un paso intermedio avanza al siguiente en lugar de cerrar la caja. */}
      <form className="pila ck" onSubmit={(e) => {
        e.preventDefault();
        if (!esCierre) { if (puedeSeguir) setPaso(paso + 1); return; }
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}>
        <div className="ck-pasos" aria-hidden="true">{Array.from({ length: pasos }, (_, i) => <i key={i} className={i < paso ? "on" : ""} />)}</div>
        <span className="ck-lab">Paso {paso} de {pasos}, {nombre}</span>

        <div className="pila" hidden={paso !== 1}>
          <div className="ck-chips"><span>{turno.desde} a ahora</span><span>{duracion(turno.abiertoEn).replace(" abierta", "")}</span><span>Abrió {turno.abrio.split(" ")[0]}</span><span>{turno.ventas} {turno.ventas === 1 ? "venta" : "ventas"}</span></div>
          <div className="ck-res">
            <Anillo partes={metodos} total={total} />
            <div className="ck-ley">
              {metodos.map((x) => (
                <div key={x.metodo}><i style={{ background: x.color }} /><span>{x.metodo}<small>{EN_LINEA.includes(x.metodo) ? "Verificado por Stripe" : `${x.ventas} ${x.ventas === 1 ? "venta" : "ventas"}`}</small></span><b>{formatoDinero(x.total)}</b></div>
              ))}
            </div>
          </div>
          {turno.propinas > 0 && <small className="muted">Propinas aparte {formatoDinero(turno.propinas)}</small>}
        </div>

        <div className="pila" hidden={paso !== 2}>
          <label className="campo">
            <span>¿Cuánto efectivo contaste?</span>
            <input className="input grande" name="contado" inputMode="decimal" placeholder={formatoDinero(turno.esperado)} value={contado} onChange={(e) => setContado(e.target.value)} required />
          </label>
          {dif !== null && <span className={`conteo-l ${dif === 0 ? "ok" : "dif"}`}><Icono n={dif === 0 ? "palomita" : "reloj"} />{dif === 0 ? "Coincide con el sistema" : dif > 0 ? `Sobran ${formatoDinero(dif)}` : `Faltan ${formatoDinero(-dif)}`}</span>}
          <div className="ck-con">
            <span className="ck-lab">Conciliación de efectivo</span>
            <div><span>Fondo inicial</span><span className="num">{formatoDinero(m.fondoInicial)}</span></div>
            <div><span>Ventas en efectivo</span><span className="num">+{formatoDinero(m.cobrosEfectivo)}</span></div>
            {m.propinasEfectivo > 0 && <div><span>Propinas en efectivo</span><span className="num">+{formatoDinero(m.propinasEfectivo)}</span></div>}
            {m.entradas > 0 && <div><span>Entradas</span><span className="num">+{formatoDinero(m.entradas)}</span></div>}
            <div><span>Retiros y gastos</span><span className="num">−{formatoDinero(m.retiros + m.gastosDeCaja + m.devolucionesEfectivo)}</span></div>
            <div className="t"><span>Efectivo esperado</span><b className="num">{formatoDinero(turno.esperado)}</b></div>
          </div>
        </div>

        {conComprobantes && (
          <div className="pila" hidden={paso !== 3}>
            <small className="muted">Sube las fotos o archivos de cada forma de pago, en el orden que quieras.</small>
            <EvidenciasCorte grupos={grupos} obligatorio cambio={setFaltan} dinero={formatoDinero} />
          </div>
        )}

        <div className="pila" hidden={!esCierre}>
          <div className="ck-con">
            <div><span>Total vendido</span><b className="num">{formatoDinero(total)}</b></div>
            <div><span>Efectivo contado</span><span>{c === null ? "Sin contar" : `${formatoDinero(c)}, ${dif === 0 ? "coincide" : dif! > 0 ? `sobran ${formatoDinero(dif!)}` : `faltan ${formatoDinero(-dif!)}`}`}</span></div>
            {conComprobantes && <div><span>Comprobantes</span><span>{faltan ? `Faltan ${faltan}` : "Completos"}</span></div>}
            {qr > 0 && <div><span>Pago con QR</span><span>{qr} {qr === 1 ? "verificado" : "verificados"} por Stripe</span></div>}
          </div>
          <label className="campo">
            <span>Observaciones</span>
            <textarea className="input" name="notas" placeholder={dif !== null && Math.abs(dif) > limiteDiferencia ? "Hay diferencia. Escribe qué pasó." : "Opcional"} />
          </label>
          {dif !== null && dif < 0 && <p className="ayuda-txt" style={{ margin: 0 }}>Si falta dinero, se decide en Cortes de caja quién lo cubre.</p>}
          {conComprobantes && faltan > 0 && <p className="aviso error" style={{ margin: 0 }}>Falta el comprobante de {faltan === 1 ? "una forma de pago" : `${faltan} formas de pago`}. Regresa al paso de comprobantes.</p>}
        </div>

        {error && <p className="aviso error">{error}</p>}
        <div className="ck-acc">
          {paso > 1 ? <button type="button" className="ck-atras" aria-label="Anterior" onClick={() => setPaso(paso - 1)}><Icono n="izquierda" /></button> : <span />}
          {esCierre
            ? <button key="cerrar" type="submit" className="bt" disabled={cerrando || c === null || (conComprobantes && faltan > 0)}>{cerrando ? "Cerrando…" : "Cerrar caja"}<Fl /></button>
            : <button key="seguir" type="button" className="bt" disabled={!puedeSeguir} onClick={() => setPaso(paso + 1)}>{paso === 1 ? "Contar efectivo" : paso === 2 && conComprobantes ? "Comprobantes" : "Continuar"}<Fl /></button>}
        </div>
      </form>
    </Modal>
  );
}
