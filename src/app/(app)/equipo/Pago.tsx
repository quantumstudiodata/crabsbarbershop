"use client";

import { useActionState, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "../analitica/equipo/actions";
import { entregarPendiente } from "./actions";
import { formatoDinero } from "@/lib/money";
import { avisarGuardado, useUnEnvio } from "@/components/Envio";

export type DatosFila = {
  id: string; nombre: string; avatar: string; modalidad: string; frecuencia: string; periodo: string; semana: string;
  renta: boolean; monto: string; estado: string; parcial: boolean; detalle: [string, string][]; puedePagar: boolean;
  /** Forma de pago habitual de la persona: efectivo | transferencia | otro. */
  forma?: string;
  /** Hay una caja abierta: un pago en efectivo sale de ella. */
  cajaAbierta?: boolean;
};

const FORMAS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["otro", "Otro"]] as const;

/** Elegir la forma de pago con fichas, en lugar de una lista del navegador. */
function Formas({ name, valor, cambiar }: { name: string; valor: string; cambiar: (v: string) => void }) {
  return (
    <div className="pg-formas" role="radiogroup" aria-label="Forma de pago">
      <input type="hidden" name={name} value={valor} />
      {FORMAS.map(([k, t]) => <button type="button" key={k} role="radio" aria-checked={valor === k} className={valor === k ? "on" : ""} onClick={() => cambiar(k)}>{t}</button>)}
    </div>
  );
}

