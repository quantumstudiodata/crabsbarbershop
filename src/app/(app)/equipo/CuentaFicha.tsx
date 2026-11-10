"use client";

import { useState } from "react";

export type VistaCuenta = { clave: string; titulo: string; pendiente: string; nota: string; renglones: [string, string][] };

/** Teléfono: la cuenta de la persona en una sola tarjeta; se cambia entre el mes y el periodo de pago en curso. */
export function CuentaFicha({ vistas, etiqueta, children }: { vistas: VistaCuenta[]; etiqueta: string; children?: React.ReactNode }) {
  const [sel, setSel] = useState(vistas[vistas.length > 1 ? 1 : 0].clave);
  const v = vistas.find((x) => x.clave === sel) ?? vistas[0];
  return (
    <section className="glass fa-cuenta">
      {vistas.length > 1 && (
        <div className="fa-seg" role="tablist" aria-label="Ver la cuenta de">
          {vistas.map((x) => <button type="button" key={x.clave} role="tab" aria-selected={x.clave === sel} className={x.clave === sel ? "on" : ""} onClick={() => setSel(x.clave)}>{x.titulo}</button>)}
        </div>
      )}
      <span className="fa-pend"><small>{etiqueta}</small><b>{v.pendiente}</b><em>{v.nota}</em></span>
      <dl className="fa-ren">{v.renglones.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
      {children}
    </section>
  );
}
