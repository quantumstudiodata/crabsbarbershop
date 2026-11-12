"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "./Icono";
import { useVivo } from "./useVivo";

const CLAVE = "crabs-pagos-vistos";
const leer = (): string[] => { try { return JSON.parse(localStorage.getItem(CLAVE) ?? "[]"); } catch { return []; } };
const guardar = (xs: string[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(xs.slice(-100))); } catch {} };

/**
 * Aviso fuerte arriba cuando un cliente paga su cita en línea. Sale una vez por pago y se cierra con la X o con Ver.
 * En Inicio no sale: ahí ya aparece en Pendientes por registrar.
 */
export function AvisoPagoLinea() {
  const { pagos } = useVivo();
  const ruta = usePathname();
  const [vistos, setVistos] = useState<string[] | null>(null);
  useEffect(() => setVistos(leer()), []);
  if (!vistos || ruta === "/") return null;
  const p = pagos.find((x) => !vistos.includes(x.id));
  if (!p) return null;
  const visto = () => { const xs = [...vistos, p.id]; guardar(xs); setVistos(xs); };
  return (
    <div className="apl" role="status">
      <span className="apl-i" aria-hidden="true"><Icono n="palomita" /></span>
      <span className="apl-t"><b>{p.titulo}</b><small>{p.detalle}</small></span>
      <Link className="apl-v" href={p.href} onClick={visto}>Ver</Link>
      <button type="button" className="apl-x" onClick={visto} aria-label="Cerrar aviso"><Icono n="cerrar" /></button>
    </div>
  );
}
