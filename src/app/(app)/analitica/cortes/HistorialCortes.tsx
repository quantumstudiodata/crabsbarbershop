"use client";

import { useState } from "react";
import { Vacio } from "@/components/Vacio";
import { Avatar } from "@/components/Avatar";
import { Cajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { DecidirFaltante } from "./DecidirFaltante";
import { Corregir } from "./Corregir";

export type Corte = {
  id: string; folio: string; horario: string; dia: string; fechaCorta: string;
  abrio: { nombre: string; avatar: string }; cerro: { nombre: string; avatar: string };
  metodos: { metodo: string; total: number }[]; total: number; ventas: number;
  fondo: number; ventasEfectivo: number; propinasEfectivo: number; entradas: number; retiros: number; gastos: number;
  esperado: number; contado: number; diferencia: number; ajustado?: number; notas: string | null;
  movimientos: { hora: string; titulo: string; detalle: string; monto: number }[];
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

/** Todos los cortes en una tabla. Al tocar uno se abre su comprobante a un lado. */
export function TablaCortes({ cortes, corregir }: { cortes: Corte[]; corregir: boolean }) {
  const [ver, setVer] = useState<Corte | null>(null);
  const [ajuste, setAjuste] = useState<Corte | null>(null);
  if (!cortes.length) return <Vacio icono="candado" titulo="No hay cortes con esos filtros" texto="Cada vez que alguien cierre la caja, el corte aparecerá aquí con lo vendido y si sobró o faltó dinero." />;
  return (
    <>
      <div className="hist-scroll tabla-c-scroll">
        <table className="tabla-c">
          <thead><tr><th>Folio</th><th>Día</th><th>Horario</th><th>Cerró</th><th>Estado</th><th className="der">Vendido</th></tr></thead>
          <tbody>
            {cortes.map((c) => (
              <tr key={c.id} className={ver?.id === c.id ? "activa" : ""} onClick={() => setVer(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setVer(c); }}>
                <td><span className="folio">{c.folio}</span></td>
                <td>{c.fechaCorta}</td>
                <td className="muted">{c.horario}</td>
                <td>{c.cerro.nombre && <span className="quien"><Avatar avatar={c.cerro.avatar} nombre={c.cerro.nombre} t={24} />{primer(c.cerro.nombre)}</span>}</td>
                <td><Estado d={c.diferencia} /></td>
                <td className="der num">{$(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Registrar ajuste cierra el comprobante y abre su ventana, para no encimar dos capas. */}
      <Detalle c={ver} cerrar={() => setVer(null)} ajustar={corregir ? (c) => { setVer(null); setAjuste(c); } : undefined} />
      {ajuste && <Corregir id={ajuste.id} dia={ajuste.dia} folio={ajuste.folio} diferencia={ajuste.diferencia + (ajuste.ajustado ?? 0)} abierto cerrar={() => setAjuste(null)} />}
    </>
  );
}

/** Imprime solo el comprobante, con el ancho de un ticket. El archivo se llama "Corte de caja C-000012". */
function imprimir(folio: string) {
  const antes = document.title;
  document.title = `Corte de caja ${folio}`;
  document.body.classList.add("imprimiendo-ticket");
  const fin = () => { document.title = antes; document.body.classList.remove("imprimiendo-ticket"); window.removeEventListener("afterprint", fin); };
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
  return (
    <Cajon abierto={!!c} cerrar={cerrar} titulo={c ? `Corte ${c.folio}` : ""}
      pie={c && <>{ajustar && <button type="button" className="enlace" onClick={() => ajustar(c)}>Registrar ajuste</button>}<button type="button" className="bt chico" onClick={() => imprimir(c.folio)}><Icono n="imprimir" />Imprimir</button></>}>
      {c && (
        <div className="rc-papel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rc-logo" src="/logo-crabs.png" alt="Crabs" width={946} height={209} />
        <div className="recibo-c">
          <div className="rc-cab"><span className="rc-tit">Corte de caja {c.folio}</span><b>{c.dia}</b><small>{c.horario}</small><small>Abrió {primer(c.abrio.nombre)}, cerró {primer(c.cerro.nombre)}</small></div>
          <div className="rc-sec"><span className="lab">Cobros</span>
            {c.metodos.map((m) => <div key={m.metodo}><span>{m.metodo}</span><span className="num">{$(m.total)}</span></div>)}
            <div className="rc-tot"><span>Total vendido, {c.ventas} {c.ventas === 1 ? "venta" : "ventas"}</span><b className="num">{$(c.total)}</b></div>
          </div>
          <div className="rc-sec"><span className="lab">Efectivo</span>
            <div><span>Fondo inicial</span><span className="num">{$(c.fondo)}</span></div>
            <div><span>Ventas en efectivo</span><span className="num">+{$(c.ventasEfectivo)}</span></div>
            {c.propinasEfectivo > 0 && <div><span>Propinas en efectivo</span><span className="num">+{$(c.propinasEfectivo)}</span></div>}
            {c.entradas > 0 && <div><span>Entradas</span><span className="num">+{$(c.entradas)}</span></div>}
            {c.retiros + c.gastos > 0 && <div><span>Retiros y gastos</span><span className="num">−{$(c.retiros + c.gastos)}</span></div>}
            <div><span>Debía haber</span><span className="num">{$(c.esperado)}</span></div>
            <div><span>Se contó</span><span className="num">{$(c.contado)}</span></div>
            <div className="rc-tot"><span>Diferencia</span><Estado d={c.diferencia} /></div>
          </div>
          {c.movimientos.length > 0 && (
            <div className="rc-sec"><span className="lab">Movimientos de caja</span>
              {c.movimientos.map((m, i) => <div key={i}><span>{m.hora} {m.titulo}<small>{m.detalle}</small></span><span className="num">{m.monto < 0 ? `−${$(-m.monto)}` : $(m.monto)}</span></div>)}
            </div>
          )}
          {c.evidencias.length > 0 && (
            <div className="rc-sec rc-evid"><span className="lab">Evidencias</span>
              {c.evidencias.map((e) => <div key={e.id}><span>{e.etiqueta || "General"}<small>{e.nombre}</small></span><button type="button" className="enlace" onClick={() => setFoto(e)}>Ver</button></div>)}
            </div>
          )}
          {(c.notas || c.ajustes.length > 0) && (
            <div className="rc-sec"><span className="lab">Observaciones</span>
              {c.notas && <p>{c.notas}</p>}
              {c.ajustes.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          )}
        </div>
        </div>
      )}
      {foto && <Visor e={foto} cerrar={() => setFoto(null)} />}
    </Cajon>
  );
}
