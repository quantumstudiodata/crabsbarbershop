import Link from "next/link";
import { Icono } from "@/components/Icono";
import { indicadores, solicitudes } from "@/lib/plataforma";
import { FilaHerramienta, ListaSolicitudes } from "./Comunes";

export const metadata = { title: "Centro de soporte" };

/** Centro de soporte: primero lo que requiere atención; las herramientas, como navegación compacta. */
export default async function Soporte() {
  const [n, abiertas] = await Promise.all([indicadores(), solicitudes({ estado: "abiertas", limite: 8 })]);
  const atencion: [number, string, string][] = [
    [n.pendientes, n.pendientes === 1 ? "Solicitud sin atender" : "Solicitudes sin atender", "/soporte/solicitudes?estado=pendiente"],
    [n.demoradas, "Sin respuesta en más de 24 h", "/soporte/solicitudes?estado=demoradas"],
    [n.incidencias, n.incidencias === 1 ? "Incidencia abierta" : "Incidencias abiertas", "/soporte/actividad?ver=incidencias"],
    [n.errores, "Errores en 24 horas", "/soporte/actividad?ver=errores"],
  ];
  return (
    <>
      <div>
        <span className="lab">Administrador de plataforma</span>
        <h1 className="titulo" style={{ marginTop: 6 }}>Centro de soporte</h1>
      </div>

      <form action="/soporte/negocios" className="buscar-s glass">
        <Icono n="buscar" />
        <input name="q" className="input" placeholder="Buscar un negocio: nombre, propietario o identificador" autoComplete="off" aria-label="Buscar un negocio" />
      </form>

      <nav className="atencion-s" aria-label="Requiere atención">
        {atencion.map(([num, texto, href]) => (
          <Link key={href} href={href} className={num ? "hay" : ""}><b className="num">{num}</b><span>{texto}</span></Link>
        ))}
      </nav>

      <div className="tit-fuera">
        <span className="lab">Solicitudes abiertas</span>
        <Link className="link-c" href="/soporte/solicitudes">Ver todas<Icono n="derecha" /></Link>
      </div>
      <section className="glass panel-s protagonista-s subir">
        <ListaSolicitudes filas={abiertas} vacio="No hay solicitudes abiertas. Todo está al día." />
      </section>

      <div className="tit-fuera"><span className="lab">Herramientas</span></div>
      <section className="glass panel-s herramientas-s subir d1">
        <FilaHerramienta href="/soporte/negocios" titulo="Negocios" detalle={`${n.negocios} ${n.negocios === 1 ? "negocio" : "negocios"}, ${n.usuarios} usuarios`} />
        <FilaHerramienta href="/soporte/actividad" titulo="Actividad e incidencias" detalle="Actividad, errores, incidencias, estado de servicios y actualizaciones" />
        <FilaHerramienta href="/soporte/pruebas" titulo="Entornos de prueba" detalle={`${n.pruebas} ${n.pruebas === 1 ? "negocio de prueba" : "negocios de prueba"}`} />
        <FilaHerramienta href="/soporte/permisos" titulo="Simulación de permisos" detalle="Qué aparece y qué está restringido en cada puesto" />
        <FilaHerramienta href="/soporte/vista" titulo="Vista previa de interfaz" detalle="Cómo se ve la plataforma para cada puesto, en escritorio o móvil" />
      </section>
    </>
  );
}
