import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db, schema as s, type Tx } from "./db";
import { fechaLocal, horaCorta } from "./fechas";

/** Movimiento registrado con la caja cerrada que se va a sumar al abrirla. */
export type PendienteCaja = { id: string; tipo: string; monto: number; concepto: string; categoria: string | null; usuarioId: string; creadoEn: Date };

const deQuien = (barberiaId: string, responsableId: string | null) =>
  and(eq(s.movimientosPendientes.barberiaId, barberiaId), isNull(s.movimientosPendientes.aplicadoTurnoId), isNull(s.movimientosPendientes.canceladoEn),
    // Con caja individual cada quien tiene la suya; los pendientes sin dueño (caja compartida) los toma cualquiera.
    responsableId ? or(eq(s.movimientosPendientes.responsableId, responsableId), isNull(s.movimientosPendientes.responsableId)) : undefined);

/** Lo que está pendiente de sumar a la caja, del más viejo al más nuevo. */
export async function pendientesCaja(barberiaId: string, responsableId: string | null, conn: Tx | typeof db = db): Promise<PendienteCaja[]> {
  return conn.select({ id: s.movimientosPendientes.id, tipo: s.movimientosPendientes.tipo, monto: s.movimientosPendientes.monto, concepto: s.movimientosPendientes.concepto,
    categoria: s.movimientosPendientes.categoria, usuarioId: s.movimientosPendientes.usuarioId, creadoEn: s.movimientosPendientes.creadoEn })
    .from(s.movimientosPendientes).where(deQuien(barberiaId, responsableId)).orderBy(asc(s.movimientosPendientes.creadoEn));
}

/** Cuánto bajó el efectivo de la caja con los pendientes: gastos y lo que se llevó, menos lo que se puso. */
export const efectoPendientes = (xs: { tipo: string; monto: number }[]) => xs.reduce((a, x) => a + (x.tipo === "entrada" ? -x.monto : x.monto), 0);

/** Para mostrar: "Garrafón, 21:40", con signo según el tipo. */
export const textoPendiente = (x: PendienteCaja, zona: string) => ({
  id: x.id, tipo: x.tipo, monto: x.tipo === "entrada" ? x.monto : -x.monto,
  titulo: x.tipo === "gasto" ? x.concepto : x.tipo === "entrada" ? `Se puso dinero: ${x.concepto}` : x.concepto,
  hora: `${fechaLocal(x.creadoEn, zona) === fechaLocal(new Date(), zona) ? "Hoy" : fechaLocal(x.creadoEn, zona).slice(8, 10) + "/" + fechaLocal(x.creadoEn, zona).slice(5, 7)}, ${horaCorta(x.creadoEn, zona)}`,
});

/**
 * Al abrir la caja, los pendientes pasan al turno nuevo como movimientos normales, con su hora original.
 * Se hace dentro de la misma transacción que abre la caja, así nadie más los toma.
 */
export async function aplicarPendientes(tx: Tx, barberiaId: string, turnoId: string, responsableId: string | null, zona: string) {
  const xs = await pendientesCaja(barberiaId, responsableId, tx);
  for (const x of xs) {
    const [tomado] = await tx.update(s.movimientosPendientes).set({ aplicadoTurnoId: turnoId, aplicadoEn: new Date() })
      .where(and(eq(s.movimientosPendientes.id, x.id), isNull(s.movimientosPendientes.aplicadoTurnoId))).returning({ id: s.movimientosPendientes.id });
    if (!tomado) continue;
    if (x.tipo === "gasto") await tx.insert(s.gastos).values({ barberiaId, categoria: x.categoria ?? "Otros", concepto: x.concepto, monto: x.monto, metodo: "efectivo", turnoId, usuarioId: x.usuarioId, fecha: fechaLocal(x.creadoEn, zona), creadoEn: x.creadoEn });
    else await tx.insert(s.movimientosCaja).values({ barberiaId, turnoId, tipo: x.tipo === "entrada" ? "entrada" : "retiro", monto: x.monto, concepto: x.concepto, usuarioId: x.usuarioId, creadoEn: x.creadoEn });
  }
  return xs;
}
