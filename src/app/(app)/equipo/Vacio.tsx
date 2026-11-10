import { Icono } from "@/components/Icono";

/** Tarjeta blanca para cuando todavía no hay datos: dice qué falta y cuándo aparecerá. */
export function Vacio({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return (
    <div className="eq2-vacia">
      <span><Icono n={icono} /></span>
      <span><b>{titulo}</b><small>{texto}</small></span>
    </div>
  );
}
