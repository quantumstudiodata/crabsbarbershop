import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";

/** Clientes abre en Citas y agenda cuando el negocio las usa; si no, en Reseñas. */
export default async function Clientes() {
  const s = await requerirSesion();
  redirect(s.barberia.usaCitas && s.puede("citas.ver") ? "/citas" : "/clientes/resenas");
}
