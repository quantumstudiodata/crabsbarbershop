import { and, eq, gte, lte } from "drizzle-orm";
import { describirRegla, elegirRegla, porSemana, type ReglaCopia } from "@/lib/comisiones";
import { copiaRegla, reglasDe, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, finDeMes, lunesDe, sumarDias } from "@/lib/fechas";
import { faltantesDe } from "@/lib/faltantes";
import { formatoDinero } from "@/lib/money";

type Ventas = Awaited<ReturnType<typeof ventasEntre>>["ventas"];

/** Cuenta de una persona en el periodo: lo que le corresponde, lo pagado y su renta. */
export async function cuentaDe(barberiaId: string, id: string, desde: string, hasta: string, pagadas: Ventas) {
  const [reglas, pagos, falt] = await Promise.all([
    reglasDe(barberiaId),
    db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, barberiaId), eq(schema.pagosComision.barberoId, id), gte(schema.pagosComision.semana, lunesDe(desde)), lte(schema.pagosComision.semana, hasta))),
    faltantesDe(barberiaId, desde, hasta),
  ]);
  const faltantes = falt.find((x) => x.usuarioId === id)?.monto ?? 0;
  const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === id));
  const regla = copiaRegla(elegirRegla(reglas, id, null, new Date()));
  const semanas = Math.max(1, Math.ceil((diasEntre(lunesDe(desde), hasta) + 1) / 7));
  const sueldo = regla && (regla.tipo === "sueldo" || regla.tipo === "mixto") ? porSemana(regla.montoSemanal, regla.periodo) * semanas : 0;
  const renta = regla?.tipo === "renta" ? porSemana(regla.montoSemanal, regla.periodo) * semanas : 0;
  const comision = regla?.tipo === "renta" ? 0 : cs.reduce((a, c) => a + c.comision, 0);
  const pagado = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentaPagada = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  return {
    regla, forma: describirRegla(regla, formatoDinero), vendido: cs.reduce((a, c) => a + c.precioCobrado, 0),
    comision, sueldo, corresponde: comision + sueldo, pagado, faltantes, saldo: Math.max(comision + sueldo - pagado - faltantes, 0),
    renta, rentaPagada, rentaPendiente: Math.max(renta - rentaPagada, 0), pagos,
  };
}

export const NOMBRE_FRECUENCIA: Record<string, string> = { semana: "Semanal", quincena: "Quincenal", mes: "Mensual" };

/** El periodo de pago en curso según la periodicidad de la persona. */
export function periodoDePago(periodo: string | undefined, hoy: string): { desde: string; hasta: string } {
  if (periodo === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: finDeMes(hoy) };
  if (periodo === "quincena") return Number(hoy.slice(8)) <= 15 ? { desde: `${hoy.slice(0, 7)}-01`, hasta: `${hoy.slice(0, 7)}-15` } : { desde: `${hoy.slice(0, 7)}-16`, hasta: finDeMes(hoy) };
  const l = lunesDe(hoy);
  return { desde: l, hasta: sumarDias(l, 6) };
}

/** Modalidad corta para las filas: "Comisión 50%", "Sueldo más 10%", "Renta de silla". */
export function modalidadCorta(r: ReglaCopia | null): string {
  if (!r) return "Sin forma de pago";
  const pct = `${r.porcentaje / 100}%`;
  switch (r.tipo) {
    case "porcentaje": return `Comisión ${pct}`;
    case "fijo": return `${formatoDinero(r.montoFijo)} por servicio`;
    case "renta": return "Renta de silla";
    case "sueldo": return "Sueldo fijo";
    case "mixto": return `Sueldo más ${pct}`;
  }
}

/** Rendimiento por persona en un periodo: ventas atribuidas (lo cobrado por sus servicios), servicios, transacciones y servicios más hechos. */
export function rendimiento(ventas: Ventas, id?: string) {
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => !id || c.barberoId === id));
  const vendido = cs.reduce((a, c) => a + c.precioCobrado, 0);
  const transacciones = new Set(cs.map((c) => c.ventaId)).size;
  const porServicio = new Map<string, { nombre: string; veces: number; monto: number }>();
  for (const c of cs) {
    const x = porServicio.get(c.nombre) ?? { nombre: c.nombre, veces: 0, monto: 0 };
    x.veces++; x.monto += c.precioCobrado; porServicio.set(c.nombre, x);
  }
  return {
    vendido, servicios: cs.length, transacciones, ticket: transacciones ? Math.round(vendido / transacciones / 100) * 100 : 0,
    top: [...porServicio.values()].sort((a, b) => b.veces - a.veces || b.monto - a.monto),
  };
}
