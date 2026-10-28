import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { NavAjustes } from "./NavAjustes";

export default async function LayoutAjustes({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const links: [string, string, string][] = [];
  if (s.puede("ajustes.usuarios")) links.push(["/ajustes", "Personas", "persona"], ["/ajustes/equipo", "Formas de pago del equipo", "efectivo"]);
  if (s.puede("ajustes.negocio")) links.push(["/ajustes/servicios", "Servicios y precios", "etiqueta"], ["/ajustes/cobro", "Cobro y caja", "caja"]);
  if (links.length === 0) redirect("/?aviso=sin-permiso");
  return (
    <div className="ajustes">
      <NavAjustes links={links} />
      <div className="pila" style={{ gap: 22, minWidth: 0 }}>{children}</div>
    </div>
  );
}
