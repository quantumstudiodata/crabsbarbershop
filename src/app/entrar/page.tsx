import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth";
import { FormEntrar } from "./FormEntrar";

export const metadata = { title: "Entrar a Crabs" };

export default async function Entrar() {
  if (await obtenerSesion()) redirect("/");
  return (
    <main className="entrada">
      <div className="glass entrada-c">
        <div className="marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="marca-logo" src="/logo-crabs.png" alt="Crabs Barbershop" width={946} height={209} />
        </div>
        <FormEntrar />
      </div>
    </main>
  );
}
