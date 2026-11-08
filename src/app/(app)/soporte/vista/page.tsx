import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { NOMBRE_ROL, PLANTILLAS } from "@/lib/permisos";
import { CabezaSoporte } from "../Comunes";
import { FormVista } from "./FormVista";
import { PAGINAS } from "./paginas";

export const metadata = { title: "Vista previa" };

/**
 * La página elegida, tal como la ve el puesto. En móvil se muestra en un marco de 390 por 844 px:
 * es la misma página con el ancho real de un teléfono, no una imagen ni una maqueta.
 */
export default async function Vista({ searchParams }: { searchParams: Promise<{ pagina?: string; disp?: string }> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  const pagina = PAGINAS.some((p) => p.valor === q.pagina) ? q.pagina! : "/";
  const movil = q.disp === "movil";
  const jar = await cookies();
  const [puestos, pruebas] = await Promise.all([
    db.select({ id: schema.puestos.id, nombre: schema.puestos.nombre }).from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id)),
    db.select({ id: schema.barberias.id, nombre: schema.barberias.nombre }).from(schema.barberias).where(eq(schema.barberias.esPrueba, true)),
  ]);
  return (
    <>
      <CabezaSoporte titulo="Vista previa" sub={s.vista ? `${s.vista} en ${s.barberia.nombre}. No se guarda ningún cambio.` : "Elige un puesto para empezar."} />
      <section className="glass panel-s">
        <FormVista key={`${pagina}${q.disp}`} inicial={{ como: jar.get("crabs_vista")?.value, negocio: jar.get("crabs_vista_negocio")?.value ?? "", pagina, disp: movil ? "movil" : "escritorio" }}
          puestos={[...PLANTILLAS.map((r) => ({ valor: r, texto: NOMBRE_ROL[r] })), ...puestos.map((p) => ({ valor: `puesto:${p.id}`, texto: p.nombre }))]}
          negocios={[{ valor: "", texto: "Tu negocio" }, ...pruebas.map((p) => ({ valor: p.id, texto: `${p.nombre} (prueba)` }))]} />
      </section>
      {s.vista && (
        <div className={`marco-vista ${movil ? "movil" : ""}`}>
          <iframe src={pagina} title={`Vista previa de ${s.vista}`} width={movil ? 390 : undefined} height={movil ? 844 : 760} />
        </div>
      )}
      <p className="ayuda-txt">La vista previa no es acceso como usuario: no permite guardar cambios ni ejecutar acciones reales. Para investigar dentro de un negocio real hará falta un acceso temporal autorizado por el propietario.</p>
    </>
  );
}
