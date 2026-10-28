import { redirect } from "next/navigation";

// La caja vive ahora dentro de Cobro, como ventana emergente.
export default function Caja() {
  redirect("/cobrar?caja=1");
}
