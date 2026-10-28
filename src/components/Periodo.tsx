import Link from "next/link";
import type { Periodo } from "@/lib/periodo";
import { Calendario } from "./Calendario";

/** Semana, mes o fechas a elegir. */
export function SelectorPeriodo({ ruta, p, hoy, conDia, extra = "" }: { ruta: string; p: Periodo; hoy: string; conDia?: boolean; extra?: string }) {
  const op: [string, string][] = [...(conDia ? ([["dia", "Hoy"]] as [string, string][]) : []), ["semana", "Semana"], ["mes", "Mes"]];
  const fin = p.hasta > hoy ? hoy : p.hasta;
  return (
    <div className="fila">
      <nav className="seg" aria-label="Periodo">
        {op.map(([k, t]) => <Link key={k} href={`${ruta}?periodo=${k}${extra}`} aria-current={p.tipo === k ? "page" : undefined}>{t}</Link>)}
      </nav>
      <Calendario desde={p.desde > hoy ? hoy : p.desde} hasta={fin} hoy={hoy} />
    </div>
  );
}
