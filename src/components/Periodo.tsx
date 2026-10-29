import Link from "next/link";
import type { Periodo } from "@/lib/periodo";
import { Calendario } from "./Calendario";

/** Semana, mes o fechas a elegir. */
export function SelectorPeriodo({ ruta, p, hoy, conDia, conAnio, extra = "" }: { ruta: string; p: Periodo; hoy: string; conDia?: boolean; conAnio?: boolean; extra?: string }) {
  const op: [string, string][] = [...(conDia ? ([["dia", "Hoy"]] as [string, string][]) : []), ["semana", "Semana"], ["mes", "Mes"], ...(conAnio ? ([["anio", "Año"]] as [string, string][]) : [])];
  return (
    <div className="fila">
      <nav className="seg" aria-label="Periodo">
        {op.map(([k, t]) => <Link key={k} href={`${ruta}?periodo=${k}${extra}`} aria-current={p.tipo === k ? "page" : undefined}>{t}</Link>)}
      </nav>
      <Calendario desde={p.desde} hasta={p.hasta} hoy={hoy} />
    </div>
  );
}
