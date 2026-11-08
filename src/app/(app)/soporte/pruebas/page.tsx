import { eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/lib/db";
import { conteoNegocio } from "@/lib/pruebas";
import { CabezaSoporte } from "../Comunes";
import { CrearPrueba, LimpiarTemporales, Mantenimiento } from "./Controles";

export const metadata = { title: "Entornos de prueba" };

export default async function Pruebas() {
  const [pruebas, [reales]] = await Promise.all([
    db.select().from(t.barberias).where(eq(t.barberias.esPrueba, true)),
    db.select({ n: sql<number>`count(*)::int` }).from(t.barberias).where(eq(t.barberias.esPrueba, false)),
  ]);
  const conteos = await Promise.all(pruebas.map((b) => conteoNegocio(b.id)));
  return (
    <>
      <CabezaSoporte titulo="Mantenimiento de entornos de prueba" sub={`Solo actúa sobre negocios de prueba. Los ${reales.n} negocios reales quedan excluidos de todas estas operaciones.`} extra={<CrearPrueba />} />
      <div className="tit-fuera"><span className="lab">Negocios de prueba</span><span className="muted chico-t">{pruebas.length}</span></div>
      <section className="glass panel-s">
        {!pruebas.length ? <p className="muted vacio-s">No hay negocios de prueba. Crea uno para probar funciones sin tocar datos reales.</p> : (
          <div className="lista-s">
            {pruebas.map((b, i) => {
              const c = conteos[i];
              return (
                <div key={b.id} className="fila-s plana">
                  <span className="t-s"><b>{b.nombre}</b><small>{c.usuarios} cuentas, {c.servicios} servicios, {c.ventas} ventas, {c.egresos} egresos, {c.cortes} cortes</small></span>
                  <span className="meta-s"><Mantenimiento id={b.id} nombre={b.nombre} conteo={c} /></span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="tit-fuera"><span className="lab">Registros temporales</span></div>
      <section className="glass panel-s">
        <div className="fila-s plana">
          <span className="t-s"><b>Limpiar registros temporales</b><small>Sesiones vencidas y errores del sistema de hace más de 90 días, de toda la plataforma. No toca ventas ni configuración.</small></span>
          <span className="meta-s"><LimpiarTemporales /></span>
        </div>
      </section>
      <p className="ayuda-txt">Para probar cambios antes de publicarlos se usa la versión de prueba del sitio (rama de rediseño). Estos negocios sirven para revisar esa versión con datos que se pueden borrar.</p>
    </>
  );
}
