import { db, schema, type Tx } from "./db";

export type TipoHistorial = "venta" | "caja" | "gasto" | "precio" | "usuario" | "equipo" | "ajuste" | "idea" | "acceso";

/** Agrega una línea a la bitácora. Nunca se edita ni se borra (lo impide la base de datos). */
export async function registrar(
  conn: Tx | typeof db,
  e: { barberiaId: string; usuarioId: string | null; tipo: TipoHistorial; accion: string; detalle?: Record<string, unknown> },
) {
  await conn.insert(schema.historial).values({
    barberiaId: e.barberiaId,
    usuarioId: e.usuarioId,
    tipo: e.tipo,
    accion: e.accion,
    detalle: e.detalle ?? {},
  });
}
