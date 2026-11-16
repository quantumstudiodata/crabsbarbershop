import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth";
import { FormCambio } from "./FormCambio";

export const metadata = { title: "Cambiar contraseña" };
export const viewport = { themeColor: "#dfe6ec" };

export default async function CambiarContrasena() {
  const s = await obtenerSesion();
  if (!s) redirect("/entrar");
  return (
    <main className="entrada">
      <div className="glass entrada-c">
        <div className="marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="marca-logo" src="/logo-crabs.png" alt="Crabs Barbershop" width={946} height={209} />
        </div>
        <div className="form-entrada">
          <div>
            <span className="lab">Hola, {s.usuario.nombre.split(" ")[0]}</span>
            <h1 className="titulo" style={{ marginTop: 8 }}>{s.usuario.debeCambiar ? "Elige tu contraseña" : "Cambiar contraseña"}</h1>
            <p className="sub">
              {s.usuario.debeCambiar ? <>La que te dieron es temporal.<br />Escribe una nueva que solo tú conozcas.</> : "Escribe la actual y luego la nueva."}
            </p>
          </div>
          <FormCambio />
          {!s.usuario.debeCambiar && <Link href="/" className="enlace" style={{ justifySelf: "center" }}>Volver</Link>}
        </div>
      </div>
    </main>
  );
}
