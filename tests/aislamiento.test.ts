import { describe, expect, it } from "vitest";

// Prueba con base de datos: dos barberías no deben verse entre sí.
// Solo corre si hay una base de pruebas (CRABS_DB_PRUEBAS=1 y DATABASE_URL); nunca contra producción.
const conBase = process.env.CRABS_DB_PRUEBAS === "1" && !!process.env.DATABASE_URL;

describe.skipIf(!conBase)("aislamiento entre barberías", () => {
  it("lo de una barbería no aparece en los reportes de otra", async () => {
    const { db, schema } = await import("@/lib/db");
    const { resumenPeriodo, categoriasGasto } = await import("@/lib/datos");
    const { libretaMes } = await import("@/lib/libreta");
    const { eq } = await import("drizzle-orm");
    const zona = "America/Monterrey";
    const hoy = new Date().toISOString().slice(0, 10);
    const sufijo = Math.random().toString(36).slice(2, 7).toUpperCase();
    const [a] = await db.insert(schema.barberias).values({ nombre: `Prueba A ${sufijo}`, folioPrefijo: `PA${sufijo}` }).returning();
    const [b] = await db.insert(schema.barberias).values({ nombre: `Prueba B ${sufijo}`, folioPrefijo: `PB${sufijo}` }).returning();
    try {
      const [u] = await db.insert(schema.usuarios).values({ barberiaId: a.id, nombre: "Prueba Uno", usuario: `PRUEBA${sufijo}`, hash: "x", rol: "duena" }).returning();
      await db.insert(schema.categoriasGasto).values({ barberiaId: a.id, nombre: "Solo de A" });
      await db.insert(schema.gastos).values({ barberiaId: a.id, categoria: "Solo de A", concepto: "Gasto de A", monto: 12345, fecha: hoy, usuarioId: u.id });

      const resA = await resumenPeriodo(a.id, hoy, hoy, zona);
      const resB = await resumenPeriodo(b.id, hoy, hoy, zona);
      expect(resA.gastos).toBe(12345);
      expect(resB.gastos).toBe(0);
      expect((await categoriasGasto(b.id)).map((c) => c.nombre)).not.toContain("Solo de A");
      const libB = await libretaMes(b.id, hoy.slice(0, 7), zona);
      expect(libB.egresosTotal).toBe(0);
      expect(libB.columnas.length).toBe(0);
    } finally {
      for (const id of [a.id, b.id]) {
        await db.delete(schema.gastos).where(eq(schema.gastos.barberiaId, id));
        await db.delete(schema.categoriasGasto).where(eq(schema.categoriasGasto.barberiaId, id));
        await db.delete(schema.usuarios).where(eq(schema.usuarios.barberiaId, id));
        await db.delete(schema.barberias).where(eq(schema.barberias.id, id));
      }
    }
  });
});
