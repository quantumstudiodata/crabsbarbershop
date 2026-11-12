"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "@/components/Icono";
import { cambiarEstadoCita } from "./citas/actions";
import type { Pendiente } from "./pendientes";

const ICONO = { llegar: "reloj", cobrar: "efectivo", pago: "palomita" } as const;

/** Pendientes por registrar en Inicio: máximo tres a la vista, el resto en la agenda. Solo aparece si hay algo. */
export function Pendientes({ items, className = "" }: { items: Pendiente[]; className?: string }) {
  const [hechos, setHechos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const router = useRouter();
  const xs = items.filter((x) => !hechos.includes(x.id));
  if (!xs.length) return null;
  // Si no llegó, se marca y se le escribe por WhatsApp con su enlace para elegir otro día.
  const noVino = (x: Pendiente) => {
    const d = (x.tel ?? "").replace(/\D/g, "");
    const url = x.enlace ? `${window.location.origin}${x.enlace}` : "";
    const msg = `Te esperábamos a las ${x.hora} y no pudimos verte. Elige otro día y hora para tu cita aquí: ${url}`;
    if (d) window.open(`https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(msg)}`, "_blank");
    estado(x, "no_asistio");
  };
  const llego = (x: Pendiente) => estado(x, "llego");
  const estado = (x: Pendiente, e: string) => iniciar(async () => {
    const r = await cambiarEstadoCita(x.citaId, e);
    if (r.error) setError(r.error); else { setError(null); setHechos((h) => [...h, x.id]); router.refresh(); }
  });
  return (
    <section className={`glass pnd ${className}`}>
      <div className="entre"><span className="lab">Pendientes por registrar</span><span className="pnd-n">{xs.length}</span></div>
      <div className="pnd-l">
        {xs.slice(0, 3).map((x) => (
          <div key={x.id} className="pnd-f">
            <span className={`pnd-i ${x.tipo === "cobrar" ? "osc" : ""}`} aria-hidden="true"><Icono n={ICONO[x.tipo]} /></span>
            <span className="pnd-t"><b>{x.titulo}</b><small>{x.detalle}</small></span>
            {x.tipo === "llegar" ? <span className="pnd-dos"><button type="button" className="pnd-b sec" disabled={pend} onClick={() => noVino(x)}>No vino</button><button type="button" className="pnd-b" disabled={pend} onClick={() => llego(x)}>Llegó</button></span>
              : x.tipo === "cobrar" ? <Link className="pnd-b" href={`/cobrar?cita=${x.citaId}`}>Cobrar</Link>
              : <Link className="pnd-b sec" href={`/citas?vista=lista&dia=${x.dia}`}>Ver</Link>}
          </div>
        ))}
      </div>
      {error && <small className="aviso error" role="alert">{error}</small>}
      {xs.length > 3 && <Link className="ini-link" href="/citas?vista=lista">Ver todos ({xs.length})</Link>}
    </section>
  );
}
