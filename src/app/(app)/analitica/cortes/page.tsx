import { redirect } from "next/navigation";

/** Los cortes de caja viven en Movimientos: cada uno se abre ahí mismo, a un lado. Esta dirección solo lleva allá (enlaces viejos o guardados). */
export default async function Cortes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
  if (!p.get("tipo")) p.set("tipo", "cortes");
  redirect(`/analitica/finanzas?${p}`);
}
