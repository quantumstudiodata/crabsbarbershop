"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { registrarPago } from "../analitica/equipo/actions";

export type DatosFila = {
  id: string; nombre: string; avatar: string; modalidad: string; frecuencia: string; periodo: string; semana: string;
  renta: boolean; monto: string; estado: string; parcial: boolean; detalle: [string, string][]; puedePagar: boolean;
  /** Forma de pago habitual de la persona: efectivo | transferencia | otro. */
  forma?: string;
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
