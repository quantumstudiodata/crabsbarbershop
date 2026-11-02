import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { NavAjustes } from "./NavAjustes";

export default async function LayoutAjustes({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const links: [string, string, string][] = [];
  if (s.puede("usuarios.ver")) links.push(["/ajustes", "Usuarios", "persona"]);
  if (s.puede("servicios.ver")) links.push(["/ajustes/servicios", "Servicios", "etiqueta"]);
  if (s.puede("ajustes.funciones")) links.push(["/ajustes/cobro", "Editar funciones", "caja"]);
  if (links.length === 0) redirect("/?aviso=sin-permiso");
  return (
    <div className="ajustes">
      <NavAjustes links={links} />
      <div className="pila" style={{ gap: 22, minWidth: 0 }}>{children}</div>
    </div>
  );
}
