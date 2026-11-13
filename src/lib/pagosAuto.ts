import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { instante } from "./agenda";
import { elegirRegla } from "./comisiones";
import { reglasDe, ventasEntre } from "./datos";
import { db, schema as s, type Tx } from "./db";
import { NOMBRE_FORMA_PAGO, cuentaDe, periodoDePago } from "./equipo";
import { fechaCorta, fechaLocal, sumarDias } from "./fechas";
import { registrar } from "./historial";
import { formatoDinero } from "./money";

/** Marca con la que se reconocen los pagos que registró el sistema. */
export const MARCA_AUTO = "Pago automático";
export const MARCA_RENTA = "Renta automática";
/** Comisión ya liquidada que falta entregar en efectivo: se entrega (o se pasa a transferencia) en el corte de caja. */
export const POR_ENTREGAR = "Por entregar de caja";

/**
 * Pagos al equipo automáticos: cada periodo de pago ya vencido se da por pagado en su fecha de pago,
 * por lo que falte (lo registrado a mano cuenta como anticipo). Así Finanzas y la libreta siempre cuadran,
 * aunque nadie registre los pagos. La renta de silla tiene su propio interruptor: se da por cobrada en su fecha límite.
 * Es idempotente: cada periodo se paga una sola vez aunque varias pantallas lo pidan al mismo tiempo.
 */
export const liquidarAutomaticos = cache(async (barberiaId: string, incluirHoy = false) => {
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
      // Primero se calcula todo fuera de la transacción: los cálculos piden sus propias conexiones,
      // y si se hicieran dentro, varias pantallas a la vez agotarían las conexiones y se quedarían esperando entre sí.
      const ultimaSemana = async (q: typeof db | Tx) => (await q.select({ semana: sql<string | null>`max(${s.pagosComision.semana})::text` }).from(s.pagosComision)
        .where(and(eq(s.pagosComision.barberiaId, barberiaId), eq(s.pagosComision.barberoId, p.id), like(s.pagosComision.nota, `%${marca}%`))))[0]?.semana ?? null;
      const ult = await ultimaSemana(db);
      // Se revisa de nuevo el último periodo liquidado: si después se cobró algo más, se liquida solo la diferencia.
      let f = ult && ult >= desdeCuenta ? ult : desdeCuenta;
      const nuevos: { monto: number; semana: string; periodo: string; forma: string; pago: string }[] = [];
      for (let i = 0; i < 90; i++) {
        const per = periodoDePago(r, f);
        if (per.pago > hoy) break;
        // Un periodo que termina hoy se liquida en el corte de caja (con lo vendido en el día), no antes.
        if (per.hasta >= hoy && !incluirHoy) break;
        const desde = per.desde < desdeCuenta ? desdeCuenta : per.desde;
        const { ventas } = await ventasEntre(barberiaId, desde, per.hasta, { zona: b.zona, barberoId: p.id });
        const c = await cuentaDe(barberiaId, p.id, desde, per.hasta, ventas.filter((v) => v.estado === "pagada"));
        const monto = Math.round((renta ? c.rentaPendiente : c.saldo) / 100) * 100;
        if (monto > 0) {
          const efectivo = (r.formaPago ?? "efectivo") === "efectivo";
          const forma = !renta && efectivo ? POR_ENTREGAR : NOMBRE_FORMA_PAGO[r.formaPago ?? "efectivo"] ?? "Efectivo de caja";
          nuevos.push({ monto, semana: per.hasta, forma, pago: per.pago, periodo: desde === per.hasta ? fechaCorta(desde) : `del ${fechaCorta(desde)} al ${fechaCorta(per.hasta)}` });
        }
        f = sumarDias(per.hasta, 1);
        if (f > hoy) break;
      }
      if (!nuevos.length) continue;
      // Transacción corta: solo escribe, y solo si nadie liquidó a esta persona mientras se calculaba.
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`auto-${p.id}`}))`);
        if ((await ultimaSemana(tx)) !== ult) return;
        for (const n of nuevos) {
          await tx.insert(s.pagosComision).values({
            barberiaId, barberoId: p.id, tipo: renta ? "renta" : "pago", monto: n.monto, semana: n.semana,
            nota: `${n.forma}: ${marca} ${n.periodo}`.slice(0, 200), usuarioId: titular ?? p.id,
            creadoEn: new Date(instante(n.pago, 12 * 60, b.zona)),
          });
          await registrar(tx, {
            barberiaId, usuarioId: null, tipo: "equipo",
            accion: renta ? `Se registró automáticamente el cobro de renta de ${formatoDinero(n.monto)} a ${p.nombre}` : `Se registró automáticamente un pago de ${formatoDinero(n.monto)} a ${p.nombre}`,
            detalle: { periodo: n.periodo, forma: n.forma, fechaDePago: n.pago },
          });
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
