import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL. Copia .env.example a .env y llénalo.");

const g = globalThis as unknown as { __crabsSql?: ReturnType<typeof postgres> };
// prepare:false es necesario con el pooler de Supabase (modo transacción).
// idle_timeout y max_lifetime cierran las conexiones que ya no se usan: sin ellos, cada versión publicada
// dejaba conexiones abiertas en sus instancias hasta llenar el límite de la base y los pedidos nuevos se quedaban esperando.
const client = g.__crabsSql ?? postgres(url, { prepare: false, max: 5, idle_timeout: 20, max_lifetime: 60 * 10, connect_timeout: 15 });
if (process.env.NODE_ENV !== "production") g.__crabsSql = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
