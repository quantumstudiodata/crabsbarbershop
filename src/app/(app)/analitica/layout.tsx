import { requerirSesion } from "@/lib/auth";
import { Pestanas } from "./Pestanas";

export default async function LayoutAnalitica({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const items: [string, string][] = [];
  if (s.puede("reportes.ver")) items.push(["/analitica", "Resumen"]);
  if (s.puede("ventas.ver_todas")) items.push(["/analitica/ventas", "Ventas"]);
  if (s.puede("equipo.ver")) items.push(["/analitica/equipo", "Equipo"]);
  if (s.puede("caja.operar") || s.puede("reportes.ver")) items.push(["/analitica/cortes", "Cortes de caja"]);
  return (
    <>
      {items.length > 1 && <Pestanas items={items} />}
      {children}
    </>
  );
}
