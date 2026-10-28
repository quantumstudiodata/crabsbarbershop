// Alta inicial: crea la barbería Crabs, la dueña, la administradora, servicios y formas de pago.
// Solo corre si todavía no existe ninguna barbería. Muestra las contraseñas temporales una sola vez.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { contrasenaTemporal, sugerirUsuario } from "../src/lib/cuentas";
import * as schema from "../src/lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL en .env");
const duena = process.env.SEED_DUENA_NOMBRE?.trim();
const admin = process.env.SEED_ADMIN_NOMBRE?.trim();
if (!duena || !admin) throw new Error("Escribe SEED_DUENA_NOMBRE y SEED_ADMIN_NOMBRE en .env (nombre completo).");

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

const ya = await db.select().from(schema.barberias).limit(1);
if (ya.length) {
  console.log("Ya existe una barbería. No se hizo nada.");
  await sql.end();
  process.exit(0);
}

const [b] = await db.insert(schema.barberias).values({ nombre: "Crabs Barbería" }).returning();
const usados: string[] = [];
const cuentas: { nombre: string; rol: "duena" | "admin"; usuario: string; clave: string }[] = [];
for (const [nombre, rol] of [[duena, "duena"], [admin, "admin"]] as const) {
  const usuario = sugerirUsuario(nombre, usados);
  usados.push(usuario);
  const clave = contrasenaTemporal(nombre);
  await db.insert(schema.usuarios).values({ barberiaId: b.id, nombre, usuario, rol, hash: await bcrypt.hash(clave, 10), debeCambiar: true });
  cuentas.push({ nombre, rol, usuario, clave });
}

// Precios de ejemplo: la dueña debe confirmarlos en Ajustes, Servicios y precios.
const servicios: [string, number, number][] = [
  ["Corte clásico", 30, 15000], ["Fade", 40, 17000], ["Corte y barba", 50, 22000],
  ["Barba", 20, 10000], ["Corte infantil", 25, 12000], ["Ceja o diseño", 10, 5000],
];
await db.insert(schema.servicios).values(servicios.map(([nombre, duracionMin, precio], orden) => ({ barberiaId: b.id, nombre, duracionMin, precio, orden })));
await db.insert(schema.metodosPago).values([
  { barberiaId: b.id, nombre: "Efectivo", esEfectivo: true, orden: 0 },
  { barberiaId: b.id, nombre: "Transferencia", esEfectivo: false, orden: 1 },
  { barberiaId: b.id, nombre: "Tarjeta", esEfectivo: false, orden: 2 },
]);
await db.insert(schema.historial).values({ barberiaId: b.id, usuarioId: null, tipo: "ajuste", accion: "Se creó la barbería en el sistema" });

console.log("\nListo. Guarda estos datos: no se vuelven a mostrar.\n");
for (const c of cuentas) console.log(`${c.rol === "duena" ? "Dueña" : "Administración"}: ${c.nombre}\n  Usuario: ${c.usuario}\n  Contraseña temporal: ${c.clave}\n`);
console.log("Los precios de los servicios son de ejemplo. Confírmalos en Ajustes.");
await sql.end();
