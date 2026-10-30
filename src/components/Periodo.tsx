"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Periodo } from "@/lib/periodo";
import { Calendario, ElegirAnio, ElegirMes } from "./Calendario";

const CLAVES = ["periodo", "fecha", "mes", "anio", "desde", "hasta", "pagina"];

/** Hoy, Mes o Año, más un calendario para elegir un día. Conserva los demás filtros de la dirección. */
export function SelectorPeriodo({ p, hoy, conAnio = true, sinPeriodo }: { p: Periodo | null; hoy: string; conAnio?: boolean; ruta?: string; conDia?: boolean; extra?: string; sinPeriodo?: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const ir = (q: Record<string, string> | null) => {
    const n = new URLSearchParams(params.toString());
    CLAVES.forEach((k) => n.delete(k));
    if (q) for (const [k, v] of Object.entries(q)) n.set(k, v);
    const s = n.toString();
    router.push(s ? `${ruta}?${s}` : ruta);
  };
  const tipo = p?.tipo ?? "";
  const esHoy = tipo === "dia" && p?.desde === hoy;
  return (
    <div className="fila selector-p">
      <nav className="seg" aria-label="Periodo">
        {sinPeriodo && <button type="button" aria-current={!p ? "page" : undefined} onClick={() => ir(null)}>{sinPeriodo}</button>}
        <button type="button" aria-current={esHoy ? "page" : undefined} onClick={() => ir({ periodo: "dia" })}>Hoy</button>
        <button type="button" aria-current={tipo === "mes" ? "page" : undefined} onClick={() => ir({ periodo: "mes", mes: p?.tipo === "mes" ? p.desde.slice(0, 7) : hoy.slice(0, 7) })}>Mes</button>
        {conAnio && <button type="button" aria-current={tipo === "anio" ? "page" : undefined} onClick={() => ir({ periodo: "anio", anio: (p?.desde ?? hoy).slice(0, 4) })}>Año</button>}
      </nav>
      {tipo === "mes" && p && <ElegirMes key={p.desde} mes={p.desde.slice(0, 7)} hoy={hoy} elegir={(m) => ir({ periodo: "mes", mes: m })} />}
      {tipo === "anio" && p && <ElegirAnio anio={p.desde.slice(0, 4)} hoy={hoy} elegir={(y) => ir({ periodo: "anio", anio: y })} />}
      <Calendario key={p?.desde ?? "-"} fecha={tipo === "dia" && p ? p.desde : hoy} activo={tipo === "dia" && !esHoy} hoy={hoy} elegir={(f) => ir(f === hoy ? { periodo: "dia" } : { periodo: "dia", fecha: f })} />
    </div>
  );
}
