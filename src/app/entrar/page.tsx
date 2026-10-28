import { redirect } from "next/navigation";
import { Cangrejo } from "@/components/Cangrejo";
import { obtenerSesion } from "@/lib/auth";
import { FormEntrar } from "./FormEntrar";

export const metadata = { title: "Entrar a Crabs" };

export default async function Entrar() {
  if (await obtenerSesion()) redirect("/");
  return (
    <main className="entrada">
      <div className="glass entrada-c">
        <div className="marca" aria-hidden="true">
          <Cangrejo className="cangrejo" />
          <span className="palabra">CRABS</span>
        </div>
        <FormEntrar />
      </div>
    </main>
  );
}
