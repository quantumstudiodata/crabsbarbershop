import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";

/** Solo la cuenta de soporte de la plataforma ve estas páginas. Para cualquier otra, no existen. */
export default async function LayoutSoporte({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  if (!s.usuario.esSoporte) notFound();
  return <div className="soporte-c">{children}</div>;
}
