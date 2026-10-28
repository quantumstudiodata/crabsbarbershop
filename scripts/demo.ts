// Datos de demostración para probar en una computadora local. NUNCA correr contra la base real.
// Crea un equipo de ejemplo y 9 semanas de ventas inventadas.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { comisionDeServicio } from "../src/lib/comisiones";
import * as schema from "../src/lib/db/schema";
import { diaDeSemana, fechaLocal, sumarDias } from "../src/lib/fechas";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url) && process.env.DEMO_FORZAR !== "1") {
  throw new Error("Por seguridad, los datos de demostración solo se cargan en una base local.");
}
const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });
const [b] = await db.select().from(schema.barberias).limit(1);
if (!b) throw new Error("Primero corre npm run db:seed");
const ya = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, "AMARTINEZ"));
if (ya.length) { console.log("Los datos de demostración ya estaban cargados."); await sql.end(); process.exit(0); }

const hash = await bcrypt.hash("demo1234", 10);
const alta = async (nombre: string, usuario: string, rol: "encargada" | "barbera" | "contador") =>
  (await db.insert(schema.usuarios).values({ barberiaId: b.id, nombre, usuario, rol, hash, debeCambiar: false }).returning())[0];
const ana = await alta("Ana Martínez López", "AMARTINEZ", "encargada");
const luz = await alta("Luz Hernández Gil", "LHERNANDEZ", "barbera");
const karla = await alta("Karla Ruiz Pérez", "KRUIZ", "barbera");
await alta("José López", "JLOPEZ", "contador");
const inicioReglas = new Date("2026-01-01T00:00:00Z");
const reglas = {
  [ana.id]: { tipo: "porcentaje" as const, porcentaje: 4000, montoFijo: 0, montoSemanal: 0 },
  [luz.id]: { tipo: "renta" as const, porcentaje: 0, montoFijo: 0, montoSemanal: 80000 },
  [karla.id]: { tipo: "mixto" as const, porcentaje: 2000, montoFijo: 0, montoSemanal: 150000 },
};
for (const [barberoId, r] of Object.entries(reglas)) await db.insert(schema.reglasComision).values({ barberiaId: b.id, barberoId, ...r, vigenteDesde: inicioReglas });

const servicios = await db.select().from(schema.servicios).where(eq(schema.servicios.barberiaId, b.id));
const metodos = await db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, b.id));
const equipo = [ana, luz, karla];
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const elegir = <T,>(xs: T[]) => xs[Math.floor(azar() * xs.length)];
const hoy = fechaLocal(new Date(), b.zonaHoraria);
let folio = b.siguienteFolio;

for (let f = sumarDias(hoy, -63); f <= hoy; f = sumarDias(f, 1)) {
  const dia = diaDeSemana(f);
  if (dia === 0) continue; // domingo cerrado
  const esHoy = f === hoy;
  const [t] = await db.insert(schema.turnosCaja).values({
    barberiaId: b.id, fechaOperativa: f, fondoInicial: 50000, abiertoPor: ana.id, abiertoEn: new Date(`${f}T16:02:00Z`),
    estado: esHoy ? "abierto" : "cerrado",
  }).returning();
  let efectivo = 0, propEf = 0;
  const horas = esHoy ? Math.min(Math.max(new Date().getUTCHours() - 6, 10), 19) : 20;
  for (let h = 10; h < horas; h++) {
    const tranquilo = dia === 2 && h >= 12 && h < 15;
    const base = dia === 5 || dia === 6 ? 2.6 : 1.4;
    const n = tranquilo ? (azar() < 0.25 ? 1 : 0) : Math.round(base * (0.6 + azar() * 0.8));
    for (let i = 0; i < n; i++) {
      const s = elegir(servicios);
      const persona = elegir(equipo);
      const m = azar() < 0.5 ? metodos[0] : elegir(metodos);
      // Tampico es UTC−6: la hora local h equivale a h + 6 en UTC.
      const cuando = new Date(Date.parse(`${f}T00:00:00Z`) + ((h + 6) * 60 + Math.floor(azar() * 60)) * 60000);
      const regla = reglas[persona.id];
      const [v] = await db.insert(schema.ventas).values({
        barberiaId: b.id, folio: `${b.folioPrefijo}-${String(folio++).padStart(6, "0")}`, turnoId: t.id, registradaPor: persona.id,
        total: s.precio, claveUnica: `demo-${folio}`, creadoEn: cuando,
      }).returning();
      await db.insert(schema.conceptos).values({ barberiaId: b.id, ventaId: v.id, servicioId: s.id, nombreServicio: s.nombre, barberoId: persona.id, precioLista: s.precio, precioCobrado: s.precio, reglaComision: regla, comision: comisionDeServicio(regla, s.precio) });
      await db.insert(schema.pagos).values({ barberiaId: b.id, ventaId: v.id, metodoPagoId: m.id, nombreMetodo: m.nombre, esEfectivo: m.esEfectivo, monto: s.precio });
      if (m.esEfectivo) efectivo += s.precio;
      if (azar() < 0.3) {
        const p = 2000 + Math.floor(azar() * 3) * 1000;
        await db.insert(schema.propinas).values({ barberiaId: b.id, ventaId: v.id, barberoId: persona.id, monto: p, esEfectivo: m.esEfectivo });
        if (m.esEfectivo) propEf += p;
      }
    }
  }
  if (!esHoy) {
    const esperado = 50000 + efectivo + propEf;
    const dif = azar() < 0.15 ? -5000 : 0;
    await db.update(schema.turnosCaja).set({ cerradoPor: ana.id, cerradoEn: new Date(`${sumarDias(f, 1)}T02:10:00Z`), efectivoEsperado: esperado, efectivoContado: esperado + dif, diferencia: dif, notasCierre: dif ? "Se dio cambio de más" : null }).where(eq(schema.turnosCaja.id, t.id));
  }
}
await db.update(schema.barberias).set({ siguienteFolio: folio, metaDiaria: 350000 }).where(eq(schema.barberias.id, b.id));
console.log("Datos de demostración cargados. Usuarios de ejemplo con contraseña demo1234: AMARTINEZ (encargada), LHERNANDEZ y KRUIZ (barberas), JLOPEZ (contador).");
await sql.end();
