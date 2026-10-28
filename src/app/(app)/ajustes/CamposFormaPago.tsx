"use client";

import { useState } from "react";
import { formatoDinero, leerPesos } from "@/lib/money";

export type TipoPago = "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto";
export type FormaActual = { tipo: TipoPago; porcentaje: number; montoFijo: number; montoSemanal: number } | null;

const TIPOS: { t: TipoPago; titulo: string; detalle: string }[] = [
  { t: "porcentaje", titulo: "Porcentaje", detalle: "Una parte de cada servicio" },
  { t: "fijo", titulo: "Monto fijo", detalle: "Una cantidad por servicio" },
  { t: "renta", titulo: "Renta de silla", detalle: "Cobra para sí y paga renta" },
  { t: "sueldo", titulo: "Sueldo fijo", detalle: "Lo mismo cada semana" },
  { t: "mixto", titulo: "Sueldo más porcentaje", detalle: "Sueldo y una parte de cada servicio" },
];
const EJEMPLO = 15000;

/** Campos de la forma de pago, para usarse dentro del alta o la edición de un usuario. */
export function CamposFormaPago({ actual, nombre }: { actual: FormaActual; nombre: string }) {
  const [tipo, setTipo] = useState<TipoPago>(actual?.tipo ?? "porcentaje");
  const [pct, setPct] = useState(actual?.porcentaje ? String(actual.porcentaje / 100) : "");
  const [fijo, setFijo] = useState(actual?.montoFijo ? String(actual.montoFijo / 100) : "");
  const [semanal, setSemanal] = useState(actual?.montoSemanal ? String(actual.montoSemanal / 100) : "");
  const p = Number(pct) || 0, f = leerPesos(fijo) ?? 0, sem = leerPesos(semanal) ?? 0;
  const quien = nombre.split(" ")[0] || "esta persona";
  const ejemplo = {
    porcentaje: `Si cobra un corte de ${formatoDinero(EJEMPLO)}, a ${quien} le tocan ${formatoDinero(Math.round((EJEMPLO * p) / 100))}.`,
    fijo: `Por cada servicio le tocan ${formatoDinero(f)}, sin importar el precio.`,
    renta: `Lo que cobre es suyo. Cada semana paga ${formatoDinero(sem)} por usar la silla.`,
    sueldo: `Recibe ${formatoDinero(sem)} cada semana, haga los servicios que haga.`,
    mixto: `Recibe ${formatoDinero(sem)} a la semana, y además ${formatoDinero(Math.round((EJEMPLO * p) / 100))} por cada corte de ${formatoDinero(EJEMPLO)}.`,
  }[tipo];
  return (
    <div className="pila-chica">
      <input type="hidden" name="pagoTipo" value={tipo} />
      <div className="opciones-t chicas" role="radiogroup" aria-label="Forma de pago">
        {TIPOS.map((x) => (
          <label key={x.t} className="opcion-t"><input type="radio" name="_pagoTipo" checked={tipo === x.t} onChange={() => setTipo(x.t)} /><b>{x.titulo}</b><small>{x.detalle}</small></label>
        ))}
      </div>
      <div className="caja-campos">
        <div className="fila">
          {(tipo === "porcentaje" || tipo === "mixto") && <label className="campo" style={{ flex: "1 1 120px" }}><span>Porcentaje</span><input className="input" name="pagoPorcentaje" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ejemplo: 40" /></label>}
          {tipo === "fijo" && <label className="campo" style={{ flex: "1 1 120px" }}><span>Por servicio</span><input className="input" name="pagoFijo" inputMode="decimal" value={fijo} onChange={(e) => setFijo(e.target.value)} placeholder="Ejemplo: 60" /></label>}
          {(tipo === "renta" || tipo === "sueldo" || tipo === "mixto") && <label className="campo" style={{ flex: "1 1 120px" }}><span>{tipo === "renta" ? "Renta por semana" : "Sueldo por semana"}</span><input className="input" name="pagoSemanal" inputMode="decimal" value={semanal} onChange={(e) => setSemanal(e.target.value)} placeholder="Ejemplo: 1500" /></label>}
        </div>
        <p className="ejemplo">{ejemplo}</p>
      </div>
    </div>
  );
}
