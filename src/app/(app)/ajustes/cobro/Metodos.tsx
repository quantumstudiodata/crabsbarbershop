"use client";

import { useOptimistic, useTransition } from "react";
import { Interruptor } from "@/components/ui";
import { alternarMetodo } from "./actions";

export function Metodos({ metodos }: { metodos: { id: string; nombre: string; esEfectivo: boolean; activo: boolean }[] }) {
  const [lista, cambiar] = useOptimistic(metodos, (xs, id: string) => xs.map((m) => (m.id === id ? { ...m, activo: !m.activo } : m)));
  const [, iniciar] = useTransition();
  return (
    <div className="permisos">
      {lista.map((m) => (
        <div key={m.id}>
          <span><b style={{ fontWeight: 600 }}>{m.nombre}</b><small>{m.esEfectivo ? "Es lo que se cuenta al cerrar la caja." : m.activo ? "Aparece en Cobro." : "No aparece en Cobro. Sus ventas pasadas se conservan."}</small></span>
          {m.esEfectivo
            ? <span className="etiqueta">Obligatorio</span>
            : <Interruptor etiqueta={`${m.nombre} activo`} checked={m.activo} onChange={() => iniciar(async () => { cambiar(m.id); await alternarMetodo(m.id); })} />}
        </div>
      ))}
    </div>
  );
}
