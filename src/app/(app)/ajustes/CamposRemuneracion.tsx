"use client";

import { useState } from "react";
import { formatoDinero, leerPesos } from "@/lib/money";
import { MODALIDADES, type Modalidad, type Remuneracion } from "@/lib/remuneracion";

const PERIODOS: [string, string][] = [["semana", "Semanal"], ["quincena", "Quincenal"], ["mes", "Mensual"]];
const EJEMPLO = 15000;

/**
 * Remuneración de quien no es barbero. Por defecto, sin remuneración registrada: elegir un puesto no asigna nada.
 * Solo se muestran los campos de la modalidad elegida. No crea pagos ni egresos.
 */
export function CamposRemuneracion({ actual, conNinguna = true }: { actual: Remuneracion | null; conNinguna?: boolean }) {
  const [m, setM] = useState<Modalidad | "ninguna">(actual?.modalidad ?? (conNinguna ? "ninguna" : "sueldo"));
  const [monto, setMonto] = useState(actual?.monto ? String(actual.monto / 100) : "");
  const [periodo, setPeriodo] = useState(actual?.periodo ?? "quincena");
  const [pct, setPct] = useState(actual?.porcentaje ? String(actual.porcentaje / 100) : "");
  const [horas, setHoras] = useState(actual?.horasSemana ? String(actual.horasSemana) : "");
  const [desc, setDesc] = useState(actual?.descripcion ?? "");
  const $ = (t: string) => formatoDinero(leerPesos(t) ?? 0);
  const per = { semana: "a la semana", quincena: "a la quincena", mes: "al mes" }[periodo] ?? "";
  const comision = formatoDinero(Math.round((EJEMPLO * (Number(pct) || 0)) / 100));
  const etiquetaMonto = { sueldo: "Sueldo", mixto: "Sueldo base", hora: "Pago por hora", dia: "Pago por día", trabajo: "Pago por cada uno" } as Record<string, string>;
  return (
    <div className="pila-chica">
      <input type="hidden" name="remModalidad" value={m} />
      <input type="hidden" name="remPeriodo" value={periodo} />
      <div className="radios dos" role="radiogroup" aria-label="Modalidad de remuneración">
        {MODALIDADES.map((x) => (
          <label key={x.m} className="radio-f">
            <input type="radio" name="_remModalidad" checked={m === x.m} onChange={() => setM(x.m)} />
            <span><b>{x.titulo}</b><small>{x.detalle}</small></span>
          </label>
        ))}
        {conNinguna && (
          <label className="radio-f ancha">
            <input type="radio" name="_remModalidad" checked={m === "ninguna"} onChange={() => setM("ninguna")} />
            <span><b>Sin remuneración registrada</b><small>Se da de alta sin esquema de pago. Se puede agregar después.</small></span>
          </label>
        )}
      </div>
      {m !== "ninguna" && (
        <div className="caja-campos">
          <div className="fila" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {m !== "comision" && (
              <label className="campo" style={{ flex: 1, minWidth: 140 }}><span>{etiquetaMonto[m]}</span>
                <input className="input" name="remMonto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0" /></label>
            )}
            {(m === "sueldo" || m === "mixto") && (
              <div className="seg chico" role="radiogroup" aria-label="Periodo">
                {PERIODOS.map(([k, t]) => <button type="button" key={k} className={periodo === k ? "on" : ""} onClick={() => setPeriodo(k)}>{t}</button>)}
              </div>
            )}
            {(m === "comision" || m === "mixto") && (
              <label className="campo" style={{ flex: 1, minWidth: 140 }}><span>{m === "mixto" ? "Porcentaje adicional" : "Porcentaje"}</span>
                <span className="otra ancho" style={{ background: "#fff" }}><input name="remPorcentaje" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0" /><span>%</span></span></label>
            )}
            {m === "hora" && (
              <label className="campo" style={{ flex: 1, minWidth: 140 }}><span>Horas a la semana (opcional)</span>
                <input className="input" name="remHoras" inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ejemplo: 40" /></label>
            )}
            {m === "trabajo" && (
              <label className="campo" style={{ flex: 1, minWidth: 160 }}><span>Qué trabajo</span>
                <input className="input" name="remDescripcion" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ejemplo: limpieza del local" maxLength={80} /></label>
            )}
          </div>
          <p className="ejemplo">
            {m === "sueldo" && <>Recibe <b>{$(monto)} {per}</b>, trabaje las horas que trabaje.</>}
            {m === "hora" && <>Por una jornada de 8 horas le corresponden <b>{formatoDinero((leerPesos(monto) ?? 0) * 8)}</b>.</>}
            {m === "dia" && <>Por cada día trabajado le corresponden <b>{$(monto)}</b>.</>}
            {m === "comision" && <>Por un servicio suyo de {formatoDinero(EJEMPLO)} le corresponden <b>{comision}</b>. Solo cuentan los servicios que realiza esta persona.</>}
            {m === "mixto" && <>Recibe <b>{$(monto)} {per}</b>, y además <b>{comision}</b> por cada servicio suyo de {formatoDinero(EJEMPLO)}.</>}
            {m === "trabajo" && <>Por cada {desc ? desc.toLowerCase() : "trabajo realizado"} le corresponden <b>{$(monto)}</b>.</>}
          </p>
        </div>
      )}
      {m === "ninguna" && <p className="ejemplo">Se da de alta sin remuneración. Puedes registrarla después desde su ficha.</p>}
      <p className="ayuda-txt">No se crean pagos ni egresos automáticamente. Es solo para llevar el control.</p>
    </div>
  );
}
