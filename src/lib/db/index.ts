import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL. Copia .env.example a .env y llénalo.");

const g = globalThis as unknown as { __crabsSql?: ReturnType<typeof postgres> };
// prepare:false es necesario con el pooler de Supabase (modo transacción).
const client = g.__crabsSql ?? postgres(url, { prepare: false, max: 5 });
if (process.env.NODE_ENV !== "production") g.__crabsSql = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
