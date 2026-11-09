import { redirect } from "next/navigation";

/** Ventas del barbero ahora es la misma pantalla que la de los demás puestos, con sus datos. */
export default function MisVentas() {
  redirect("/analitica/ventas");
}
