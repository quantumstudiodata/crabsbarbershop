"use client";

import { zoomPagina } from "@/lib/zoom";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/ui";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { DecidirFaltante } from "./DecidirFaltante";
import { Corregir } from "./Corregir";

export type Corte = {
  id: string; folio: string; horario: string; dia: string; fechaCorta: string;
  abrio: { nombre: string; avatar: string }; cerro: { nombre: string; avatar: string };
  metodos: { metodo: string; total: number }[]; total: number; ventas: number;
  fondo: number; ventasEfectivo: number; propinasEfectivo: number; entradas: number; retiros: number; gastos: number; pagosEquipo: number; propinasEnt: number; otrosEgresos: { concepto: string; metodo: string; monto: number }[];
  esperado: number; contado: number; diferencia: number; ajustado?: number; notas: string | null;
  movimientos: { hora: string; tipo?: string; titulo: string; detalle: string; monto: number }[];
  /** Pagos decididos en el cierre que no salieron de la caja. */
  fueraCaja?: { nombre: string; monto: number; como: string }[];
  ajustes: string[];
  evidencias: { id: string; etiqueta: string; nombre: string; tipo: string }[];
  abrioId?: string;
  cobradores?: { id: string; nombre: string; avatar: string; efectivo: number }[];
  equipo?: { id: string; nombre: string; avatar: string }[];
};

const $ = formatoDinero;
const primer = (n: string) => n.split(" ")[0];

function Estado({ d }: { d: number }) {
  if (d === 0) return <span className="chip-p">Cuadró</span>;
  return <span className={`chip-p ${d < 0 ? "alerta" : ""}`}>{d < 0 ? "Faltaron" : "Sobraron"} {$(Math.abs(d))}</span>;
}

/** Cortes con faltante que nadie ha revisado. Solo aquí se marcan como revisados. */
export function NecesitaRevision({ cortes, puede }: { cortes: Corte[]; puede: boolean }) {
  const [ver, setVer] = useState<Corte | null>(null);
  const [decidir, setDecidir] = useState<Corte | null>(null);
  const [todos, setTodos] = useState(false);
  if (!cortes.length) return null;
  const visibles = todos ? cortes : cortes.slice(0, 3);
  return (
    <section className="glass revision-c subir">
      <div className="entre"><span className="lab">Necesita revisión</span><span className="muted chico-t">{cortes.length} {cortes.length === 1 ? "corte con faltante" : "cortes con faltante"}</span></div>
      {visibles.map((c) => (
        <div key={c.id} className="fila-rev">
          <button type="button" className="rev-l" onClick={() => setVer(c)}>
            <span className="folio">{c.folio}</span><span>{c.fechaCorta.replace(/ de (\p{L}{3})\p{L}*/u, " $1")}</span>
            <span className="quien"><Avatar avatar={c.cerro.avatar} nombre={c.cerro.nombre} t={24} />{primer(c.cerro.nombre)}</span>
            <Estado d={c.diferencia} />
          </button>
          {puede && <button type="button" className="bt sec chico" onClick={() => setDecidir(c)}>Decidir faltante</button>}
        </div>
      ))}
      {cortes.length > 3 && <button type="button" className="link-c ver-mas" onClick={() => setTodos(!todos)}>{todos ? "Ver menos" : `Ver los ${cortes.length}`}</button>}
      <Detalle c={ver} cerrar={() => setVer(null)} />
      {decidir && <DecidirFaltante c={decidir} cerrar={() => setDecidir(null)} />}
    </section>
  );
}

/** Lo que se entregó al cerrar, en renglones bajo la pastilla del corte. */
export type HijoCorte = { id: string; nombre: string; que: string; monto: string; aparte?: boolean };

/**
 * Un corte dentro de Movimientos: una pastilla sobre una línea con la hora, cómo quedó y lo vendido;
 * debajo, lo que se le dio a cada quien. Al tocar la pastilla se abre su detalle. Quien no puede ver cortes solo ve la pastilla.
 */
