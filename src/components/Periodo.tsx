"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Periodo } from "@/lib/periodo";
import { Calendario, MenuAnio, MenuMes } from "./Calendario";

const CLAVES = ["periodo", "fecha", "mes", "anio", "desde", "hasta", "pagina"];

/**
 * En este orden: calendario de un día, lo que vaya en medio (por ejemplo el equipo) y botones pequeños Hoy, Mes y Año.
 * Mes y Año abren su menú por debajo. Conserva los demás filtros de la dirección.
 * Con sinPeriodo, no elegir nada significa todo el historial.
 */
export function SelectorPeriodo({ p, hoy, conAnio = true, sinPeriodo, medio }: {
  p: Periodo | null; hoy: string; conAnio?: boolean; ruta?: string; conDia?: boolean; extra?: string; sinPeriodo?: string; medio?: React.ReactNode;
}) {
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
      <Calendario key={p?.desde ?? "-"} fecha={tipo === "dia" && p ? p.desde : hoy} activo={tipo === "dia" && !esHoy} hoy={hoy}
        elegir={(f) => ir(f === hoy ? { periodo: "dia" } : { periodo: "dia", fecha: f })} />
      {medio}
      <div className="botones-p" role="group" aria-label="Periodo">
        <button type="button" className={`bp ${esHoy ? "on" : ""}`} onClick={() => (esHoy && sinPeriodo ? ir(null) : ir({ periodo: "dia" }))}>Hoy</button>
        <MenuMes key={`m${p?.desde ?? ""}`} mes={tipo === "mes" && p ? p.desde.slice(0, 7) : hoy.slice(0, 7)} activo={tipo === "mes"} hoy={hoy} elegir={(m) => ir({ periodo: "mes", mes: m })} />
        {conAnio && <MenuAnio anio={tipo === "anio" && p ? p.desde.slice(0, 4) : hoy.slice(0, 4)} activo={tipo === "anio"} hoy={hoy} elegir={(y) => ir({ periodo: "anio", anio: y })} />}
      </div>
    </div>
  );
}
