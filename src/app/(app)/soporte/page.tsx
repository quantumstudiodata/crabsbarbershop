import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DESCRIPCION_ROL, NOMBRE_ROL, PLANTILLAS } from "@/lib/permisos";
import { Icono } from "@/components/Icono";
import { Limpiar } from "./Limpiar";

export const metadata = { title: "Soporte" };

/** Herramientas de la cuenta de soporte de la plataforma. Para cualquier otra cuenta, esta página no existe. */
export default async function Soporte() {
  const s = await requerirSesion();
  if (!s.usuario.esSoporte) notFound();
  const puestos = await db.select().from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id));
  return (
    <>
      <div>
        <span className="lab">Administrador de plataforma</span>
        <h1 className="titulo" style={{ marginTop: 6 }}>Modo de visualización</h1>
        <p className="sub">Visualiza la plataforma como la experimentaría cada tipo de usuario. Es solo una vista previa: no cambia tu cuenta ni deja guardar cambios.</p>
      </div>
      <section className="glass panel">
        <span className="lab">Seleccionar experiencia</span>
        <div className="vistas-s">
          {PLANTILLAS.map((r) => (
            <a key={r} className="vista-s" href={`/api/vista?como=${r}`} aria-current={s.vista === NOMBRE_ROL[r] ? "true" : undefined}>
              <b>{NOMBRE_ROL[r]}</b><small>{DESCRIPCION_ROL[r]}</small><Icono n="ojo" />
            </a>
          ))}
          {puestos.map((p) => (
            <a key={p.id} className="vista-s" href={`/api/vista?como=puesto:${p.id}`}>
              <b>{p.nombre}</b><small>{p.descripcion || `Puesto personalizado, parte de ${NOMBRE_ROL[p.plantilla]}`}</small><Icono n="ojo" />
            </a>
          ))}
        </div>
        {s.vista && <a className="bt sec solo" href="/api/vista?salir=1" style={{ justifySelf: "start" }}>Salir del modo de visualización</a>}
        <p className="ayuda-txt">Para revisar el diseño en celular, abre esta misma página desde tu teléfono o achica la ventana. Para probar acciones reales, usa un negocio de pruebas.</p>
      </section>

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
