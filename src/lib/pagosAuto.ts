import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { instante } from "./agenda";
import { elegirRegla } from "./comisiones";
import { reglasDe, ventasEntre } from "./datos";
import { db, schema as s } from "./db";
import { NOMBRE_FORMA_PAGO, cuentaDe, periodoDePago } from "./equipo";
import { fechaCorta, fechaLocal, sumarDias } from "./fechas";
import { registrar } from "./historial";
import { formatoDinero } from "./money";

/** Marca con la que se reconocen los pagos que registró el sistema. */
export const MARCA_AUTO = "Pago automático";
export const MARCA_RENTA = "Renta automática";

/**
 * Pagos al equipo automáticos: cada periodo de pago ya vencido se da por pagado en su fecha de pago,
 * por lo que falte (lo registrado a mano cuenta como anticipo). Así Finanzas y la libreta siempre cuadran,
 * aunque nadie registre los pagos. La renta de silla tiene su propio interruptor: se da por cobrada en su fecha límite.
 * Es idempotente: cada periodo se paga una sola vez aunque varias pantallas lo pidan al mismo tiempo.
 */
export const liquidarAutomaticos = cache(async (barberiaId: string) => {
  const [b] = await db.select({ auto: s.barberias.pagosEquipoAuto, desdePago: s.barberias.pagosEquipoDesde, rentas: s.barberias.rentasAuto, desdeRenta: s.barberias.rentasDesde, zona: s.barberias.zonaHoraria })
    .from(s.barberias).where(eq(s.barberias.id, barberiaId)).limit(1);
  if (!b || (!(b.auto && b.desdePago) && !(b.rentas && b.desdeRenta))) return;
  const hoy = fechaLocal(new Date(), b.zona);
  const reglas = await reglasDe(barberiaId);
  const gente = await db.select({ id: s.usuarios.id, nombre: s.usuarios.nombre, rol: s.usuarios.rol }).from(s.usuarios)
    .where(and(eq(s.usuarios.barberiaId, barberiaId), eq(s.usuarios.activo, true))).orderBy(asc(s.usuarios.creadoEn));
  const titular = gente.find((g) => g.rol === "duena")?.id;
  for (const p of gente.filter((g) => g.rol === "barbera" || g.rol === "encargada")) {
    const r = elegirRegla(reglas, p.id, null, new Date());
    if (!r) continue;
    const renta = r.tipo === "renta";
    // Cada tipo se automatiza con su propio interruptor y desde su propia fecha.
    const desdeCuenta = renta ? (b.rentas ? b.desdeRenta : null) : (b.auto ? b.desdePago : null);
    if (!desdeCuenta) continue;
    const marca = renta ? MARCA_RENTA : MARCA_AUTO;
    try {
      await db.transaction(async (tx) => {
        // Una sola liquidación a la vez por persona.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`auto-${p.id}`}))`);
        const [ult] = await tx.select({ semana: sql<string | null>`max(${s.pagosComision.semana})::text` }).from(s.pagosComision)
          .where(and(eq(s.pagosComision.barberiaId, barberiaId), eq(s.pagosComision.barberoId, p.id), like(s.pagosComision.nota, `%${marca}%`)));
        let f = ult?.semana && ult.semana >= desdeCuenta ? sumarDias(ult.semana, 1) : desdeCuenta;
        for (let i = 0; i < 90; i++) {
          const per = periodoDePago(r, f);
          if (per.pago > hoy) break;
          const desde = per.desde < desdeCuenta ? desdeCuenta : per.desde;
          const { ventas } = await ventasEntre(barberiaId, desde, per.hasta, { zona: b.zona, barberoId: p.id });
          const c = await cuentaDe(barberiaId, p.id, desde, per.hasta, ventas.filter((v) => v.estado === "pagada"));
          const monto = Math.round((renta ? c.rentaPendiente : c.saldo) / 100) * 100;
          if (monto > 0) {
            const forma = NOMBRE_FORMA_PAGO[r.formaPago ?? "efectivo"] ?? "Efectivo de caja";
            const periodo = desde === per.hasta ? fechaCorta(desde) : `del ${fechaCorta(desde)} al ${fechaCorta(per.hasta)}`;
            await tx.insert(s.pagosComision).values({
              barberiaId, barberoId: p.id, tipo: renta ? "renta" : "pago", monto, semana: per.hasta,
              nota: `${forma}: ${marca} ${periodo}`.slice(0, 200), usuarioId: titular ?? p.id,
              creadoEn: new Date(instante(per.pago, 12 * 60, b.zona)),
            });
            await registrar(tx, {
              barberiaId, usuarioId: null, tipo: "equipo",
              accion: renta ? `Se registró automáticamente el cobro de renta de ${formatoDinero(monto)} a ${p.nombre}` : `Se registró automáticamente un pago de ${formatoDinero(monto)} a ${p.nombre}`,
              detalle: { periodo, forma, fechaDePago: per.pago },
            });
          }
          f = sumarDias(per.hasta, 1);
          if (f > hoy) break;
        }
      });
    } catch (err) {
      console.error("pagos_auto", p.id, err);
    }
  }
});

/** Pagos automáticos de unas personas, para mostrarlos marcados en Equipo. */
export async function esAutomatico(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const filas = await db.select({ id: s.pagosComision.id }).from(s.pagosComision).where(and(inArray(s.pagosComision.id, ids), like(s.pagosComision.nota, `%${MARCA_AUTO}%`)));
  return new Set(filas.map((x) => x.id));
}
