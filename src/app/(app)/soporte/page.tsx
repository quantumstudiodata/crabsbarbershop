import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { Limpiar } from "./Limpiar";

export const metadata = { title: "Soporte" };

/** Herramientas de la cuenta de soporte de la plataforma. Para cualquier otra cuenta, esta página no existe. */
export default async function Soporte() {
  const s = await requerirSesion();
  if (!s.usuario.esSoporte) notFound();
  return (
    <>
      <div>
        <span className="lab">Cuenta de soporte</span>
        <h1 className="titulo" style={{ marginTop: 6 }}>Entregar el sistema limpio</h1>
        <p className="sub">Borra todo lo que se registró durante las pruebas en {s.barberia.nombre}, para entregarlo como recién instalado.</p>
      </div>
      <section className="glass panel" style={{ justifyItems: "start" }}>
        <Limpiar negocio={s.barberia.nombre} />
      </section>
    </>
  );
}
