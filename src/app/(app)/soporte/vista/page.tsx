import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { esMovil } from "@/lib/dispositivo";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { NOMBRE_ROL, PLANTILLAS } from "@/lib/permisos";
import { CabezaSoporte } from "../Comunes";
import { BarraVista } from "./BarraVista";
import { FormVista } from "./FormVista";

export const metadata = { title: "Vista previa" };

/**
 * La página elegida, tal como la ve el puesto, a pantalla completa. En móvil se muestra con el ancho real
 * de un teléfono (390 px) sobre un fondo: es la misma página, no una imagen ni una maqueta.
 */
export default async function Vista({ searchParams }: { searchParams: Promise<{ pagina?: string; disp?: string }> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  // Cualquier página de la app, menos las de soporte y las internas.
  const pedida = q.pagina ?? "/";
  const pagina = /^\/(?!\/|api|soporte)[\w\-/?=&%.]*$/.test(pedida) || pedida === "/" ? pedida : "/";
  const disp = q.disp === "movil" ? "movil" : "escritorio";
  const jar = await cookies();
  const [puestos, pruebas] = await Promise.all([
    db.select({ id: schema.puestos.id, nombre: schema.puestos.nombre }).from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id)),
    db.select({ id: schema.barberias.id, nombre: schema.barberias.nombre }).from(schema.barberias).where(eq(schema.barberias.esPrueba, true)),
  ]);
  const opPuestos = [...PLANTILLAS.map((r) => ({ valor: r, texto: NOMBRE_ROL[r] })), ...puestos.map((p) => ({ valor: `puesto:${p.id}`, texto: p.nombre }))];
  const opNegocios = [{ valor: "", texto: "Tu negocio (solo lectura)" }, ...pruebas.map((p) => ({ valor: p.id, texto: `${p.nombre} (prueba)` }))];
  if (!s.vista) {
    return (
      <>
        <CabezaSoporte titulo="Vista previa de interfaz" sub="Elige un puesto para ver la plataforma como la vería esa persona." />
        <section className="glass panel-s"><FormVista puestos={opPuestos} negocios={opNegocios} /></section>
      </>
    );
  }
  // En escritorio la vista previa es la app misma, a pantalla completa, con la franja de aviso arriba.
  // Desde un teléfono también: la pantalla ya es la de un teléfono, no hace falta un marco.
  if (disp === "escritorio" || (await esMovil())) redirect(pagina);
  return (
    <div className="vista-pantalla movil">
      <BarraVista puestos={opPuestos} negocios={opNegocios} como={jar.get("crabs_vista")?.value ?? "duena"} negocio={jar.get("crabs_vista_negocio")?.value ?? ""}
        pagina={pagina} disp={disp} prueba={s.barberia.esPrueba} />
      <div className="lienzo-vp">
        <iframe key={`${pagina}${disp}`} src={pagina} title={`Vista previa de ${s.vista}`} />
      </div>
    </div>
  );
}
