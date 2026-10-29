"use client";

import { useState } from "react";
import { Fl } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { guardarReglas } from "./actions";

/** Un ajuste con botones rápidos, control deslizante y una vista previa de lo que significa. */
function Ajuste({ name, titulo, ayuda, inicial, opciones, max, paso, formato, vista }: {
  name: string; titulo: string; ayuda: string; inicial: number; opciones: number[]; max: number; paso: number;
  formato: (v: number) => string; vista: (v: number) => React.ReactNode;
}) {
  const [v, setV] = useState(inicial);
  return (
    <div className="ajuste">
      <input type="hidden" name={name} value={v} />
      <div className="entre" style={{ alignItems: "flex-start" }}>
        <span><b>{titulo}</b><small>{ayuda}</small></span>
        <span className="valor-a" key={v}>{formato(v)}</span>
      </div>
      <input type="range" min={0} max={max} step={paso} value={Math.min(v, max)} onChange={(e) => setV(Number(e.target.value))} aria-label={titulo}
        style={{ "--p": `${(Math.min(v, max) / max) * 100}%` } as React.CSSProperties} />
      <div className="billetes">
        {opciones.map((o) => <button type="button" key={o} className={v === o ? "on" : ""} onClick={() => setV(o)}>{formato(o)}</button>)}
      </div>
      <p className="vista-a">{vista(v)}</p>
    </div>
  );
}

export function ReglasCobro({ descuento, autorizan }: { descuento: number; autorizan: string }) {
  return (
    <form action={guardarReglas} className="glass panel bloque-a">
      <span className="lab">2. Reglas de cobro</span>
      <Ajuste name="descuento" titulo="Descuento sin autorización" ayuda="Hasta cuánto puede descontar un barbero por su cuenta."
        inicial={descuento} opciones={[0, 10, 15, 20, 30]} max={50} paso={5} formato={(v) => `${v}%`}
        vista={(v) => v === 0 ? <>Ningún barbero puede dar descuentos sin autorización.</> : <>En un corte de $150, un barbero puede descontar hasta <b>{formatoDinero(Math.round(15000 * v / 100))}</b>. Más que eso lo autoriza: {autorizan}.</>} />
      <div className="acciones"><button className="bt">Guardar<Fl /></button></div>
    </form>
  );
}

export function CajaObjetivos({ fondo, diferencia, meta }: { fondo: number; diferencia: number; meta: number }) {
  return (
    <form action={guardarReglas} className="glass panel bloque-a">
      <span className="lab">3. Caja y objetivos</span>
      <Ajuste name="fondo" titulo="Fondo inicial sugerido" ayuda="El efectivo que aparece listo al abrir la caja."
        inicial={fondo} opciones={[0, 100, 200, 500]} max={2000} paso={50} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>Al abrir la caja aparecerá <b>{formatoDinero(v * 100)}</b>; se puede cambiar en el momento.</> : <>Al abrir la caja se escribe el fondo cada vez.</>} />
      <Ajuste name="diferencia" titulo="Diferencia permitida al cerrar" ayuda="Si al contar falta o sobra más, se pide explicar qué pasó."
        inicial={diferencia} opciones={[0, 20, 50, 100]} max={500} paso={10} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>Faltar o sobrar hasta <b>{formatoDinero(v * 100)}</b> no pide explicación.</> : <>Cualquier diferencia pide explicación.</>} />
      <Ajuste name="meta" titulo="Meta de ventas por día" ayuda="Se muestra en Inicio con su barra de avance."
        inicial={meta} opciones={[0, 2000, 4000, 6000]} max={20000} paso={500} formato={(v) => (v ? formatoDinero(v * 100) : "Automática")}
        vista={(v) => v ? <>La meta de cada día será <b>{formatoDinero(v * 100)}</b>.</> : <>Se calcula sola con las ventas; al principio es de $4,000.</>} />
      <div className="acciones"><button className="bt">Guardar<Fl /></button></div>
    </form>
  );
}
