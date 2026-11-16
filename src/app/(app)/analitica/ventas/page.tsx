import { redirect } from "next/navigation";

/** Ventas vive ahora dentro de Movimientos, junto con los cortes y el resto del dinero. Se conservan los filtros. */
export default async function Ventas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const n = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "cortes") as [string, string][]);
  if (!n.has("tipo")) n.set("tipo", "ventas");
  redirect(`/analitica/finanzas?${n}`);
}