export function FilaCorte({ c, corregir, abrir, ver = true, hijos = [] }: { c: Corte; corregir: boolean; abrir?: boolean; ver?: boolean; hijos?: HijoCorte[] }) {
  const [abierto, setAbierto] = useState(!!abrir && ver);
  const [ajuste, setAjuste] = useState(false);
  const hora = c.horario.split(" a ")[1] || c.horario;
  const estado = c.diferencia === 0 ? "cuadró" : `${c.diferencia < 0 ? "faltaron" : "sobraron"} ${$(Math.abs(c.diferencia))}`;
  const contenido = <><span className="cp-txt">Corte {hora}, <span className={c.diferencia < 0 ? "cp-falta" : ""}>{ver ? estado : "cerrado"}</span></span>{ver && <small>{$(c.total)} vendido</small>}</>;
  return (
    <div className={`hist-fila t-corte ${abierto ? "abierta" : ""}`}>
      <div className="cp-div">
        <span className="cp-ln" />
        {ver ? <button type="button" className="cp-pill" aria-label={`Ver corte ${c.folio}`} onClick={() => setAbierto(true)}>{contenido}</button> : <span className="cp-pill">{contenido}</span>}
        <span className="cp-ln" />
      </div>
      {hijos.length > 0 && (
        <div className="cp-hijos">
          {hijos.map((h) => <div key={h.id} className={h.aparte ? "ap" : ""}><span>{h.nombre} <small>{h.que}</small></span><span className="num">{h.monto}</span></div>)}
        </div>
      )}
      {ver && <Detalle c={abierto ? c : null} cerrar={() => setAbierto(false)} ajustar={corregir ? () => { setAbierto(false); setAjuste(true); } : undefined} />}
      {ajuste && <Corregir id={c.id} dia={c.dia} folio={c.folio} diferencia={c.diferencia + (c.ajustado ?? 0)} abierto cerrar={() => setAjuste(false)} />}
    </div>
  );
}

