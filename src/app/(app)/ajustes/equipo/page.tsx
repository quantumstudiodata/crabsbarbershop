import { redirect } from "next/navigation";

// La forma de pago ahora se elige al dar de alta o editar a cada usuario.
export default function FormasDePago() {
  redirect("/ajustes");
}
