import { redirect } from "next/navigation";

/** Cierres y descargas ahora vive en las Descargas de la Libreta. */
export default function Cierres() {
  redirect("/libreta");
}
