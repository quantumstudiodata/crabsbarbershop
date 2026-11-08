import { eq } from "drizzle-orm";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { indicadores, solicitudes } from "@/lib/plataforma";
import { NOMBRE_ROL, PLANTILLAS } from "@/lib/permisos";
import { Icono } from "@/components/Icono";
import { FilaHerramienta, ListaSolicitudes } from "./Comunes";
import { FormVista } from "./vista/FormVista";

export const metadata = { title: "Centro de soporte" };

/** Centro de soporte: solicitudes, negocios, herramientas de diagnóstico, pruebas y vista previa. */
export default async function Soporte() {
  const s = await requerirSesion();
  const [n, abiertas, puestos, pruebas] = await Promise.all([
    indicadores(),
    solicitudes({ estado: "abiertas", limite: 6 }),
    db.select({ id: schema.puestos.id, nombre: schema.puestos.nombre }).from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id)),
    db.select({ id: schema.barberias.id, nombre: schema.barberias.nombre }).from(schema.barberias).where(eq(schema.barberias.esPrueba, true)),
  ]);
  return (
    <>
      <div>
        <span className="lab">Administrador de plataforma</span>
        <h1 className="titulo" style={{ marginTop: 6 }}>Centro de soporte</h1>
        <p className="sub">Administración y supervisión de la plataforma</p>
      </div>

      <form action="/soporte/negocios" className="buscar-s glass">
        <Icono n="buscar" />
        <label className="sr-only" htmlFor="q-negocio">Buscar un negocio</label>
        <input id="q-negocio" name="q" className="input" placeholder="Buscar un negocio: nombre, propietario o identificador" autoComplete="off" />
      </form>

      <section className="datos-s">
        <div><b className="num">{n.negocios}</b><span>Negocios registrados</span></div>
        <div><b className="num">{n.usuarios}</b><span>Usuarios registrados</span></div>
        <div><b className="num">{n.pendientes}</b><span>Solicitudes pendientes</span></div>
        <div><b className="num">{n.errores}</b><span>Errores en 24 horas</span></div>
      </section>

      <div className="tit-fuera">
        <span className="lab">Solicitudes de soporte</span>
        <span className="fila" style={{ gap: 12 }}><span className="muted chico-t">{n.pendientes} {n.pendientes === 1 ? "pendiente" : "pendientes"}</span><a className="link-c" href="/soporte/solicitudes">Ver todas<Icono n="derecha" /></a></span>
      </div>
      <section className="glass panel-s subir">
        <form action="/soporte/solicitudes" className="buscar-s chico"><Icono n="buscar" /><input name="q" className="input" placeholder="Buscar solicitudes..." autoComplete="off" aria-label="Buscar solicitudes" /></form>
        <ListaSolicitudes filas={abiertas} vacio="No hay solicitudes abiertas." />
      </section>

      <div className="tit-fuera"><span className="lab">Herramientas de plataforma</span></div>
      <section className="glass panel-s subir d1">
        <FilaHerramienta href="/soporte/negocios" titulo="Negocios" detalle="Consultar cuentas, configuraciones y diagnóstico de cada negocio" dato={<span className="muted chico-t">{n.negocios} {n.negocios === 1 ? "negocio" : "negocios"}</span>} />
        <FilaHerramienta href="/soporte/actividad" titulo="Actividad e incidencias" detalle="Registro de actividad, errores del sistema, incidencias, estado de servicios e historial de cambios"
          dato={n.errores ? <span className="chip-p alerta">{n.errores} {n.errores === 1 ? "error" : "errores"} hoy</span> : <span className="chip-p">Sin errores hoy</span>} />
        <FilaHerramienta href="/soporte/pruebas" titulo="Mantenimiento de entornos de prueba" detalle="Crear, restablecer y eliminar negocios de prueba, datos de demostración y registros temporales"
          dato={<span className="muted chico-t">{n.pruebas} {n.pruebas === 1 ? "negocio de prueba" : "negocios de prueba"}</span>} />
      </section>

      <div className="tit-fuera"><span className="lab">Modo de visualización</span></div>
      <section className="glass panel-s subir d2">
        <p className="muted" style={{ margin: 0 }}>Previsualiza cómo experimenta la plataforma cada tipo de usuario. Es solo una vista: no guarda cambios ni ejecuta acciones reales.</p>
        <FormVista puestos={[...PLANTILLAS.map((r) => ({ valor: r, texto: NOMBRE_ROL[r] })), ...puestos.map((p) => ({ valor: `puesto:${p.id}`, texto: p.nombre }))]}
          negocios={[{ valor: "", texto: `${s.barberia.nombre} (tu negocio)` }, ...pruebas.filter((p) => p.id !== s.barberia.id).map((p) => ({ valor: p.id, texto: `${p.nombre} (prueba)` }))]} />
      </section>
    </>
  );
}
