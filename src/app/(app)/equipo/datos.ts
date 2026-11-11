import { and, asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { elegirRegla } from "@/lib/comisiones";
import { reglasDe, ventasEntre } from "@/lib/datos";
import { NOMBRE_FORMA_PAGO, NOMBRE_FRECUENCIA, cuentaDe, frecuenciaDe, modalidadCorta, periodoDePago } from "@/lib/equipo";
import { fechaCorta, fechaLarga, fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { periodoMes } from "@/lib/periodo";
import { liquidarAutomaticos } from "@/lib/pagosAuto";

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

/** Cuenta del periodo de pago en curso de cada persona: lo que se le debe (o debe de renta) y su desglose. */
export async function cuentasEnCurso(barberiaId: string, zona: string, personas: { id: string; nombre: string; avatar: string }[], puedePagar: boolean) {
  await liquidarAutomaticos(barberiaId);
  const hoy = fechaLocal(new Date(), zona);
  const [cfg] = await db.select({ desde: s.barberias.pagosEquipoDesde, desdeRenta: s.barberias.rentasDesde }).from(s.barberias).where(eq(s.barberias.id, barberiaId)).limit(1);
  const reglas = await reglasDe(barberiaId);
  const periodos = new Map(personas.map((p) => { const r = elegirRegla(reglas, p.id, null, new Date()); return [p.id, { r, per: periodoDePago(r, hoy) }]; }));
  const inicio = [...[...periodos.values()].map((x) => x.per.desde), hoy].sort()[0];
  const { ventas } = await ventasEntre(barberiaId, inicio, hoy, { zona });
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  // Desde cuándo se lleva la cuenta de cada persona: su primera forma de pago (como máximo, un año atrás).
  const tope = fechaLocal(new Date(Date.now() - 365 * 86400000), zona);
  const desdeRegla = new Map((await db.select({ id: s.reglasComision.barberoId, desde: sql<Date>`min(${s.reglasComision.vigenteDesde})` }).from(s.reglasComision)
    .where(eq(s.reglasComision.barberiaId, barberiaId)).groupBy(s.reglasComision.barberoId)).map((x) => [x.id, fechaLocal(new Date(x.desde), zona)]));
  return Promise.all(personas.map(async (p) => {
    const { r, per } = periodos.get(p.id)!;
    const hasta = per.hasta > hoy ? hoy : per.hasta;
    const c = await cuentaDe(barberiaId, p.id, per.desde, hasta, pagadas.filter((v) => v.fecha >= per.desde && v.fecha <= hasta));
    const renta = c.regla?.tipo === "renta";
    // Lo pendiente se acumula: lo que no se pagó en periodos anteriores se suma hasta que se registre un pago.
    // Con pagos automáticos (o una cuenta iniciada en cero), lo anterior a esa fecha ya no se acumula.
    const inicioCuenta = [desdeRegla.get(p.id) ?? per.desde, tope, (renta ? cfg?.desdeRenta : cfg?.desde) ?? tope].sort()[2];
    const acum = inicioCuenta < per.desde
      ? await cuentaDe(barberiaId, p.id, inicioCuenta, hoy, (await ventasEntre(barberiaId, inicioCuenta, hoy, { zona, barberoId: p.id })).ventas.filter((v) => v.estado === "pagada"))
      : c;
    // Se redondea a pesos: lo que se paga al equipo no lleva centavos.
    const saldo = Math.round((renta ? acum.rentaPendiente : acum.saldo) / 100) * 100;
    const saldoPeriodo = renta ? c.rentaPendiente : c.saldo;
    const anteriores = Math.max(saldo - saldoPeriodo, 0);
    const pagado = renta ? c.rentaPagada : c.pagado;
    const periodo = per.desde === per.hasta ? fechaLarga(per.desde) : `Del ${fechaCorta(per.desde)} al ${fechaCorta(per.hasta)}`;
    const frecuencia = NOMBRE_FRECUENCIA[frecuenciaDe(r)] ?? "Semanal";
    const fila = {
      id: p.id, nombre: p.nombre, avatar: p.avatar, modalidad: modalidadCorta(c.regla), frecuencia, forma: r?.formaPago ?? "efectivo",
      periodo, semana: hoy, renta, monto: formatoDinero(saldo), parcial: pagado > 0 && saldo > 0,
      estado: saldo <= 0 ? (renta ? "Cubierta" : "Al corriente") : pagado > 0 ? "Pago parcial" : "Pendiente",
      puedePagar: puedePagar && saldo > 0,
      detalle: (renta
        ? [["Periodo", periodo], ["Fecha límite", fechaLarga(per.pago)], ["Renta del periodo", formatoDinero(c.renta)], ["Recibido", formatoDinero(c.rentaPagada)],
          ...(anteriores ? [["De periodos anteriores", formatoDinero(anteriores)]] : []), ["Pendiente", formatoDinero(saldo)]]
        : [["Periodo", periodo], ["Fecha de pago", fechaLarga(per.pago)], ["Forma de pago", NOMBRE_FORMA_PAGO[r?.formaPago ?? "efectivo"] ?? "Efectivo de caja"], ["Ventas atribuidas", formatoDinero(c.vendido)],
          ...(c.comision ? [["Comisión generada", formatoDinero(c.comision)]] : []), ...(c.sueldo ? [["Sueldo del periodo", formatoDinero(c.sueldo)]] : []),
          ["Pagos registrados", formatoDinero(c.pagado)], ...(c.faltantes ? [["Faltantes autorizados", `−${formatoDinero(c.faltantes)}`]] : []),
          ...(anteriores ? [["De periodos anteriores", formatoDinero(anteriores)]] : []), ["Saldo pendiente", formatoDinero(saldo)]]) as [string, string][],
    };
    return { id: p.id, renta, saldo, anteriores, fila, sinRegla: !c.regla, pago: per.pago, frecuencia, modalidad: modalidadCorta(c.regla) };
  }));
}
