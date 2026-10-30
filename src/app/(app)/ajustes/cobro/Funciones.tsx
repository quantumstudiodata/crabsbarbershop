"use client";

import { useOptimistic, useTransition } from "react";
import { Interruptor } from "@/components/ui";
import { alternarFuncion } from "./actions";

export type Funcion = { clave: string; nombre: string; encendida: string; apagada: string; activa: boolean };

/** Funciones que cada barbería decide si usa. Apagar una solo la esconde: lo registrado antes se conserva. */
export function Funciones({ funciones, alCambiar }: { funciones: Funcion[]; alCambiar?: (clave: string, activa: boolean) => void }) {
  const [lista, cambiar] = useOptimistic(funciones, (xs, clave: string) => xs.map((f) => (f.clave === clave ? { ...f, activa: !f.activa } : f)));
  const [, iniciar] = useTransition();
  return (
    <div className="permisos">
      {lista.map((f) => (
        <div key={f.clave}>
          <span><b style={{ fontWeight: 600 }}>{f.nombre}</b><small>{f.activa ? f.encendida : f.apagada}</small></span>
          <Interruptor etiqueta={f.nombre} checked={f.activa} onChange={() => { alCambiar?.(f.clave, !f.activa); iniciar(async () => { cambiar(f.clave); await alternarFuncion(f.clave); }); }} />
        </div>
      ))}
    </div>
  );
}
