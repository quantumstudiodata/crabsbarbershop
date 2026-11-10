"use client";

import { useState } from "react";
import { formatoDinero, leerPesos } from "@/lib/money";

export type TipoPago = "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto";
export type FormaActual = {
  tipo: TipoPago; porcentaje: number; montoFijo: number; montoSemanal: number; periodo?: string;
  frecuenciaPago?: string; diaCorte?: number | null; diaPago?: number; formaPago?: string; desde?: string;
} | null;

const TIPOS: { t: TipoPago; titulo: string; detalle: string }[] = [
  { t: "porcentaje", titulo: "Porcentaje por servicio", detalle: "Recibe un porcentaje de cada servicio realizado" },
  { t: "fijo", titulo: "Pago fijo por servicio", detalle: "Recibe una cantidad determinada por cada servicio" },
  { t: "renta", titulo: "Renta de silla", detalle: "Paga una renta al negocio por usar el espacio" },
  { t: "sueldo", titulo: "Sueldo fijo", detalle: "Recibe una cantidad fija por periodo" },
  { t: "mixto", titulo: "Sueldo más porcentaje", detalle: "Recibe un sueldo base y un porcentaje adicional" },
];
const PERIODOS: [string, string][] = [["semana", "Semanal"], ["quincena", "Quincenal"], ["mes", "Mensual"]];
const FRECUENCIAS: [string, string][] = [["dia", "Diario"], ["semana", "Semanal"], ["quincena", "Quincenal"], ["mes", "Mensual"], ["servicio", "Por servicio"]];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hoyLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const EJEMPLO = 15000;

/** Remuneración de un barbero, dentro del alta o la edición del usuario. */
export function CamposFormaPago({ actual, conRenta = true }: { actual: FormaActual; conRenta?: boolean }) {
  const [frec, setFrec] = useState(actual?.frecuenciaPago ?? actual?.periodo ?? "semana");
  const [tocada, setTocada] = useState(!!actual);
  const [tipo, setTipo] = useState<TipoPago>(actual?.tipo ?? "porcentaje");
  const [pct, setPct] = useState(actual?.porcentaje ? String(actual.porcentaje / 100) : "40");
  const [fijo, setFijo] = useState(actual?.montoFijo ? String(actual.montoFijo / 100) : "");
  const [monto, setMonto] = useState(actual?.montoSemanal ? String(actual.montoSemanal / 100) : "");
  const [periodo, setPeriodo] = useState(actual?.periodo ?? "semana");
  const p = Number(pct) || 0;
  const comision = formatoDinero(Math.round((EJEMPLO * p) / 100));
  const per = { semana: "a la semana", quincena: "a la quincena", mes: "al mes" }[periodo] ?? "";
  const conPeriodo = tipo === "renta" || tipo === "sueldo" || tipo === "mixto";
  // Mientras no se elija otra, la frecuencia sigue al periodo del sueldo o la renta.
  const frecuencia = !tocada && conPeriodo ? periodo : frec;
  return (
    <div className="pila-chica">
      <input type="hidden" name="pagoTipo" value={tipo} />
      <input type="hidden" name="pagoPeriodo" value={periodo} />
      <div className="radios" role="radiogroup" aria-label="Cómo se le paga">
        {TIPOS.filter((x) => conRenta || x.t !== "renta" || actual?.tipo === "renta").map((x) => (
          <label key={x.t} className="radio-f">
            <input type="radio" name="_pagoTipo" checked={tipo === x.t} onChange={() => setTipo(x.t)} />
            <span><b>{x.titulo}</b><small>{x.detalle}</small></span>
          </label>
        ))}
      </div>
      <div className="caja-campos">
        {conPeriodo && (
          <div className="campo">
            <span>{tipo === "renta" ? "Renta" : "Sueldo base"}</span>
            <div className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input className="input" name="pagoSemanal" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" style={{ flex: 1 }} />
              <div className="seg chico" role="radiogroup" aria-label="Periodo">
                {PERIODOS.map(([k, t]) => <button type="button" key={k} className={periodo === k ? "on" : ""} onClick={() => setPeriodo(k)}>{t}</button>)}
              </div>
            </div>
          </div>
        )}
        {(tipo === "porcentaje" || tipo === "mixto") && (
          <label className="campo">
            <span>{tipo === "mixto" ? "Porcentaje adicional" : "Porcentaje por servicio"}</span>
            <span className="otra ancho" style={{ background: "#fff" }}><input name="pagoPorcentaje" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /><span>%</span></span>
          </label>
        )}
        {tipo === "fijo" && (
          <label className="campo"><span>Pago por servicio</span><input className="input" name="pagoFijo" inputMode="decimal" value={fijo} onChange={(e) => setFijo(e.target.value)} placeholder="$0" /></label>
        )}
        <div className="campo">
          <span>{tipo === "renta" ? "Cada cuánto paga la renta" : "Cada cuánto se le paga"}</span>
          <input type="hidden" name="pagoFrecuencia" value={frecuencia} />
          <div className="frec-p" role="radiogroup" aria-label="Periodicidad">
            {FRECUENCIAS.map(([k, t]) => <button type="button" key={k} role="radio" aria-checked={frecuencia === k} className={frecuencia === k ? "on" : ""} onClick={() => { setFrec(k); setTocada(true); }}>{t}</button>)}
          </div>
        </div>
        <div className="dos-p">
          {frecuencia === "semana" && (
            <label className="campo"><span>Día de corte</span>
              <select className="input" name="pagoCorte" defaultValue={String(actual?.diaCorte ?? 0)}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
            </label>
          )}
          <label className="campo"><span>Día de pago</span>
            <select className="input" name="pagoDia" defaultValue={String(actual?.diaPago ?? (frecuencia === "semana" ? 1 : 0))}>
              <option value="0">{frecuencia === "servicio" ? "Al terminar el servicio" : "El día del corte"}</option>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? "Un día después" : `${n} días después`}</option>)}
            </select>
          </label>
        </div>
        <label className="campo"><span>Forma de pago habitual</span>
          <select className="input" name="pagoForma" defaultValue={actual?.formaPago ?? "efectivo"}>
            <option value="efectivo">Efectivo de caja</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option>
          </select>
        </label>
        {actual && (
          <label className="campo vig-p"><span>Vigente desde</span>
            <input className="input" type="date" name="pagoVigente" min={hoyLocal()} defaultValue={hoyLocal()} />
            <small>Las nuevas condiciones aplican desde esa fecha. Los pagos y saldos anteriores no cambian.</small>
          </label>
        )}
        <p className="ejemplo">
          {tipo === "porcentaje" && <>Con un servicio de {formatoDinero(EJEMPLO)}, le corresponden <b>{comision}</b>.</>}
          {tipo === "fijo" && <>Por cada servicio le corresponden <b>{formatoDinero(leerPesos(fijo) ?? 0)}</b>, sin importar el precio.</>}
          {tipo === "renta" && <>Lo que cobre es suyo. Paga <b>{formatoDinero(leerPesos(monto) ?? 0)} {per}</b> por usar la silla.</>}
          {tipo === "sueldo" && <>Recibe <b>{formatoDinero(leerPesos(monto) ?? 0)} {per}</b>, haga los servicios que haga.</>}
          {tipo === "mixto" && <>Recibe <b>{formatoDinero(leerPesos(monto) ?? 0)} {per}</b>, y además <b>{comision}</b> por cada servicio de {formatoDinero(EJEMPLO)}.</>}
        </p>
      </div>
    </div>
  );
}