/** Imprime solo el comprobante, con el ancho de un ticket. El archivo se llama "Corte de caja C-000012". */
function imprimir(folio: string) {
  const antes = document.title;
  document.title = `Corte de caja ${folio}`;
  document.body.classList.add("imprimiendo-ticket");
  // Rollo de 80 mm: la hoja mide lo mismo que el ticket, para que la impresora no avance papel en blanco.
  const papel = document.querySelector(".rc-papel");
  const mm = papel ? Math.ceil((papel.getBoundingClientRect().height / zoomPagina()) * 25.4 / 96) + 4 : 200;
  const hoja = document.createElement("style");
  hoja.textContent = `@page { size: 80mm ${mm}mm; margin: 0; }`;
  document.head.appendChild(hoja);
  const fin = () => { document.title = antes; document.body.classList.remove("imprimiendo-ticket"); hoja.remove(); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  window.print();
}

type Ev = Corte["evidencias"][number];

/** Evidencia dentro de la app, con botón de regresar: en la app instalada una pestaña nueva no tiene cómo volver. */
function Visor({ e, cerrar }: { e: Ev; cerrar: () => void }) {
  const pdf = e.tipo === "application/pdf";
  return (
    <div className="visor-ev" role="dialog" aria-modal="true" aria-label={e.nombre}>
      <div className="visor-cab">
        <button type="button" className="visor-atras" onClick={cerrar}><Icono n="izquierda" />Regresar</button>
        <span className="visor-t"><b>{e.etiqueta || "General"}</b><small>{e.nombre}</small></span>
      </div>
      <div className="visor-cuerpo">
        {pdf ? <iframe src={`/api/evidencia/${e.id}`} title={e.nombre} /> : <img src={`/api/evidencia/${e.id}`} alt={e.nombre} />}
      </div>
    </div>
  );
}

function Detalle({ c, cerrar, ajustar }: { c: Corte | null; cerrar: () => void; ajustar?: (c: Corte) => void }) {
  const [foto, setFoto] = useState<Ev | null>(null);
  if (!c) return null;
  const estado = c.diferencia === 0 ? "cuadró" : `${c.diferencia < 0 ? "faltaron" : "sobraron"} ${$(Math.abs(c.diferencia))}`;
  // Propinas con tarjeta que se pagaron con efectivo de la caja: lo que se entregó de más sobre las propinas en efectivo.
  const propDeCaja = c.propinasEnt - c.propinasEfectivo;
  const caja = c.movimientos.filter((m) => !/^Propinas entregadas/.test(m.titulo));
  const nombreDe = (m: Corte["movimientos"][number]) => m.titulo === "Pago al equipo" ? `${m.detalle.replace(/^Comisión de /, "")}, comisión` : m.detalle;
  const subDe = (m: Corte["movimientos"][number]) => m.titulo === "Pago al equipo" ? "De la caja" : m.titulo === "Gasto pagado con la caja" ? "Gasto de caja" : m.titulo;
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Folio ${c.folio}`} titulo={`Corte de caja, ${estado}`}>
      <div className="pila-chica cd">
        <p className="ct-ins">{c.dia}, {c.horario}.{c.cerro.nombre ? ` Cerró ${primer(c.cerro.nombre)}.` : ""}</p>
        <div className="ct-hoja">
          <Rg t="Fondo con el que abrió" v={$(c.fondo)} />
          <Rg s="+" t="Cobrado en efectivo" v={$(c.ventasEfectivo)} />
          {caja.map((m, i) => <Rg key={i} s={m.monto < 0 ? "-" : "+"} t={nombreDe(m)} sub={`${subDe(m)}, ${m.hora}`} v={$(Math.abs(m.monto))} />)}
          {propDeCaja > 0 && <Rg s="-" t="Propinas con tarjeta" sub="Se pagaron con la caja" v={$(propDeCaja)} />}
          <Rg s="=" t="Debía quedar" v={$(c.esperado)} cls="tot" />
          <Rg t="Se contó" sub={c.diferencia === 0 ? "Cuadró" : estado.replace(/^./, (x) => x.toUpperCase())} v={$(c.contado)} />
          {(c.fueraCaja ?? []).map((x, i) => <Rg key={`f${i}`} t={`${x.nombre}, comisión`} sub={x.como === "por transferencia" ? "Por transferencia, no sale de la caja" : "Para el próximo corte"} v={$(x.monto)} cls="mu" />)}
          {c.propinasEfectivo > 0 && <Rg t="Propinas en efectivo" sub="Aparte de la caja" v={$(c.propinasEfectivo)} cls="mu" />}
        </div>
        {c.otrosEgresos.length > 0 && (
          <>
            <span className="cd-t">Egresos del turno</span>
            <div className="ct-hoja">{c.otrosEgresos.map((g, i) => <Rg key={i} t={g.concepto} sub={`${g.metodo}, no sale de la caja`} v={$(g.monto)} />)}</div>
          </>
        )}
        <span className="cd-t">Vendido {$(c.total)}</span>
        <div className="ct-hoja">{c.metodos.map((m) => <Rg key={m.metodo} t={m.metodo} v={$(m.total)} />)}</div>
        {c.evidencias.length > 0 && (
          <>
            <span className="cd-t">Fotos de comprobantes</span>
            <div className="ct-hoja">{c.evidencias.map((e) => <Rg key={e.id} t={e.etiqueta || "General"} sub={e.nombre} v={<button type="button" className="enlace" onClick={() => setFoto(e)}>Ver</button>} />)}</div>
          </>
        )}
        {(c.notas || c.ajustes.length > 0) && (
          <>
            <span className="cd-t">Observaciones</span>
            <div className="ct-hoja cd-obs">{c.notas && <p>{c.notas}</p>}{c.ajustes.map((a, i) => <p key={i}>{a}</p>)}</div>
          </>
        )}
        <div className="cd-acc">
          <button type="button" className="bt sec chico" onClick={() => imprimir(c.folio)}><Icono n="imprimir" />Imprimir</button>
          {ajustar && <button type="button" className="bt sec chico" onClick={() => ajustar(c)}>Registrar ajuste</button>}
        </div>
        <Ticket c={c} />
      </div>
      {foto && <Visor e={foto} cerrar={() => setFoto(null)} />}
    </Modal>
  );
}

/** Un renglón de la cuenta de corridito: signo, concepto (con nota abajo) y monto. */
function Rg({ s, t, sub, v, cls = "" }: { s?: string; t: React.ReactNode; sub?: React.ReactNode; v: React.ReactNode; cls?: string }) {
  return (
    <div className={`ct-r ${cls}`}>
      <span className="ct-s" aria-hidden="true">{s ?? ""}</span>
      <span className="ct-t">{t}{sub ? <small>{sub}</small> : null}</span>
      <span className="ct-v num">{v}</span>
    </div>
  );
}

/** El ticket de 80 mm: solo se ve al imprimir. */
function Ticket({ c }: { c: Corte }) {
  return (
    <div className="rc-papel solo-imp">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rc-logo" src="/logo-crabs.png" alt="Crabs" width={946} height={209} />
      <div className="recibo-c">
        <div className="rc-cab"><span className="rc-tit">Corte de caja {c.folio}</span><b>{c.dia}</b><small>{c.horario}</small><small>Abrió {primer(c.abrio.nombre) || "sin registro"}, cerró {primer(c.cerro.nombre) || "sin registro"}</small></div>
        <div className="rc-sec"><span className="lab">Cobros</span>
          {c.metodos.map((m) => <div key={m.metodo}><span>{m.metodo}</span><span className="num">{$(m.total)}</span></div>)}
          <div className="rc-tot"><span>Total vendido, {c.ventas} {c.ventas === 1 ? "venta" : "ventas"}</span><b className="num">{$(c.total)}</b></div>
        </div>
        <div className="rc-sec"><span className="lab">Efectivo</span>
          <div><span>Con lo que se abrió la caja</span><span className="num">{$(c.fondo)}</span></div>
          <div><span>Ventas en efectivo</span><span className="num">+{$(c.ventasEfectivo)}</span></div>
          {c.entradas > 0 && <div><span>Dinero que se puso en la caja</span><span className="num">+{$(c.entradas)}</span></div>}
          {c.gastos > 0 && <div><span>Gastos pagados con la caja</span><span className="num">−{$(c.gastos)}</span></div>}
          {c.pagosEquipo > 0 && <div><span>Pagos al equipo</span><span className="num">−{$(c.pagosEquipo)}</span></div>}
          {c.retiros > 0 && <div><span>Dinero que se sacó</span><span className="num">−{$(c.retiros)}</span></div>}
          <div><span>Debía haber</span><span className="num">{$(c.esperado)}</span></div>
          <div><span>Se contó</span><span className="num">{$(c.contado)}</span></div>
          <div className="rc-tot"><span>Diferencia</span><Estado d={c.diferencia} /></div>
        </div>
        {c.otrosEgresos.length > 0 && (
          <div className="rc-sec"><span className="lab">Egresos del turno</span>
            {c.otrosEgresos.map((g, i) => <div key={i}><span>{g.concepto}<small>{g.metodo}</small></span><span className="num">{$(g.monto)}</span></div>)}
          </div>
        )}
        {(c.notas || c.ajustes.length > 0) && (
          <div className="rc-sec"><span className="lab">Observaciones</span>{c.notas && <p>{c.notas}</p>}{c.ajustes.map((a, i) => <p key={i}>{a}</p>)}</div>
        )}
      </div>
    </div>
  );
}
