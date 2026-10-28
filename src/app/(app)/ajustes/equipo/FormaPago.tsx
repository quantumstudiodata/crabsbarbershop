"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { guardarRegla } from "./actions";

type Tipo = "porcentaje" | "fijo" | "renta" | "sueldo" | "mixto";
const TIPOS: { t: Tipo; titulo: string; detalle: string }[] = [
  { t: "porcentaje", titulo: "Porcentaje", detalle: "Una parte de cada servicio" },
  { t: "fijo", titulo: "Monto fijo", detalle: "Una cantidad por cada servicio" },
  { t: "renta", titulo: "Renta de silla", detalle: "Cobra para sí y paga renta" },
  { t: "sueldo", titulo: "Sueldo fijo", detalle: "Lo mismo cada semana" },
  { t: "mixto", titulo: "Sueldo más porcentaje", detalle: "Un sueldo y una parte de cada servicio" },
];
const EJEMPLO = 15000; // Un corte de $150 para los ejemplos.

export function FormaPago({ id, nombre, actual }: { id: string; nombre: string; actual: { tipo: Tipo; porcentaje: number; montoFijo: number; montoSemanal: number } | null }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>(actual?.tipo ?? "porcentaje");
  const [pct, setPct] = useState(actual?.porcentaje ? String(actual.porcentaje / 100) : "");
  const [fijo, setFijo] = useState(actual?.montoFijo ? String(actual.montoFijo / 100) : "");
  const [semanal, setSemanal] = useState(actual?.montoSemanal ? String(actual.montoSemanal / 100) : "");
  const p = Number(pct) || 0, f = leerPesos(fijo) ?? 0, sem = leerPesos(semanal) ?? 0;
  const primero = nombre.split(" ")[0];
  const ejemplo = {
    porcentaje: `Si cobra un corte de ${formatoDinero(EJEMPLO)}, a ${primero} le tocan ${formatoDinero(Math.round((EJEMPLO * p) / 100))}.`,
    fijo: `Por cada servicio le tocan ${formatoDinero(f)}, sin importar el precio.`,
    renta: `Lo que cobre es suyo. Cada semana paga ${formatoDinero(sem)} por usar la silla.`,
    sueldo: `Recibe ${formatoDinero(sem)} cada semana, haga los servicios que haga.`,
    mixto: `Recibe ${formatoDinero(sem)} a la semana, y además ${formatoDinero(Math.round((EJEMPLO * p) / 100))} por cada corte de ${formatoDinero(EJEMPLO)}.`,
  }[tipo];

  return (
    <>
      <button type="button" className="icb" onClick={() => setAbierto(true)} aria-label={`Cambiar la forma de pago de ${nombre}`} title="Cambiar"><Icono n="editar" /></button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={nombre} titulo="Forma de pago" ancho>
        <form action={guardarRegla} className="pila">
          <input type="hidden" name="barberoId" value={id} />
          <div className="opciones-t" role="radiogroup" aria-label="Forma de pago">
            {TIPOS.map((x) => (
              <label key={x.t} className="opcion-t"><input type="radio" name="tipo" value={x.t} checked={tipo === x.t} onChange={() => setTipo(x.t)} /><b>{x.titulo}</b><small>{x.detalle}</small></label>
            ))}
          </div>
          <div className="caja-campos">
            {(tipo === "porcentaje" || tipo === "mixto") && (
              <label className="campo"><span>Porcentaje de cada servicio</span><input className="input" name="porcentaje" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ejemplo: 40" required /></label>
            )}
            {tipo === "fijo" && (
              <label className="campo"><span>Monto por servicio</span><input className="input" name="montoFijo" inputMode="decimal" value={fijo} onChange={(e) => setFijo(e.target.value)} placeholder="Ejemplo: 60" required /></label>
            )}
            {(tipo === "renta" || tipo === "sueldo" || tipo === "mixto") && (
              <label className="campo"><span>{tipo === "renta" ? "Renta por semana" : "Sueldo por semana"}</span><input className="input" name="montoSemanal" inputMode="decimal" value={semanal} onChange={(e) => setSemanal(e.target.value)} placeholder="Ejemplo: 1500" required /></label>
            )}
            <p className="ejemplo">{ejemplo}</p>
          </div>
          <p className="ayuda-txt">Aplica desde hoy. Lo que ya se cobró conserva la forma de pago con la que se cobró.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAbierto(false)}>Regresar</button>
            <button className="bt">Guardar<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
