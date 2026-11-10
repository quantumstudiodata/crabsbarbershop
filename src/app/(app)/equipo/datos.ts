import { and, asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { periodoMes } from "@/lib/periodo";

/** Quién entra a Equipo: quien ve los movimientos del equipo o registra sus pagos. */
export async function sesionEquipo() {
  const se = await requerirSesion();
  if (!se.puede("ventas.ver_todas") && !se.puede("equipo.pagar")) redirect("/?aviso=sin-permiso");
  return se;
}

/** Personas que atienden, o que alguna vez atendieron, con su estado. */
export async function personasEquipo(barberiaId: string) {
  return db
    .select({ id: s.usuarios.id, nombre: s.usuarios.nombre, avatar: s.usuarios.avatar, rol: s.usuarios.rol, activo: s.usuarios.activo, horario: s.usuarios.horario, puestoId: s.usuarios.puestoId })
    .from(s.usuarios)
    .where(and(eq(s.usuarios.barberiaId, barberiaId), sql`(${s.usuarios.rol} in ('barbera', 'encargada')
      or exists (select 1 from ${s.conceptos} c where c.barbero_id = ${s.usuarios.id}))`))
    .orderBy(asc(s.usuarios.nombre));
}

/** Mes elegido (?mes=AAAA-MM), nunca posterior al actual. */
export function mesElegido(q: { mes?: string }, zona: string) {
  const hoy = fechaLocal(new Date(), zona);
  const mes = q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) && q.mes <= hoy.slice(0, 7) ? q.mes : hoy.slice(0, 7);
  const p = periodoMes(mes, hoy);
  return { hoy, mes, desde: p.desde, hasta: p.hasta > hoy ? hoy : p.hasta, nombre: p.etiqueta };
}
