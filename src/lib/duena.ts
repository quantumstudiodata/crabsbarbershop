import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { desdeElDia, diaCortoDe, fechaLocal, horaCorta } from "./fechas";
import { db, schema as s } from "./db";
import { comisionesDeTurno } from "./comisionesCorte";
import { foliosCorte } from "./datos";
import { esLlevoDuena, type MovimientosTurno } from "./caja";

/**
 * Lo que le toca al negocio en un turno: lo cobrado de servicios y productos menos lo del equipo,
 * menos lo que ya le llegó a la dueña sin pasar por la caja (transferencia, tarjeta, QR),
 * menos los gastos pagados con la caja y lo que la dueña ya se llevó de la caja.
 */
export async function leTocaAlNegocio(barberiaId: string, turnoId: string, d: { otrosCobros: number; m: MovimientosTurno; movimientos: { tipo: string; monto: number; concepto: string }[] }) {
  const [ventas, comisiones] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${s.ventas.total}),0)::int` }).from(s.ventas)
      .where(and(eq(s.ventas.barberiaId, barberiaId), eq(s.ventas.turnoId, turnoId), eq(s.ventas.estado, "pagada"))),
    comisionesDeTurno(barberiaId, turnoId),
  ]);
  const equipo = comisiones.reduce((a, x) => a + x.monto, 0);
  // Los pagos no llevan la propina (va aparte), así que lo cobrado por otras formas de pago ya es todo de servicios.
  const llevo = d.movimientos.filter((x) => x.tipo === "retiro" && esLlevoDuena(x.concepto)).reduce((a, x) => a + x.monto, 0);
  return Math.max(0, (ventas[0]?.total ?? 0) - equipo - d.otrosCobros - d.m.gastosDeCaja - llevo);
}

export type ParteDuena = { id: string; turnoId: string | null; monto: number; queda: number; creadoEn: Date; depositos: { id: string; monto: number; creadoEn: Date }[] };
export type DepositoDuena = { id: string; monto: number; creadoEn: Date; usuarioId: string | null; comprobanteNombre: string | null; cubre: { parteId: string; turnoId: string | null; monto: number }[] };

/**
 * Lo que se le debe a la dueña: lo acumulado en cada corte menos lo depositado. Cada depósito cubre primero lo más viejo,
 * así se sabe de qué cortes es cada depósito y desde cuándo está pendiente lo que falta.
 */
export async function cuentaDuena(barberiaId: string) {
  const filas = await db.select({ id: s.negocioDuena.id, tipo: s.negocioDuena.tipo, turnoId: s.negocioDuena.turnoId, monto: s.negocioDuena.monto, creadoEn: s.negocioDuena.creadoEn,
    usuarioId: s.negocioDuena.usuarioId, comprobanteNombre: s.negocioDuena.comprobanteNombre })
    .from(s.negocioDuena).where(and(eq(s.negocioDuena.barberiaId, barberiaId), isNull(s.negocioDuena.anuladoEn)))
    .orderBy(asc(s.negocioDuena.creadoEn));
  const partes: ParteDuena[] = filas.filter((x) => x.tipo === "acumulado" && x.monto > 0).map((x) => ({ id: x.id, turnoId: x.turnoId, monto: x.monto, queda: x.monto, creadoEn: x.creadoEn, depositos: [] }));
  const depositos: DepositoDuena[] = [];
  for (const d of filas.filter((x) => x.tipo === "deposito")) {
    const dep: DepositoDuena = { id: d.id, monto: d.monto, creadoEn: d.creadoEn, usuarioId: d.usuarioId, comprobanteNombre: d.comprobanteNombre, cubre: [] };
    let falta = d.monto;
    for (const p of partes) {
      if (falta <= 0) break;
      if (p.queda <= 0) continue;
      const usa = Math.min(p.queda, falta);
      p.queda -= usa; falta -= usa;
      p.depositos.push({ id: d.id, monto: usa, creadoEn: d.creadoEn });
      dep.cubre.push({ parteId: p.id, turnoId: p.turnoId, monto: usa });
    }
    depositos.push(dep);
  }
  const pendientes = partes.filter((p) => p.queda > 0);
  return { saldo: pendientes.reduce((a, p) => a + p.queda, 0), partes, pendientes, depositos };
}

/** Lo que se le debe a la dueña con el corte de donde viene cada parte ("Lun 16 nov, corte 21:49"), para mostrarlo en la caja. */
export async function datosDuena(barberiaId: string, zona: string) {
  const c = await cuentaDuena(barberiaId);
  const hoy = fechaLocal(new Date(), zona);
  const ids = c.pendientes.map((p) => p.turnoId).filter((x): x is string => !!x);
  const [turnos, folios] = await Promise.all([ids.length ? db.select({ id: s.turnosCaja.id, fecha: s.turnosCaja.fechaOperativa, cerradoEn: s.turnosCaja.cerradoEn }).from(s.turnosCaja).where(inArray(s.turnosCaja.id, ids)) : Promise.resolve([]), foliosCorte(barberiaId)]);
  const partes = c.pendientes.map((p) => {
    const t = turnos.find((x) => x.id === p.turnoId);
    return { texto: t ? `${diaCortoDe(t.fecha, hoy)}, corte ${folios.get(t.id) ?? (t.cerradoEn ? horaCorta(t.cerradoEn, zona) : "")}` : diaCortoDe(fechaLocal(p.creadoEn, zona), hoy), monto: p.queda };
  });
  const primero = c.pendientes[0];
  const diaPrimero = primero ? turnos.find((x) => x.id === primero.turnoId)?.fecha ?? fechaLocal(primero.creadoEn, zona) : hoy;
  return { saldo: c.saldo, desde: c.saldo > 0 ? desdeElDia(diaPrimero, hoy) : "", partes };
}