/** Desglose del periodo en curso y, con permiso, el registro del pago (o del cobro de renta). */
export function FormPago({ f, regreso }: { f: DatosFila; regreso: string }) {
  const [forma, setForma] = useState(f.forma ?? "efectivo");
  const [dos, setDos] = useState(false);
  const [forma2, setForma2] = useState(f.forma === "transferencia" ? "efectivo" : "transferencia");
  const [monto, setMonto] = useState("");
  return (
    <div className="pila">
      <dl className="eq-desg">{f.detalle.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {f.puedePagar && (
        <form action={registrarPago} className="pila">
          <input type="hidden" name="barberoId" value={f.id} />
          <input type="hidden" name="semana" value={f.semana} />
          <input type="hidden" name="regreso" value={regreso} />
          <input type="hidden" name="tipo" value={f.renta ? "renta" : "pago"} />
          <div className="tarjeta-m pila">
            <div className="campo"><span>{f.renta ? "Forma en que pagó" : "Forma de pago"}</span><Formas name="forma" valor={forma} cambiar={setForma} /></div>
            {!f.renta && (forma === "efectivo" || (dos && forma2 === "efectivo")) && <p className="ayuda-txt" style={{ margin: 0 }}>{f.cajaAbierta ? "El efectivo sale de la caja abierta. Se anota solo, no hace falta registrarlo otra vez en Cobro." : "La caja está cerrada: este pago no cambia ningún corte."}</p>}
            <label className="campo"><span>{dos ? "Monto con esta forma" : f.renta ? "Monto recibido" : "Monto pagado"}</span>
              <span className="pg-monto"><input className="input grande" name="monto" inputMode="decimal" placeholder={f.monto} value={monto} onChange={(e) => setMonto(e.target.value)} required />
                {!dos && <button type="button" className="bt sec chico" onClick={() => setMonto(f.monto.replace(/[^\d.]/g, ""))}>Todo {f.monto}</button>}</span>
            </label>
            {dos ? (
              <>
                <div className="campo"><span>Segunda forma de pago</span><Formas name="forma2" valor={forma2} cambiar={setForma2} /></div>
                <label className="campo"><span>Monto con la segunda forma</span><input className="input grande" name="monto2" inputMode="decimal" placeholder="$0" required /></label>
                <button type="button" className="ac-link" style={{ justifySelf: "start" }} onClick={() => setDos(false)}>Usar una sola forma de pago</button>
              </>
            ) : <button type="button" className="ac-link" style={{ justifySelf: "start" }} onClick={() => setDos(true)}><Icono n="mas" />Pagar con dos formas de pago</button>}
            <label className="campo"><span>Nota</span><input className="input" name="nota" placeholder="Opcional" /></label>
          </div>
          <div className="acciones"><button className="bt">{f.renta ? "Registrar cobro" : "Registrar pago"}<Fl /></button></div>
        </form>
      )}
    </div>
  );
}

/** Botón único de Equipo: elige a la persona y registra su pago o el cobro de su renta. */
export function RegistrarPago({ filas, regreso, texto = "Registrar pago", clase = "eq2-pri", abrir = false }: { filas: DatosFila[]; regreso: string; texto?: string; clase?: string; abrir?: boolean }) {
  // Desde Acciones rápidas llega ya abierta; al cerrarla se queda en Equipo, para que se sepa dónde vive.
  const [abierto, setAbierto] = useState(abrir);
  useEffect(() => { if (abrir) try { history.replaceState(null, "", regreso); } catch { /* sin historial */ } }, [abrir, regreso]);
  const [elegida, setElegida] = useState<DatosFila | null>(filas.length === 1 ? filas[0] : null);
  const cerrar = () => { setAbierto(false); setElegida(filas.length === 1 ? filas[0] : null); };
  if (!filas.length) return null;
  return (
    <>
      <button type="button" className={clase} onClick={() => setAbierto(true)}>{texto}</button>
      <Modal abierto={abierto} cerrar={cerrar} etiqueta={elegida ? elegida.periodo : "Pagos del equipo"} titulo={elegida ? elegida.nombre : "¿A quién?"}>
        {elegida ? (
          <div className="pila">
            {filas.length > 1 && <button type="button" className="eq2-atras" onClick={() => setElegida(null)}><Icono n="izquierda" />Elegir a otra persona</button>}
            <FormPago f={elegida} regreso={regreso} />
          </div>
        ) : (
          <div className="eq2-elige">
            {filas.map((f) => (
              <button type="button" key={f.id} className="eq2-fila" onClick={() => setElegida(f)}>
                <Avatar avatar={f.avatar} nombre={f.nombre} t={32} />
                <span><b>{f.nombre}</b><small>{f.renta ? "Renta de silla" : f.modalidad}, {f.frecuencia.toLowerCase()}</small></span>
                <span className="eq2-m"><b>{f.monto}</b><small>{f.renta ? "por cobrar" : "por pagar"}</small></span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

export type PendientePersona = { id: string; nombre: string; avatar: string; partes: { monto: number; dias: string }[] };

/**
 * Con pagos automáticos: registrar que ya se le pagó a alguien una comisión pendiente de entregar,
 * por transferencia o con efectivo de la caja abierta, sin hacer un corte.
 */
export function EntregarPendientes({ personas, cajaAbierta, efectivo = 0, texto = "Registrar pago", clase = "eq2-pri" }: { personas: PendientePersona[]; cajaAbierta: boolean; /** Efectivo de la caja que se puede usar (sin propinas). */ efectivo?: number; texto?: string; clase?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<PendientePersona | null>(personas.length === 1 ? personas[0] : null);
  const cerrar = () => { setAbierto(false); setElegida(personas.length === 1 ? personas[0] : null); };
  if (!personas.length) return null;
  const total = (x: PendientePersona) => x.partes.reduce((a, p) => a + p.monto, 0);
  return (
    <>
      <button type="button" className={clase} onClick={() => setAbierto(true)}>{texto}</button>
      <Modal abierto={abierto} cerrar={cerrar} etiqueta="Pendiente de entregar" titulo={elegida ? elegida.nombre : "¿A quién?"}>
        {elegida ? (
          <div className="pila">
            {personas.length > 1 && <button type="button" className="eq2-atras" onClick={() => setElegida(null)}><Icono n="izquierda" />Elegir a otra persona</button>}
            <FormEntrega p={elegida} total={total(elegida)} cajaAbierta={cajaAbierta} efectivo={efectivo} cerrar={cerrar} />
          </div>
        ) : (
          <div className="eq2-elige">
            {personas.map((x) => (
              <button type="button" key={x.id} className="eq2-fila" onClick={() => setElegida(x)}>
                <Avatar avatar={x.avatar} nombre={x.nombre} t={32} />
                <span><b>{x.nombre}</b><small>{x.partes.length === 1 ? `Comisión ${x.partes[0].dias}` : `${x.partes.length} comisiones pendientes`}</small></span>
                <span className="eq2-m"><b>{formatoDinero(total(x))}</b><small>por entregar</small></span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function FormEntrega({ p, total, cajaAbierta, efectivo, cerrar }: { p: PendientePersona; total: number; cajaAbierta: boolean; efectivo: number; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState(entregarPendiente, null);
  // Si hay efectivo se paga de la caja; por transferencia solo lo que la caja no alcance.
  const deCaja = Math.min(total, efectivo), maxTransf = Math.max(0, total - efectivo);
  const [forma, setForma] = useState(deCaja > 0 ? "efectivo" : "transferencia");
  const tope = forma === "efectivo" ? deCaja : maxTransf;
  const [monto, setMonto] = useState((tope / 100).toFixed(0));
  const cambiar = (f: string) => { setForma(f); setMonto((((f === "efectivo" ? deCaja : maxTransf)) / 100).toFixed(0)); };
  const unEnvio = useUnEnvio(guardando);
  useEffect(() => { if (e?.ok) { avisarGuardado(e.mensaje); cerrar(); } }, [e?.ok, e?.mensaje, cerrar]);
  const lista = <dl className="eq-desg">
    {p.partes.map((x, i) => <div key={i}><dt>Comisión {x.dias || "de días anteriores"}</dt><dd>{formatoDinero(x.monto)}</dd></div>)}
    {p.partes.length > 1 && <div><dt>Total pendiente</dt><dd>{formatoDinero(total)}</dd></div>}
  </dl>;
  if (!cajaAbierta) return <div className="pila">{lista}<p className="ayuda-txt" style={{ margin: 0 }}>La caja está cerrada. Se le paga en el próximo corte: de la caja, y lo que no alcance, por transferencia.</p></div>;
  return (
    <form action={accion} onSubmit={unEnvio} className="pila">
      <input type="hidden" name="barberoId" value={p.id} />
      <input type="hidden" name="forma" value={forma} />
      {lista}
      <div className="tarjeta-m pila">
        <div className="campo"><span>Forma de pago</span>
          <div className="pg-formas" role="radiogroup" aria-label="Forma de pago">
            <button type="button" role="radio" aria-checked={forma === "efectivo"} className={forma === "efectivo" ? "on" : ""} disabled={deCaja === 0} onClick={() => cambiar("efectivo")}>Efectivo de la caja</button>
            <button type="button" role="radio" aria-checked={forma === "transferencia"} className={forma === "transferencia" ? "on" : ""} disabled={maxTransf === 0} onClick={() => cambiar("transferencia")}>Transferencia</button>
          </div>
        </div>
        <p className="ayuda-txt" style={{ margin: 0 }}>{forma === "efectivo"
          ? `Sale de la caja abierta. ${maxTransf > 0 ? `En la caja alcanza para ${formatoDinero(deCaja)}; lo demás, ${formatoDinero(maxTransf)}, por transferencia.` : ""}`
          : `En la caja no alcanza: por transferencia van ${formatoDinero(maxTransf)}${deCaja > 0 ? `, y ${formatoDinero(deCaja)} de la caja` : ""}.`}</p>
        <label className="campo"><span>Monto pagado</span>
          <span className="pg-monto"><input className="input grande" name="monto" inputMode="decimal" value={monto} onChange={(ev) => setMonto(ev.target.value)} required />
            <button type="button" className="bt sec chico" onClick={() => setMonto((tope / 100).toFixed(0))}>Todo {formatoDinero(tope)}</button></span>
        </label>
        <p className="ayuda-txt" style={{ margin: 0 }}>Se cubre primero lo más viejo. Si pagas menos, lo demás sigue pendiente.</p>
      </div>
      {e?.error && <p className="aviso error">{e.error}</p>}
      <div className="acciones"><button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Registrar pago"}<Fl /></button></div>
    </form>
  );
}
