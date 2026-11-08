import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as t } from "@/lib/db";
import { ocultarSensibles } from "@/lib/sensibles";
import { hace } from "@/lib/soporte";
import { CabezaSoporte } from "../../../Comunes";

export const metadata = { title: "Detalle del error" };

const OPERACION: [RegExp, string][] = [
  [/^\/cobrar/, "Cobro o caja"], [/^\/analitica\/ventas/, "Ventas"], [/^\/analitica\/cortes/, "Cortes de caja"], [/^\/analitica\/finanzas/, "Finanzas y egresos"],
  [/^\/analitica/, "Analítica"], [/^\/libreta/, "Libreta"], [/^\/ajustes/, "Ajustes"], [/^\/mis-ventas/, "Mis ventas"], [/^\/api\/exportar|^\/api\/libreta/, "Descarga de reportes"],
  [/^\/soporte/, "Centro de soporte"], [/^\/$/, "Inicio"],
];

/** Cuándo pasó, en qué negocio, qué operación lo provocó y si se ha repetido. */
export default async function DetalleError({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [x] = await db.select({ e: t.erroresSistema, negocio: t.barberias.nombre, persona: t.usuarios.nombre }).from(t.erroresSistema)
    .leftJoin(t.barberias, eq(t.barberias.id, t.erroresSistema.barberiaId)).leftJoin(t.usuarios, eq(t.usuarios.id, t.erroresSistema.usuarioId))
    .where(eq(t.erroresSistema.id, id)).limit(1);
  if (!x) notFound();
  const repeticiones = await db.select({ e: t.erroresSistema, negocio: t.barberias.nombre, persona: t.usuarios.nombre }).from(t.erroresSistema)
    .leftJoin(t.barberias, eq(t.barberias.id, t.erroresSistema.barberiaId)).leftJoin(t.usuarios, eq(t.usuarios.id, t.erroresSistema.usuarioId))
    .where(and(eq(t.erroresSistema.mensaje, x.e.mensaje), eq(t.erroresSistema.ruta, x.e.ruta))).orderBy(desc(t.erroresSistema.creadoEn)).limit(50);
  const ruta = x.e.ruta.split("?")[0];
  const operacion = OPERACION.find(([r]) => r.test(ruta))?.[1] ?? "Otra página";
  const cuando = x.e.creadoEn.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Monterrey" });
  const negocios = new Set(repeticiones.map((r) => r.negocio ?? "")).size;
  return (
    <>
      <CabezaSoporte titulo="Detalle del error" sub={`${operacion}, ${x.e.origen === "servidor" ? "en el servidor" : "en el navegador"}`} />
      <section className="glass panel-s">
        <code className="error-grande">{ocultarSensibles(x.e.mensaje)}</code>
        <div className="datos-l">
          <div><span>Cuándo</span><b>{cuando}</b></div>
          <div><span>Negocio</span>{x.e.barberiaId ? <Link className="enlace" href={`/soporte/negocios/${x.e.barberiaId}`}>{x.negocio}</Link> : <b>Sin sesión</b>}</div>
          <div><span>Persona</span><b>{x.persona ?? "Sin sesión"}</b></div>
          <div><span>Operación</span><b>{operacion}</b></div>
          <div><span>Página</span><b className="mono">{ocultarSensibles(x.e.ruta) || "Sin página"}</b></div>
          {x.e.digest && <div><span>Código</span><b className="mono">{x.e.digest}</b></div>}
          <div><span>Repeticiones</span><b>{repeticiones.length === 1 ? "Solo esta vez" : `${repeticiones.length} veces${negocios > 1 ? ` en ${negocios} negocios` : ""}`}</b></div>
        </div>
      </section>
      {repeticiones.length > 1 && (
        <>
          <div className="tit-fuera"><span className="lab">Cada vez que ocurrió</span></div>
          <section className="glass panel-s">
            <div className="lista-s">
              {repeticiones.map((r) => (
                <div key={r.e.id} className="fila-s plana">
                  <span className="t-s"><b>{r.negocio ?? "Sin sesión"}</b><small>{r.persona ?? "Sin persona"}</small></span>
                  <span className="meta-s"><small>{hace(r.e.creadoEn)}</small></span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <p className="ayuda-txt">Las contraseñas, tokens, correos, teléfonos y los valores de las consultas se ocultan antes de guardarse y al mostrarse.</p>
    </>
  );
}
