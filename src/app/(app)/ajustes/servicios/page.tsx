import { asc, eq } from "drizzle-orm";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { TablaServicios } from "./TablaServicios";

export const metadata = { title: "Servicios" };

export default async function Servicios() {
  const s = await requerirSesion("servicios.ver");
  const servicios = await db.select().from(schema.servicios).where(eq(schema.servicios.barberiaId, s.barberia.id)).orderBy(asc(schema.servicios.orden), asc(schema.servicios.nombre));
  return (
    <>
      <div>
        <h1 className="titulo">Servicios</h1>
        <p className="sub">El precio de aquí es el que se cobra.</p>
      </div>
      <TablaServicios servicios={servicios.map(({ id, nombre, categoria, precio, duracionMin, activo, comision }) => ({ id, nombre, categoria, precio, duracionMin, activo, comision }))} puedeEditar={s.puede("servicios.editar")} />
    </>
  );
}
