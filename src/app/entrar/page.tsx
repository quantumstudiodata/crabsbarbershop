import { redirect } from "next/navigation";
import { Cangrejo } from "@/components/Cangrejo";
import { obtenerSesion } from "@/lib/auth";
import { FormEntrar } from "./FormEntrar";

export const metadata = { title: "Entrar a Crabs" };

export default async function Entrar() {
  if (await obtenerSesion()) redirect("/");
  return (
    <main className="entrada">
      <div className="glass">
        <div className="pila-chica centro" style={{ display: "grid" }}>
          <Cangrejo className="" />
          <span className="logo" style={{ fontSize: 30, padding: 0 }}>CRABS</span>
          <span className="lab">Barbería en Tampico</span>
        </div>
        <FormEntrar />
        <p className="ayuda" style={{ textAlign: "center" }}>¿Olvidaste tu contraseña?<br />Pídele a la dueña que la restablezca.</p>
      </div>
    </main>
  );
}
