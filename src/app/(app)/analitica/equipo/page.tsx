import { redirect } from "next/navigation";

// El equipo se consulta desde Ventas, filtrando por persona.
export default function Equipo() {
  redirect("/analitica/ventas?periodo=mes");
}
