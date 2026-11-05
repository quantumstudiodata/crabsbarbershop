"use client";

import { useState, useTransition } from "react";
import { cambiarModeloCaja } from "./actions";

/** Caja compartida o una caja por trabajador. */
export function ModeloCaja({ actual }: { actual: string }) {
  const [valor, setValor] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const elegir = (v: string) => iniciar(async () => {
    const r = await cambiarModeloCaja(v);
    setError(r.error ?? null);
    if (!r.error) setValor(v);
  });
  const opciones: [string, string, string][] = [
    ["compartida", "Caja compartida", "Una sola caja para todo el equipo. Quien esté en turno abre y hace el corte."],
    ["individual", "Caja individual por trabajador", "Cada trabajador abre su caja, cobra en ella y hace su propio corte."],
  ];
  return (
    <div className="ajuste">
      <span><b>Modelo de caja</b><small>Cómo se administra el efectivo del negocio.</small></span>
      <div className="modelos-c" role="radiogroup" aria-label="Modelo de caja">
        {opciones.map(([k, t, d]) => (
          <button key={k} type="button" role="radio" aria-checked={valor === k} className={`opcion-mc ${valor === k ? "on" : ""}`} disabled={pendiente} onClick={() => elegir(k)}>
            <b>{t}</b><small>{d}</small>
          </button>
        ))}
      </div>
      {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}

