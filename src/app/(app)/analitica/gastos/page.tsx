import { redirect } from "next/navigation";

/** Los egresos viven ahora en Finanzas. */
export default async function Gastos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const n = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
  n.set("tipo", "egresos");
  redirect(`/analitica/finanzas?${n}`);
}
