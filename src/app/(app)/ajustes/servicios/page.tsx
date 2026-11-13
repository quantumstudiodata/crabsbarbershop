import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { fechaLocal } from "@/lib/fechas";
import type { Promo } from "@/lib/promociones";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PantallaServicios } from "./TablaServicios";

export const metadata = { title: "Servicios" };

export default async function Servicios({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const q = await searchParams;
  const s = await requerirSesion("servicios.ver");
  const b = s.barberia.id;
  const servicios = await db.select().from(schema.servicios).where(and(eq(schema.servicios.barberiaId, b), isNull(schema.servicios.eliminadoEn))).orderBy(asc(schema.servicios.orden), asc(schema.servicios.nombre));
  let categorias = await db.select().from(schema.categoriasServicio).where(and(eq(schema.categoriasServicio.barberiaId, b), isNull(schema.categoriasServicio.eliminadoEn))).orderBy(asc(schema.categoriasServicio.orden), asc(schema.categoriasServicio.creadoEn));
  // Una categoría que solo existe en algún servicio (de antes) se registra al final para poder administrarla.
  const faltan = [...new Set(servicios.map((x) => x.categoria))].filter((n) => !categorias.some((c) => c.nombre === n));
  if (faltan.length) {
    const max = categorias.reduce((m, c) => Math.max(m, c.orden), 0);
    await db.insert(schema.categoriasServicio).values(faltan.map((nombre, i) => ({ barberiaId: b, nombre, orden: max + (i + 1) * 10 }))).onConflictDoNothing();
    categorias = await db.select().from(schema.categoriasServicio).where(and(eq(schema.categoriasServicio.barberiaId, b), isNull(schema.categoriasServicio.eliminadoEn))).orderBy(asc(schema.categoriasServicio.orden), asc(sql`creado_en`));
  }
  const promos = await db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, b)).orderBy(desc(schema.promociones.creadoEn));
  return (
    <PantallaServicios
      promos={promos.map(({ creadoEn: _c, creadoPor: _p, barberiaId: _b, ...x }) => x) as unknown as Promo[]}
      hoy={fechaLocal(new Date(), s.barberia.zonaHoraria)} usaPromociones={s.barberia.usaPromociones} pestana={q.pestana === "promociones" ? "promociones" : "servicios"}
      servicios={servicios.map(({ id, nombre, categoria, precio, duracionMin, activo, comision, descripcion }) => ({ id, nombre, categoria, precio, duracionMin, activo, comision, descripcion }))}
      categorias={categorias.map(({ id, nombre, descripcion, activo }) => ({ id, nombre, descripcion, activo }))}
      puedeEditar={s.puede("servicios.editar") && !s.vista}
    />
  );
}
