import Link from "next/link";
import { Nav, type ItemNav } from "@/components/Nav";
import { requerirSesion } from "@/lib/auth";
import { NOMBRE_ROL } from "@/lib/permisos";
import { salir } from "../salir";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const items: ItemNav[] = [{ href: "/", texto: "Inicio" }];
  if (s.puede("ventas.registrar") || s.puede("ventas.registrar_otros")) items.push({ href: "/cobrar", texto: "Cobrar" });
  items.push({ href: "/ventas", texto: "Ventas" });
  if (s.puede("caja.operar") || s.puede("reportes.ver")) items.push({ href: "/caja", texto: "Caja" });
  items.push({ href: "/equipo", texto: s.puede("equipo.ver") ? "Equipo" : "Mi semana" });
  if (s.puede("reportes.ver")) items.push({ href: "/reportes", texto: "Reportes" });
  if (s.puede("ideas.decidir")) items.push({ href: "/ideas", texto: "Ideas" });
  if (s.puede("ajustes.usuarios") || s.puede("ajustes.negocio") || s.puede("historial.ver")) items.push({ href: "/ajustes", texto: "Ajustes" });

  return (
    <>
      <header className="barra">
        <Nav items={items} />
      </header>
      <div className="contenedor">
        <div className="usuario-menu">
          <span>
            {s.usuario.nombre} <span className="chip gris" style={{ marginLeft: 6 }}>{NOMBRE_ROL[s.usuario.rol]}</span>
          </span>
          <Link href="/cambiar-contrasena" className="enlace">Contraseña</Link>
          <form action={salir}>
            <button className="enlace">Salir</button>
          </form>
        </div>
        {children}
      </div>
    </>
  );
}
