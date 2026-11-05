import { requerirSesion } from "@/lib/auth";
import { Pestanas } from "./Pestanas";

export default async function LayoutAnalitica({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const items: [string, string][] = [];
  if (s.puede("reportes.ver")) items.push(["/analitica", "Resumen"]);
  if (s.puede("ventas.ver_todas")) items.push(["/analitica/ventas", "Ventas"]);
  if (s.puede("gastos.ver")) items.push(["/analitica/gastos", "Egresos"]);
  if (s.puede("cortes.ver")) items.push(["/analitica/cortes", "Cortes de caja"]);
  if (s.puede("reportes.ver")) items.push(["/analitica/finanzas", "Finanzas"]);
  if (items.length <= 1) return <>{children}</>;
  return (
    <div className="lay-sup">
      <Pestanas items={items} />
      <div className="lay-sup-c">{children}</div>
    </div>
  );
}
