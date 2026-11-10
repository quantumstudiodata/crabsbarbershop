"use server";

import { randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { comisionDeServicio, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, reglasDe, cajaOAbrir } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { aplicarPromos, momentoEn, type Promo } from "@/lib/promociones";

export type EstadoCobro = { ok?: boolean; error?: string; folio?: string; total?: number; encuesta?: string | null };

type Entrada = {
  clave: string;
  lineas: { servicioId: string; barberoId: string }[];
  descuento: number;
  motivoDescuento: string;
  pagos: { metodoId: string; monto: number }[];
  propina: { monto: number; barberoId: string; efectivo: boolean };
  observaciones: string;
  codigo: string;
  citaId: string;
};

const entero = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

function leer(form: FormData): Entrada | null {
  try {
    const d = JSON.parse(String(form.get("datos") ?? ""));
    const e: Entrada = {
      clave: String(d.clave ?? "").slice(0, 64),
      lineas: Array.isArray(d.lineas) ? d.lineas.slice(0, 20).map((l: { servicioId: unknown; barberoId: unknown }) => ({ servicioId: String(l.servicioId), barberoId: String(l.barberoId) })) : [],
      descuento: entero(d.descuento) ?? -1,
      motivoDescuento: String(d.motivoDescuento ?? "").trim().slice(0, 200),
      pagos: Array.isArray(d.pagos) ? d.pagos.slice(0, 3).map((p: { metodoId: unknown; monto: unknown }) => ({ metodoId: String(p.metodoId), monto: entero(p.monto) ?? -1 })) : [],
      propina: { monto: entero(d.propina?.monto) ?? -1, barberoId: String(d.propina?.barberoId ?? ""), efectivo: d.propina?.efectivo !== false },
      observaciones: String(d.observaciones ?? "").trim().slice(0, 300),
      codigo: String(d.codigo ?? "").trim().slice(0, 30),
      citaId: /^[0-9a-f-]{36}$/.test(String(d.citaId ?? "")) ? String(d.citaId) : "",
    };
    if (!e.clave || e.descuento < 0 || e.propina.monto < 0 || e.pagos.some((p) => p.monto < 0)) return null;
    return e;
  } catch {
    return null;
  }
}

export async function registrarVenta(_: EstadoCobro, form: FormData): Promise<EstadoCobro> {
  const s = await requerirSesion();
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) return { error: "No tienes permiso para cobrar." };
  const bId = s.barberia.id;
  const e = leer(form);
  if (!e) return { error: "No se pudo leer la venta. Recarga la página e intenta otra vez." };
  if (e.lineas.length === 0) return { error: "Elige al menos un servicio." };

  // ¿Ya se guardó esta misma venta (doble clic)?
  const [previa] = await db.select({ folio: schema.ventas.folio, total: schema.ventas.total, tokenEncuesta: schema.ventas.tokenEncuesta }).from(schema.ventas)
    .where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
  if (previa) return { ok: true, folio: previa.folio, total: previa.total, encuesta: previa.tokenEncuesta };

  const turno = await cajaOAbrir(s);
  if (!turno) return { error: "La caja está cerrada. Hay que abrirla antes de cobrar." };
  // Pasadas las 12 de la noche, la caja del día anterior tiene que cerrarse antes de seguir cobrando.
  if (s.barberia.corteObligatorio && turno.fechaOperativa < fechaLocal(new Date(), s.barberia.zonaHoraria)) return { error: "La caja de ayer no se cerró. Haz el corte de caja antes de seguir cobrando." };

  // Precios siempre desde la base de datos, nunca desde el navegador.
  const ids = [...new Set(e.lineas.map((l) => l.servicioId))];
  const svc = await db.select().from(schema.servicios).where(and(eq(schema.servicios.barberiaId, bId), eq(schema.servicios.activo, true), inArray(schema.servicios.id, ids)));
  if (svc.length !== ids.length) return { error: "Uno de los servicios ya no está disponible. Recarga la página." };
  const equipo = new Set((await equipoQueAtiende(bId)).map((u) => u.id));
  for (const l of e.lineas) {
    if (!equipo.has(l.barberoId)) return { error: "Elige quién atendió." };
    if (l.barberoId !== s.usuario.id && !s.puede("ventas.registrar_otros")) return { error: "Solo puedes registrar tus propios servicios." };
  }

  const lineas = e.lineas.map((l) => ({ ...l, s: svc.find((x) => x.id === l.servicioId)! }));
  const subtotal = lineas.reduce((a, l) => a + l.s.precio, 0);
  // Promociones: se recalculan aquí con la hora del negocio; lo que mande el navegador no cuenta.
  const promos = s.barberia.usaPromociones
    ? (await db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, bId))) as unknown as Promo[]
    : [];
  const ap = aplicarPromos(promos, lineas.map((l) => ({ servicioId: l.servicioId, categoria: l.s.categoria, precio: l.s.precio })), momentoEn(s.barberia.zonaHoraria), e.codigo);
  if (e.codigo && !ap.codigoValido) return { error: "Ese código promocional no es válido o ya no está vigente." };
  const promoDe = (i: number) => ap.porLinea[i]?.descuento ?? 0;
  const descPromo = lineas.reduce((a, _, i) => a + promoDe(i), 0);
  const neto = subtotal - descPromo;
  if (e.descuento > 0 && !s.barberia.usaDescuentos) return { error: "Los descuentos están apagados en Ajustes." };
  if (e.propina.monto > 0 && !s.barberia.usaPropinas) return { error: "Las propinas están apagadas en Ajustes." };
  if (e.pagos.filter((x) => x.monto > 0).length > 1 && !s.barberia.usaDividirPago) return { error: "Dividir el pago está apagado en Ajustes." };
  if (e.descuento > neto) return { error: "El descuento no puede ser mayor que la venta." };
  if (e.descuento > 0 && !e.motivoDescuento) return { error: "Escribe el motivo del descuento." };
  const limite = Math.floor((neto * s.barberia.limiteDescuentoPct) / 100);
  if (e.descuento > limite && !s.puede("ventas.descuento")) {
    return { error: `Ese descuento pasa del ${s.barberia.limiteDescuentoPct}% permitido. Pide a quien tenga permiso de aplicar descuentos mayores que lo registre.` };
  }
  const total = neto - e.descuento;
  const nombrePromo = (id?: string) => promos.find((x) => x.id === id)?.nombre ?? "";

  const metodos = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.barberiaId, bId), eq(schema.metodosPago.activo, true)));
  const pagos = e.pagos.filter((p) => p.monto > 0).map((p) => ({ ...p, m: metodos.find((m) => m.id === p.metodoId) }));
  if (pagos.length === 0 && total > 0) return { error: "Elige cómo pagó." };
  if (pagos.some((p) => !p.m)) return { error: "Esa forma de pago ya no está disponible. Recarga la página." };
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  if (pagado !== total) return { error: `Los pagos suman ${formatoDinero(pagado)} y la venta es de ${formatoDinero(total)}.` };
  if (e.propina.monto > 0 && !equipo.has(e.propina.barberoId)) return { error: "Elige para quién es la propina." };

  // Reparte el descuento manual entre los servicios en proporción a lo que queda después de la promoción.
  let restante = e.descuento;
  const reglas = await reglasDe(bId);
  const ahora = new Date();
  const conceptos = lineas.map((l, i) => {
    const promo = promoDe(i);
    const manual = i === lineas.length - 1 ? restante : Math.floor((e.descuento * (l.s.precio - promo)) / Math.max(neto, 1));
    restante -= manual;
    const desc = promo + manual;
    const cobrado = l.s.precio - desc;
    const promocionId = promo > 0 ? ap.porLinea[i]!.promocionId : null;
    const motivo = [promo > 0 ? `Promoción: ${nombrePromo(promocionId ?? undefined)}` : "", manual > 0 ? e.motivoDescuento : ""].filter(Boolean).join(". ");
    const base = copiaRegla(elegirRegla(reglas, l.barberoId, l.servicioId, ahora));
    // Si el servicio tiene comisión especial, sustituye al porcentaje de quien cobra comisión.
    const regla = base && l.s.comision !== null && (base.tipo === "porcentaje" || base.tipo === "mixto") ? { ...base, porcentaje: l.s.comision } : base;
    return {
      barberiaId: bId, servicioId: l.servicioId, nombreServicio: l.s.nombre, barberoId: l.barberoId, precioLista: l.s.precio,
      descuento: desc, motivoDescuento: desc > 0 ? motivo : null, autorizadoPor: desc > 0 ? s.usuario.id : null,
      precioCobrado: cobrado, reglaComision: regla, comision: comisionDeServicio(regla, cobrado), promocionId,
    };
  });

  try {
    // Clave del enlace de la encuesta para el cliente: aleatoria, corta y sin datos de la venta.
    const encuesta = randomBytes(9).toString("base64url");
    const folio = await db.transaction(async (tx) => {
      const [{ n }] = await tx.update(schema.barberias).set({ siguienteFolio: sql`${schema.barberias.siguienteFolio} + 1` })
        .where(eq(schema.barberias.id, bId)).returning({ n: sql<number>`${schema.barberias.siguienteFolio} - 1` });
      const folio = `${s.barberia.folioPrefijo}-${String(n).padStart(6, "0")}`;
      const [v] = await tx.insert(schema.ventas).values({
        barberiaId: bId, folio, turnoId: turno.id, registradaPor: s.usuario.id, total, descuentoTotal: descPromo + e.descuento,
        observaciones: e.observaciones, claveUnica: e.clave, tokenEncuesta: encuesta,
      }).returning({ id: schema.ventas.id });
      await tx.insert(schema.conceptos).values(conceptos.map((c) => ({ ...c, ventaId: v.id })));
      // Si viene de una cita, queda ligada a la venta y completada (una cita no se cobra dos veces).
      if (e.citaId) {
        const r = await tx.update(schema.citas).set({ ventaId: v.id, estado: "completada", estadoPago: "pagada", actualizadoEn: new Date() })
          .where(and(eq(schema.citas.id, e.citaId), eq(schema.citas.barberiaId, bId), sql`${schema.citas.ventaId} is null`)).returning({ id: schema.citas.id });
        if (!r.length) throw new Error("cita_cobrada");
      }
      // Cada promoción usada cuenta una vez por venta; si tiene límite y ya se agotó, no se cobra.
      for (const pid of ap.usadas) {
        const r = await tx.update(schema.promociones).set({ usos: sql`${schema.promociones.usos} + 1` })
          .where(and(eq(schema.promociones.id, pid), sql`(${schema.promociones.limiteUsos} is null or ${schema.promociones.usos} < ${schema.promociones.limiteUsos})`)).returning({ id: schema.promociones.id });
        if (!r.length) throw new Error("promo_agotada");
      }
      if (pagos.length) {
        await tx.insert(schema.pagos).values(pagos.map((p) => ({ barberiaId: bId, ventaId: v.id, metodoPagoId: p.m!.id, nombreMetodo: p.m!.nombre, esEfectivo: p.m!.esEfectivo, monto: p.monto })));
      }
      if (e.propina.monto > 0) {
        await tx.insert(schema.propinas).values({ barberiaId: bId, ventaId: v.id, barberoId: e.propina.barberoId, monto: e.propina.monto, esEfectivo: e.propina.efectivo });
      }
      await registrar(tx, {
        barberiaId: bId, usuarioId: s.usuario.id, tipo: "venta",
        accion: `${s.usuario.nombre} cobró la venta ${folio}`,
        detalle: { folio, total, descuento: e.descuento, motivoDescuento: e.motivoDescuento || undefined, promociones: ap.usadas.map((x) => nombrePromo(x)).join(", ") || undefined },
      });
      return folio;
    });
    revalidatePath("/", "layout");
    return { ok: true, folio, total, encuesta };
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("cita_cobrada")) return { error: "Esa cita ya se cobró." };
    if (msg.includes("promo_agotada")) return { error: "Una promoción llegó a su límite de usos. Recarga la página para cobrar sin ella." };
    if (msg.includes("ventas_clave_uq")) {
      const [v] = await db.select().from(schema.ventas).where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
      if (v) return { ok: true, folio: v.folio, total: v.total, encuesta: v.tokenEncuesta };
    }
    console.error(err);
    return { error: "No se pudo guardar la venta. Revisa tu conexión e intenta otra vez." };
  }
}
