import { redirect } from "next/navigation";

// Las reseñas viven ahora en Clientes.
export default function ResenasAnterior() {
  redirect("/clientes/resenas");
}
