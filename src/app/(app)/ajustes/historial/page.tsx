import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaCorta, fechaLocal, horaCorta } from "@/lib/fechas";

export const metadata = { title: "Historial" };

const FILTROS: [string, string][] = [["", "Todo"], ["venta", "Ventas"], ["caja", "Caja"], ["precio", "Precios"], ["usuario", "Personas"], ["equipo", "Equipo"], ["acceso", "Accesos"]];

export default async function Historial({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await requerirSesion("historial.ver");
  const { tipo } = await searchParams;
  const filtro = FILTROS.some(([k]) => k === tipo) ? tipo ?? "" : "";
  const cond: SQL[] = [eq(schema.historial.barberiaId, s.barberia.id)];
  if (filtro) cond.push(eq(schema.historial.tipo, filtro));
  const filas = await db.select().from(schema.historial).where(and(...cond)).orderBy(desc(schema.historial.creadoEn)).limit(200);
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  return (
    <>
      <Encabezado etiqueta="Ajustes" titulo="Historial" sub="Nada se borra. Aquí queda quién hizo qué, cuándo y por qué." />
      <nav className="opciones" aria-label="Filtrar">
        {FILTROS.map(([k, t]) => (
          <Link key={k} href={k ? `/ajustes/historial?tipo=${k}` : "/ajustes/historial"} className="btn chico" style={filtro === k ? { background: "var(--ink)", color: "#fff" } : undefined}>{t}</Link>
        ))}
      </nav>
      <div className="glass panel">
        {filas.length === 0 ? <p className="muted">Sin movimientos.</p> : (
          <div className="lista">
            {filas.map((f) => {
              const d = f.detalle as Record<string, unknown>;
              const extra = d && typeof d === "object" ? Object.entries(d).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `${k === "motivo" ? "Motivo" : k === "nota" || k === "notas" ? "Nota" : k === "antes" ? "Antes" : k === "ahora" ? "Ahora" : k === "concepto" ? "Para" : ""}${k === "motivo" || k === "nota" || k === "notas" || k === "antes" || k === "ahora" || k === "concepto" ? ": " : ""}${v}`).filter((x) => x.includes(": ")).join(". ") : "";
              const dia = fechaLocal(f.creadoEn, zona);
              return (
                <div key={f.id} style={{ alignItems: "flex-start" }}>
                  <span style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 12 }}>
                    <small style={{ fontFamily: "var(--f-mono)", marginTop: 2 }}>{dia === hoy ? "Hoy" : fechaCorta(dia)}<br />{horaCorta(f.creadoEn, zona)}</small>
                    <span><b style={{ fontWeight: 500 }}>{f.accion}</b>{extra && <small>{extra}</small>}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
