import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { PERMISOS_CONFIG } from "@/lib/permisos";
import { pagosDisponibles } from "@/lib/stripe";
import { NavAjustes } from "./NavAjustes";

export default async function LayoutAjustes({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const links: [string, string, string][] = [];
  if (s.puede("usuarios.ver")) links.push(["/ajustes", "Usuarios", "persona"]);
  if (s.puede("servicios.ver")) links.push(["/ajustes/servicios", "Servicios", "etiqueta"]);
  if (PERMISOS_CONFIG.some((p) => s.puede(p))) links.push(["/ajustes/cobro", "Configuración del negocio", "caja"]);
  if (s.puede("configuracion.cobros") && pagosDisponibles()) links.push(["/ajustes/pagos", "Pagos en línea", "tarjeta"]);
  if (s.puede("configuracion.citas") || s.puede("citas.horarios")) links.push(["/ajustes/citas", "Citas y agenda", "calendario"]);
  if (links.length === 0) redirect("/?aviso=sin-permiso");
  return (
    <div className="ajustes">
      <NavAjustes links={links} />
      <div className="pila" style={{ gap: 22, minWidth: 0 }}>{children}</div>
    </div>
  );
}
