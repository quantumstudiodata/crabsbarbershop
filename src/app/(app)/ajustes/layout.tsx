import Link from "next/link";
import { requerirSesion } from "@/lib/auth";

export default async function LayoutAjustes({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const links: [string, string][] = [];
  if (s.puede("ajustes.usuarios")) links.push(["/ajustes", "Personas"], ["/ajustes/equipo", "Formas de pago del equipo"]);
  if (s.puede("ajustes.negocio")) links.push(["/ajustes/servicios", "Servicios y precios"]);
  if (s.puede("historial.ver")) links.push(["/ajustes/historial", "Historial"]);
  return (
    <>
      <nav className="fila" aria-label="Ajustes">
        {links.map(([h, t]) => <Link key={h} href={h} className="btn chico">{t}</Link>)}
      </nav>
      {children}
    </>
  );
}
