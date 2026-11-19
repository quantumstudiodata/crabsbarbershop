"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { EvidenciasCorte, type GrupoEvidencia } from "./EvidenciasCorte";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import type { MovimientosTurno } from "@/lib/caja";
import { formatoDinero, leerPesos } from "@/lib/money";
import { esLlevoDuena } from "@/lib/caja";
import { abrirCaja, cerrarCaja, registrarDeposito, registrarGasto, registrarMovimiento, type EstadoCaja, type ResumenCorte } from "../caja/actions";
import { prepararArchivo } from "@/lib/archivo";

export type Turno = {
  desde: string; abrio: string; abrioAvatar: string; abiertoEn: string; dia: string; deOtroDia: boolean; folioCorte: string; m: MovimientosTurno; esperado: number; ventas: number; ventasEfectivo?: number;
  propinas: number; otros: { metodo: string; total: number; ventas: number }[];
  /** Comisión de cada persona por las ventas de este turno (quien no ve al equipo, solo la suya). */
  comisiones?: { id: string; nombre: string; avatar: string; servicios: number; monto: number }[];
  /** Comisiones por entregar en efectivo: se deciden en el corte. */
  entregas?: { id: string; nombre: string; avatar: string; monto: number; detalle: string }[];
  verTodo?: boolean;
  /** Propinas del turno por persona, para entregarlas en el corte. */
  propinasEquipo?: { id: string; nombre: string; avatar: string; efectivo: number; otro: number }[];
  /** De los retiros del turno, lo que fueron pagos al equipo. */
  pagosEquipo?: number;
  /** Pagos al equipo anulados con la caja abierta: el dinero regresó. */
  pagosAnulados?: number;
  /** Gastos de hoy pagados con transferencia o tarjeta: no tocan el efectivo, solo se informan. */
  otrosEgresos?: { concepto: string; metodo: string; monto: number }[];
  /** Cada gasto pagado con la caja y cada vez que se sacó o se puso dinero, para verlos en las cuentas. */
  detalle?: { gastos: { concepto: string; monto: number }[]; sacado: { concepto: string; monto: number }[]; puesto: { concepto: string; monto: number }[] };
  /** Lo que le toca al negocio de este turno: se acumula para la dueña al cerrar. */
  leToca?: number;
  /** Lo que ya se le debe a la dueña de cortes anteriores, con el corte de donde viene cada parte. */
  duena?: { saldo: number; desde: string; partes: { texto: string; monto: number }[] };
  /** Titular: es la única que puede sacar efectivo sin gastarlo ("Me llevo efectivo"). */
  esTitular?: boolean;
  /** Citas atendidas que siguen sin cobrar. */
  sinCobrar?: number;
};
type Vista = "movimiento" | "retiro" | "entrada" | "gasto" | "deposito" | "corte";

const abrir = (v: Vista) => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: v }));
/** Abre "¿Qué pasó con el dinero?" desde otra pantalla (Movimientos, para quien no usa Cobro). */
export const abrirMovimientoCaja = () => abrir("movimiento");

