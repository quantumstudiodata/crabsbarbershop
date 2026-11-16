import { redirect } from "next/navigation";

export default function Antes() {
  redirect("/analitica/finanzas?tipo=ventas");
}