/** Línea discreta arriba de Cobro mientras la caja está abierta. */
export function BarraCaja({ turno, folioVenta }: { turno: Turno; folioVenta: string }) {
  return (
    <>
    <CajaMovil turno={turno} />
    <div className="estado-c subir">
      <span className="vivo"><b>Caja abierta</b></span>
      <span className="meta-c">{turno.desde} - Abrió {turno.abrio} - Folio {folioVenta}</span>
      <span className="acc-c">
        <button type="button" className="fantasma" onClick={() => abrir("movimiento")}><Icono n="salida" />Movimiento de caja</button>
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
      <span className="muted">desde las {turno.desde}</span>
      <button type="button" className="em-pts" aria-label="Movimiento o corte de caja" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((x) => !x)}><Icono n="puntos" /></button>
      {menu && (
        <div className="menu em-menu" role="menu">
          <button type="button" role="menuitem" className="it" onClick={() => ir("movimiento")}><Icono n="salida" />Movimiento de caja</button>
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
      <span className="lab">Corte de caja</span>
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

export function CajaModal({ inicial, turno, limiteDiferencia, categorias, evidencias = false, egresos = false, configurar = false, abierta = false, titular = false }: { /** Titular: puede sacar efectivo sin gastarlo ("Me llevo efectivo"). */ titular?: boolean; inicial: Vista | null; turno: Turno | null; limiteDiferencia: number; categorias: string[]; evidencias?: boolean; /** Puede registrar egresos en Movimientos. */ egresos?: boolean; /** Puede editar las categorías de gasto. */ configurar?: boolean; /** Fuera de Cobro: hay caja abierta aunque no se tengan sus datos (solo para movimientos, no para el corte). */ abierta?: boolean }) {
  const [vista, setVista] = useState<Vista | null>(inicial);
  const [eMov, accMov, guardandoMov] = useActionState<EstadoCaja, FormData>(registrarMovimiento, {});
  const [eGasto, accGasto, guardandoGasto] = useActionState<EstadoCaja, FormData>(registrarGasto, {});
  const [eDep, accDep, guardandoDep] = useActionState<EstadoCaja, FormData>(registrarDeposito, {});
  const [eCerrar, accCerrar, cerrando] = useActionState<EstadoCaja, FormData>(cerrarCaja, {});
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
    // Un enlace a "Movimiento de caja" hacia esta misma página no recarga nada: se abre la ventana aquí.
    const clic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href*='caja=movimiento'], a[href*='caja=retiro']") as HTMLAnchorElement | null;
      if (!a || new URL(a.href, location.href).pathname !== location.pathname) return;
      e.preventDefault();
      setVista("movimiento");
    };
    document.addEventListener("click", clic);
    return () => { window.removeEventListener("crabs:caja", f); document.removeEventListener("click", clic); };
  }, []);
  useEffect(() => { if (eMov.ok) { setVista(null); setConcepto(""); } }, [eMov.n, eMov.ok]);
  useEffect(() => { if (eGasto.ok) setVista(null); }, [eGasto.n, eGasto.ok]);
  useEffect(() => { if (eDep.ok) setVista(null); }, [eDep.n, eDep.ok]);
  useEffect(() => { if (eCerrar.ok && eCerrar.resumen) { setResumen(eCerrar.resumen); setVista(null); setContado(""); } }, [eCerrar.n, eCerrar.ok, eCerrar.resumen]);

  const cerrar = () => { setVista(null); setGasto(""); };
  if (resumen) return <Resumen r={resumen} cerrar={() => setResumen(null)} />;
  if (!vista) return null;
  // Con la caja cerrada no hay dónde registrar el movimiento: se dice en lugar de no hacer nada.
  if (!turno && !abierta && vista !== "corte") return (
    <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="La caja está cerrada">
      <div className="pila">
        <p className="muted" style={{ margin: 0 }}>Para sacar o poner dinero, o pagar algo con la caja, primero hay que abrirla en Cobro. Lo que se paga por transferencia o tarjeta se registra como egreso.</p>
        <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Entendido</button></div>
      </div>
    </Modal>
  );
  if (!turno && !(abierta && vista !== "corte")) return null;

  // Sacar efectivo sin gastarlo solo lo hace Titular; a los demás un enlace viejo de "retiro" les abre las opciones.
  const vistaReal: Vista = vista === "retiro" && !titular ? "movimiento" : vista;
  // Una sola puerta: la persona dice qué pasó y la app sabe cómo guardarlo.
  const atras = <button type="button" className="mov-atras" onClick={() => setVista("movimiento")}><Icono n="izquierda" />Elegir otra cosa</button>;
  if (vistaReal === "movimiento") {
    // Lo demás que sale de la caja (lo del equipo y lo de la dueña) se saca en el corte.
    const ops: [Vista, string, string, string][] = [
      ["gasto", "etiqueta", "Pagué algo con dinero de la caja", "Agua, limpieza, productos. Cuenta como gasto."],
      ["entrada", "entrada", "Puse dinero en la caja", "Para tener cambio. No cuenta como venta."],
      ...((turno?.duena?.saldo ?? 0) > 0 ? [["deposito", "enviar", "Deposité a la dueña", `Se le deben ${formatoDinero(turno!.duena!.saldo)}, ${turno!.duena!.desde}. Con comprobante.`] as [Vista, string, string, string]] : []),
      ...(titular ? [["retiro", "salida", "Me llevo efectivo de la caja", "Lo tomo yo o alguien de mi parte. Se descuenta de lo del negocio."] as [Vista, string, string, string]] : []),
    ];
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="¿Qué pasó con el dinero?">
        <div className="mov-ops">
          {ops.map(([v, ic, t, d]) => (
            <button type="button" key={v} className="mov-op" onClick={() => { if (v !== "gasto") setConcepto(""); setVista(v); }}>
              <span className="mov-ic"><Icono n={ic} /></span><span><b>{t}</b><small>{d}</small></span><Icono n="derecha" />
            </button>
          ))}
        </div>
        {egresos && <p className="ayuda-txt" style={{ margin: "12px 0 0" }}>¿Pagaste un gasto con transferencia o tarjeta? Ese dinero no salió de la caja. <a className="enlace" href="/analitica/finanzas?egreso=1">Regístralo aquí</a>.</p>}
      </Modal>
    );
  }

  if (vistaReal === "retiro") {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Movimiento de caja" titulo="Me llevo efectivo de la caja">
        <form action={accMov} className="pila">
          <input type="hidden" name="tipo" value="retiro" />
          {atras}
          <label className="campo"><span>¿Cuánto?</span><input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus aria-label="Monto" /></label>
          <label className="campo"><span>¿Quién lo recoge?</span><input className="input" name="quien" maxLength={80} placeholder="Si lo recoges tú, déjalo en blanco" aria-label="Quién lo recoge" /></label>
          <p className="ayuda-txt" style={{ margin: 0 }}>Se descuenta de lo del negocio de hoy. Si es más, se toma del fondo y el corte lo dice.</p>
          {eMov.error && <p className="aviso error">{eMov.error}</p>}
          <div className="acciones"><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  if (vistaReal === "deposito" && turno?.duena) {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Movimiento de caja" titulo="Deposité a la dueña">
        <Deposito duena={turno.duena} accion={accDep} guardando={guardandoDep} error={eDep.error} atras={atras} />
      </Modal>
    );
  }

  if (vistaReal === "entrada") {
    const sugeridos = ["Más cambio", "Reposición del fondo"];
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Puse dinero en la caja">
        <form action={accMov} className="pila">
          <input type="hidden" name="tipo" value="entrada" />
          {atras}
          <p className="ayuda-txt" style={{ margin: 0 }}>No es una venta. La caja tendrá más dinero y el corte lo toma en cuenta.</p>
          <input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus aria-label="Monto" />
          <div className="pila-chica">
            <div className="billetes">{sugeridos.map((x) => <button type="button" key={x} className={concepto === x ? "on" : ""} onClick={() => setConcepto(x)}>{x}</button>)}</div>
            <input className="input" name="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="¿Para qué?" required aria-label="Motivo" />
          </div>
          {eMov.error && <p className="aviso error">{eMov.error}</p>}
          <div className="acciones"><button className="bt" disabled={guardandoMov}>{guardandoMov ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  if (vistaReal === "gasto") {
    return (
      <Modal abierto cerrar={cerrar} etiqueta="Caja" titulo="Pagué algo con dinero de la caja">
        <form action={accGasto} className="pila">
          {atras}
          <input type="hidden" name="categoria" value={categoria} />
          <input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required autoFocus aria-label="Monto" />
          <input className="input" name="concepto" value={gasto} onChange={(e) => setGasto(e.target.value)} placeholder="¿Qué se pagó? Ejemplo: garrafón de agua" required aria-label="Qué se pagó" />
          <div className="billetes">{categorias.map((c) => <button type="button" key={c} className={categoria === c ? "on" : ""} onClick={() => elegirCategoria(c)}>{c}</button>)}
</div>
          {configurar && <a className="cat-conf" href="/ajustes/cobro"><Icono n="ajustes" />Editar categorías</a>}
          <p className="ayuda-txt" style={{ margin: 0 }}>Es un gasto del negocio. La caja tendrá menos dinero y el corte lo toma en cuenta.</p>
          {eGasto.error && <p className="aviso error">{eGasto.error}</p>}
          <div className="acciones"><button className="bt" disabled={guardandoGasto}>{guardandoGasto ? "Guardando…" : "Guardar"}<Fl /></button></div>
        </form>
      </Modal>
    );
  }

  if (!turno) return null;
  return <CortePasos turno={turno} accion={accCerrar} cerrando={cerrando} error={eCerrar.error} contado={contado} setContado={setContado} limiteDiferencia={limiteDiferencia} evidencias={evidencias} cerrar={cerrar} />;
}

const EN_LINEA = ["Pago con QR", "Anticipo en línea", "Pago en línea"];
const iconoDe = (m: string) => (m === "Efectivo" ? "efectivo" : EN_LINEA.includes(m) ? "cuadros" : /transfer/i.test(m) ? "enviar" : "tarjeta");

const MES_CORTO: Record<string, string> = { enero: "ene", febrero: "feb", marzo: "mar", abril: "abr", mayo: "may", junio: "jun", julio: "jul", agosto: "ago", septiembre: "sep", octubre: "oct", noviembre: "nov", diciembre: "dic" };
/** "del 10 de noviembre al 15 de noviembre" pasa a "del 10 al 15 nov", para que quepa en el renglón. */
const fechasCortas = (t: string) => t.replace(/ de ([a-záéíóú]+)/gi, (_, m: string) => ` ${MES_CORTO[m.toLowerCase()] ?? m}`).replace(/(\d+) (\w+) al (\d+) \2\b/, "$1 al $3 $2");

/** Un renglón de la cuenta de corridito: signo, concepto (con nota abajo) y monto. */
function Rg({ s, t, sub, v, cls = "", children }: { s?: string; t: React.ReactNode; sub?: React.ReactNode; v: React.ReactNode; cls?: string; children?: React.ReactNode }) {
  return (
    <div className={`ct-r ${cls}`}>
      <span className="ct-t">{t}{sub ? <small>{sub}</small> : null}{children}</span>
      <span className="ct-v num">{s === "-" ? "−" : s === "+" ? "+" : ""}{v}</span>
    </div>
  );
}

/**
 * Corte de caja de corridito: 1) lo que hay en la caja, 2) se saca lo de cada quien, 3) se cuenta lo que quedó.
 * Si el efectivo no alcanza, se da lo que haya y el resto queda para el próximo corte (o por transferencia).
 * Todo vive en un solo formulario; los pasos solo muestran u ocultan su parte.
 */
function CortePasos({ turno, accion, cerrando, error, contado, setContado, limiteDiferencia, evidencias, cerrar }: {
  turno: Turno; accion: (d: FormData) => void; cerrando: boolean; error?: string; contado: string; setContado: (v: string) => void;
  limiteDiferencia: number; evidencias: boolean; cerrar: () => void;
}) {
  const m = turno.m;
  const anulados = turno.pagosAnulados ?? 0;
  const det = turno.detalle ?? { gastos: [], sacado: [], puesto: [] };
  const grupos = turno.otros.filter((o) => o.total > 0).map((o) => ({ metodo: o.metodo, total: o.total, ventas: o.ventas, icono: iconoDe(o.metodo), enLinea: EN_LINEA.includes(o.metodo) }));
  const conComprobantes = evidencias && grupos.length > 0;
  const entregas = turno.entregas ?? [];
  const propinasEq = turno.propinasEquipo ?? [];
  // Las propinas en efectivo van aparte: se apartan antes de hacer cuentas y no se reparten de la caja.
  const propAparte = propinasEq.reduce((a, p) => a + p.efectivo, 0);
  const propOtras = Math.max(0, m.propinasEfectivo - propAparte);
  const enCaja = turno.esperado - propAparte;
  const pagosAntes = Math.max(0, (turno.pagosEquipo ?? 0) - anulados);
  const sacado = det.sacado.reduce((a, x) => a + x.monto, 0);
  const propYa = Math.max(0, m.retiros - (turno.pagosEquipo ?? 0) - sacado);
  // A quién se le da hoy: su comisión (más propinas con tarjeta, que salen de la caja). Primero lo atrasado, luego lo más grande.
  const gente = [...new Set([...entregas.map((e) => e.id), ...propinasEq.filter((p) => p.otro > 0).map((p) => p.id)])].map((id) => {
    const e = entregas.find((x) => x.id === id), p = propinasEq.find((x) => x.id === id);
    const comision = e?.monto ?? 0, otro = p?.otro ?? 0;
    return { id, nombre: (e ?? p)!.nombre.split(" ")[0], comision, otro, total: comision + otro, detalle: e?.detalle ?? "", atrasado: !!e && e.detalle !== "de hoy" };
  }).sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || b.total - a.total);
  const fondo = m.fondoInicial;
  const paraRepartir = Math.max(0, enCaja - fondo);
  const [resto, setResto] = useState<Record<string, "manana" | "transferencia">>({});
  const [dados, setDados] = useState<Record<string, boolean>>({});
  const [cambiando, setCambiando] = useState<string | null>(null);
  let queda = paraRepartir;
  const reparto = gente.map((x) => { const ef = Math.min(x.total, queda); queda -= ef; return { ...x, ef, falta: x.total - ef }; });
  const saleDeCaja = reparto.reduce((a, x) => a + x.ef, 0);
  // Lo del negocio se descuenta solo al contar: sale de la caja lo que le toca (lo que alcance arriba del fondo) y se acumula para la dueña.
  // Si no alcanza, lo demás se le sigue debiendo. El depósito se registra aparte, en Movimiento de caja.
  const leToca = turno.leToca ?? 0;
  const negocio = Math.min(leToca, Math.max(0, queda));
  const seDebe = leToca - negocio;
  const esperado = enCaja - saleDeCaja - negocio;
  const deuda = (turno.duena?.saldo ?? 0) + leToca;
  const gruposComp: GrupoEvidencia[] = conComprobantes ? grupos : [];
  const hayComprobantes = gruposComp.length > 0;
  const nombres = ["caja", ...(reparto.length ? ["reparte"] : []), "cuenta", ...(hayComprobantes ? ["comprobantes"] : [])];
  const titulos: Record<string, string> = { caja: "Lo que hay en la caja", reparte: turno.verTodo ? "Saca lo de cada quien" : "Saca lo que te toca", comprobantes: "Comprobantes", cuenta: "Cuenta lo que quedó" };
  const botones: Record<string, string> = { reparte: "Repartir", comprobantes: "Comprobantes", cuenta: "Contar" };
  const pasos = nombres.length;
  const [paso, setPaso] = useState(1);
  const [faltan, setFaltan] = useState(() => gruposComp.filter((g) => !g.enLinea && g.total > 0).length);
  const [archivos, setArchivos] = useState(0);
  const c = leerPesos(contado);
  const dif = c === null ? null : c - esperado;
  const nombre = nombres[paso - 1];
  const esCierre = paso === pasos;
  const fueraCaja = grupos.filter((g) => !EN_LINEA.includes(g.metodo));
  const conDif = dif !== null && dif !== 0;
  // En el paso de contar no se avanza sin escribir cuánto se contó.
  const puedeSeguir = nombre !== "cuenta" || c !== null;
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Corte de caja, paso ${paso} de ${pasos}`} titulo={titulos[nombre]}>
      {/* Enter en un paso intermedio avanza al siguiente en lugar de cerrar la caja. */}
      <form className="pila ck ct" onSubmit={(e) => {
        e.preventDefault();
        if (!esCierre) { if (puedeSeguir) setPaso(paso + 1); return; }
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}>
        <div className="ck-pasos" aria-hidden="true">{Array.from({ length: pasos }, (_, i) => <i key={i} className={i < paso ? "on" : ""} />)}</div>
        {reparto.map((x) => (
          <span key={`h${x.id}`} hidden>
            <input type="hidden" name={`efectivo:${x.id}`} value={x.ef} />
            <input type="hidden" name={`entrega:${x.id}`} value={resto[x.id] ?? "manana"} />
          </span>
        ))}

        <div className="pila-chica" hidden={nombre !== "caja"}>
          <p className="ct-ins">Así está la caja ahora, desde las {turno.desde}.</p>
          <div className="ct-hoja">
            <Rg t="Fondo con el que abrió" v={formatoDinero(m.fondoInicial)} />
            <Rg s="+" t="Cobrado en efectivo" sub={`${turno.ventasEfectivo ?? 0} ${(turno.ventasEfectivo ?? 0) === 1 ? "venta" : "ventas"}`} v={formatoDinero(m.cobrosEfectivo)} />
            {det.puesto.map((x, k) => <Rg key={`p${k}`} s="+" t={x.concepto} sub="Dinero que se puso" v={formatoDinero(x.monto)} />)}
            {propOtras > 0 && <Rg s="+" t="Propinas de otras personas" sub="Siguen en la caja" v={formatoDinero(propOtras)} />}
            {det.gastos.map((x, k) => <Rg key={`g${k}`} s="-" t={x.concepto} sub="Gasto de caja" v={formatoDinero(x.monto)} />)}
            {pagosAntes > 0 && <Rg s="-" t="Pagos al equipo" sub="Ya entregados hoy" v={formatoDinero(pagosAntes)} />}
            {det.sacado.map((x, k) => <Rg key={`s${k}`} s="-" t={x.concepto} sub={esLlevoDuena(x.concepto) ? "Cuenta como lo del negocio" : "Dinero que se sacó"} v={formatoDinero(x.monto)} />)}
            {propYa > 0 && <Rg s="-" t="Propinas ya entregadas" v={formatoDinero(propYa)} />}
            {m.devolucionesEfectivo > 0 && <Rg s="-" t="Devoluciones en efectivo" v={formatoDinero(m.devolucionesEfectivo)} />}
            <Rg s="=" t="En la caja" v={formatoDinero(enCaja)} cls="tot" />
          </div>
          {(fueraCaja.length > 0 || propAparte > 0) && (
            <p className="ct-nota">
              {fueraCaja.length > 0 && <>{fueraCaja.map((g) => `${g.metodo} ${formatoDinero(g.total)}`).join(" y ")} no {fueraCaja.length === 1 ? "entra" : "entran"} a la caja. </>}
              {propAparte > 0 && <>Las propinas en efectivo, {formatoDinero(propAparte)}, van aparte.</>}
            </p>
          )}
          {(turno.sinCobrar ?? 0) > 0 && (
            <a className="ck-aviso" href="/citas?vista=lista"><Icono n="reloj" /><span><b>{turno.sinCobrar === 1 ? "Hay una cita atendida sin cobrar" : `Hay ${turno.sinCobrar} citas atendidas sin cobrar`}</b><small>Cóbralas antes de cerrar para que el corte cuadre.</small></span><Icono n="derecha" /></a>
          )}
        </div>

        {reparto.length > 0 && (
          <div className="pila-chica" hidden={nombre !== "reparte"}>
            <p className="ct-ins">Saca este dinero de la caja y entrégalo. Palomea al darlo.</p>
            <div className="ct-hoja">
              <Rg t="En la caja" v={formatoDinero(enCaja)} />
              {fondo > 0 && <Rg s="-" t="Fondo para mañana" sub="Se queda en la caja" v={formatoDinero(Math.min(fondo, enCaja))} />}
              <Rg s="=" t="Para repartir" v={formatoDinero(paraRepartir)} cls="tot" />
              {reparto.map((x) => {
                const r = resto[x.id] ?? "manana";
                const quePaga = [x.comision ? (x.detalle === "de hoy" ? "Comisión de hoy" : `Comisión ${fechasCortas(x.detalle)}`) : "", x.otro ? `propinas con tarjeta ${formatoDinero(x.otro)}` : ""].filter(Boolean).join(" y ").replace(/^p/, "P");
                return (
                  <div key={x.id} className={`ct-per ${x.ef === 0 ? "nada" : ""}`}>
                    <Rg s={x.ef > 0 ? "-" : undefined} v={formatoDinero(x.ef)} t={
                      <label className="ct-chk">
                        <input type="checkbox" checked={!!dados[x.id]} disabled={x.ef === 0} onChange={(e) => setDados((d) => ({ ...d, [x.id]: e.target.checked }))} />
                        <span>{x.nombre}</span>
                      </label>
                    } sub={quePaga}>
                      {x.falta > 0 && (
                        <>
                          <small className="ct-falta">
                            {x.ef === 0 ? `Ya no alcanzó el efectivo. Los ${formatoDinero(x.falta)}` : `Le tocan ${formatoDinero(x.total)}. Los ${formatoDinero(x.falta)} que faltan,`}{" "}
                            {x.comision === 0 || r === "transferencia" ? "por transferencia" : "en el próximo corte"}
                          </small>
                          {x.comision > 0 && <button type="button" className="ct-cambiar" aria-expanded={cambiando === x.id} onClick={() => setCambiando((v) => (v === x.id ? null : x.id))}>Cambiar</button>}
                          {cambiando === x.id && (
                            <div className="ct-menu" role="radiogroup" aria-label={`Cómo se le pagan a ${x.nombre} los ${formatoDinero(x.falta)} que faltan`}>
                              <span>¿Cómo se le pagan a {x.nombre} los {formatoDinero(x.falta)} que faltan?</span>
                              {([["manana", "En el próximo corte", "Se le da en efectivo en el siguiente cierre"], ["transferencia", "Por transferencia", "Le llega a quien administra para hacerla"]] as const).map(([k, t, d]) => (
                                <button type="button" key={k} role="radio" aria-checked={r === k} className={r === k ? "on" : ""} onClick={() => { setResto((v) => ({ ...v, [x.id]: k })); setCambiando(null); }}>
                                  <span><b>{t}</b><small>{d}</small></span>{r === k && <Icono n="palomita" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </Rg>
                  </div>
                );
              })}
              {propAparte > 0 && <Rg t="Propinas en efectivo" sub={`Aparte de la caja: ${propinasEq.filter((p) => p.efectivo > 0).map((p) => `${p.nombre.split(" ")[0]} ${formatoDinero(p.efectivo)}`).join(", ")}`} v={formatoDinero(propAparte)} cls="mu" />}
            </div>
          </div>
        )}

        <div className="pila-chica" hidden={nombre !== "cuenta"}>
          <p className="ct-ins">Cuenta el efectivo que quedó en la caja.</p>
          <div className="ct-hoja">
            <Rg t="En la caja" v={formatoDinero(enCaja)} />
            {reparto.filter((x) => x.ef > 0).map((x) => <Rg key={`c${x.id}`} s="-" t={x.nombre} v={formatoDinero(x.ef)} />)}
            {leToca > 0 && <Rg s={negocio > 0 ? "-" : undefined} t="Negocio" sub={seDebe === 0 ? "Se acumula para la dueña" : negocio > 0 ? `Le tocan ${formatoDinero(leToca)}. Se acumulan los ${formatoDinero(negocio)} que alcanzaron y se le quedan debiendo ${formatoDinero(seDebe)}` : `Le tocan ${formatoDinero(leToca)}. No alcanzó el efectivo, se le quedan debiendo`} v={formatoDinero(negocio)} />}
            <Rg s="=" t="Debe quedar" sub={esperado === fondo ? "El fondo para mañana" : esperado > fondo ? `El fondo y ${formatoDinero(esperado - fondo)} que se quedan en la caja` : undefined} v={formatoDinero(esperado)} cls="tot" />
          </div>
          {deuda > 0 && <p className="ct-duena"><i aria-hidden="true" />Con este corte, se le deben a la dueña <b>{formatoDinero(deuda)}</b>{turno.duena?.saldo ? `, ${turno.duena.desde}` : ""}. Cuando se deposite, se registra en Movimiento de caja.</p>}
          <label className="campo">
            <span>¿Cuánto contaste?</span>
            <input className="input grande" name="contado" inputMode="decimal" placeholder="$0" autoComplete="off" value={contado} onChange={(e) => setContado(e.target.value)} required />
          </label>
          {dif !== null && <span className={`conteo-l ${dif === 0 ? "ok" : "dif"}`}><Icono n={dif === 0 ? "palomita" : "reloj"} />{dif === 0 ? "Cuadra" : dif > 0 ? `Sobran ${formatoDinero(dif)}` : `Faltan ${formatoDinero(-dif)}`}</span>}
          {conDif && (
            <label className="campo">
              <span>¿Qué pasó?</span>
              <textarea className="input" name="notas" placeholder={Math.abs(dif!) > limiteDiferencia ? "Hay diferencia. Escribe qué pasó." : "Opcional"} />
            </label>
          )}
          {dif !== null && dif < 0 && <p className="ayuda-txt" style={{ margin: 0 }}>Si falta dinero, se decide después quién lo cubre.</p>}
        </div>

        {hayComprobantes && (
          <div className="pila-chica" hidden={nombre !== "comprobantes"}>
            <p className="ct-ins">Fotos o PDF de lo que no es efectivo.</p>
            <EvidenciasCorte grupos={gruposComp} obligatorio cambio={(f, n) => { setFaltan(f); setArchivos(n); }} dinero={formatoDinero} />
            {faltan > 0 ? <small className="ct-falta">Falta {faltan === 1 ? "un comprobante" : `${faltan} comprobantes`} para poder cerrar.</small>
              : archivos > 0 && <small className="muted">{archivos} {archivos === 1 ? "comprobante listo" : "comprobantes listos"}.</small>}
          </div>
        )}

        {error && <p className="aviso error">{error}</p>}
        <div className="ck-acc">
          {paso > 1 ? <button type="button" className="ck-atras" aria-label="Anterior" onClick={() => setPaso(paso - 1)}><Icono n="regresar" /></button> : <span />}
          {esCierre
            ? <button key="cerrar" type="submit" className="bt" disabled={cerrando || c === null || (hayComprobantes && faltan > 0)}>{cerrando ? "Cerrando…" : "Cerrar corte"}<Fl /></button>
            : <button key="seguir" type="button" className="bt" disabled={!puedeSeguir} onClick={() => setPaso(paso + 1)}>{botones[nombres[paso]] ?? "Continuar"}<Fl /></button>}
        </div>
      </form>
    </Modal>
  );
}

/**
 * Depósito a la dueña de lo acumulado del negocio. Se ve qué cortes cubre, de lo más viejo a lo más nuevo;
 * si se deposita menos, lo demás sigue pendiente. El comprobante es obligatorio.
 */
function Deposito({ duena, accion, guardando, error, atras }: { duena: NonNullable<Turno["duena"]>; accion: (d: FormData) => void; guardando: boolean; error?: string; atras: React.ReactNode }) {
  const [monto, setMonto] = useState(String(duena.saldo / 100));
  const [archivo, setArchivo] = useState<{ datos: string; nombre: string } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const centavos = Math.round((Number(monto.replace(/[$,\s]/g, "")) || 0) * 100);
  let resta = centavos;
  const cubre = duena.partes.map((p) => { const usa = Math.max(0, Math.min(p.monto, resta)); resta -= usa; return { ...p, usa }; });
  const queda = Math.max(0, duena.saldo - centavos);
  const elegir = async (f?: File) => {
    if (!f) return;
    setLeyendo(true);
    try { setArchivo({ datos: await prepararArchivo(f), nombre: f.name }); } finally { setLeyendo(false); }
  };
  return (
    <form action={accion} className="pila">
      {atras}
      <label className="campo"><span>¿Cuánto depositaste?</span>
        <input className="input grande" name="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required aria-label="Monto del depósito" />
      </label>
      <div className="campo"><span>Lo que cubre, de lo más viejo a lo más nuevo</span>
        <div className="ct-hoja dp-cubre">
          {cubre.map((p, i) => <div key={i} className={`ct-r ${p.usa === 0 ? "mu" : ""}`}><span className="ct-t">{p.texto}{p.usa > 0 && p.usa < p.monto ? <small>{formatoDinero(p.usa)} de {formatoDinero(p.monto)}</small> : null}</span><span className="ct-v num">{formatoDinero(p.usa || p.monto)}</span></div>)}
          <div className="ct-r mu"><span className="ct-t">Queda por depositar</span><span className="ct-v num">{formatoDinero(queda)}</span></div>
        </div>
      </div>
      {centavos > duena.saldo && <p className="aviso error">Solo se le deben {formatoDinero(duena.saldo)}.</p>}
      <div className="campo"><span>Comprobante del depósito</span>
        <div className="dp-arch">
          <label className="bt sec chico"><Icono n="camara" />Foto<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => elegir(e.target.files?.[0])} /></label>
          <label className="bt sec chico"><Icono n="clip" />Archivo<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => elegir(e.target.files?.[0])} /></label>
          {archivo && <small className="muted">{archivo.nombre}</small>}
          {leyendo && <small className="muted">Preparando…</small>}
        </div>
      </div>
      <input type="hidden" name="comprobante" value={archivo?.datos ?? ""} />
      <input type="hidden" name="comprobanteNombre" value={archivo?.nombre ?? ""} />
      {error && <p className="aviso error">{error}</p>}
      <div className="acciones"><button className="bt" disabled={guardando || !archivo || centavos <= 0 || centavos > duena.saldo}>{guardando ? "Guardando…" : "Guardar depósito"}<Fl /></button></div>
    </form>
  );
}
