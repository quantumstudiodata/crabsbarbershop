"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { comisionDeServicio, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, reglasDe, turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import { formatoDinero } from "@/lib/money";

export type EstadoCobro = { ok?: boolean; error?: string; folio?: string; total?: number };

type Entrada = {
  clave: string;
  lineas: { servicioId: string; barberoId: string }[];
  descuento: number;
  motivoDescuento: string;
  pagos: { metodoId: string; monto: number }[];
  propina: { monto: number; barberoId: string; efectivo: boolean };
  observaciones: string;
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
  const [previa] = await db.select({ folio: schema.ventas.folio, total: schema.ventas.total }).from(schema.ventas)
    .where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
  if (previa) return { ok: true, folio: previa.folio, total: previa.total };

  const turno = await turnoAbierto(bId);
  if (!turno) return { error: "La caja está cerrada. Ábrela antes de cobrar." };

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
  if (e.descuento > subtotal) return { error: "El descuento no puede ser mayor que la venta." };
  if (e.descuento > 0 && !e.motivoDescuento) return { error: "Escribe el motivo del descuento." };
  const limite = Math.floor((subtotal * s.barberia.limiteDescuentoPct) / 100);
  if (e.descuento > limite && !s.puede("ventas.descuento")) {
    return { error: `Ese descuento pasa del ${s.barberia.limiteDescuentoPct}% permitido. Pide a la encargada o a la dueña que lo registre.` };
  }
  const total = subtotal - e.descuento;

  const metodos = await db.select().from(schema.metodosPago).where(and(eq(schema.metodosPago.barberiaId, bId), eq(schema.metodosPago.activo, true)));
  const pagos = e.pagos.filter((p) => p.monto > 0).map((p) => ({ ...p, m: metodos.find((m) => m.id === p.metodoId) }));
  if (pagos.length === 0 && total > 0) return { error: "Elige cómo pagó." };
  if (pagos.some((p) => !p.m)) return { error: "Esa forma de pago ya no está disponible. Recarga la página." };
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  if (pagado !== total) return { error: `Los pagos suman ${formatoDinero(pagado)} y la venta es de ${formatoDinero(total)}.` };
  if (e.propina.monto > 0 && !equipo.has(e.propina.barberoId)) return { error: "Elige para quién es la propina." };

  // Reparte el descuento entre los servicios en proporción a su precio.
  let restante = e.descuento;
  const reglas = await reglasDe(bId);
  const ahora = new Date();
  const conceptos = lineas.map((l, i) => {
    const desc = i === lineas.length - 1 ? restante : Math.floor((e.descuento * l.s.precio) / Math.max(subtotal, 1));
    restante -= desc;
    const cobrado = l.s.precio - desc;
    const regla = copiaRegla(elegirRegla(reglas, l.barberoId, l.servicioId, ahora));
    return {
      barberiaId: bId, servicioId: l.servicioId, nombreServicio: l.s.nombre, barberoId: l.barberoId, precioLista: l.s.precio,
      descuento: desc, motivoDescuento: desc > 0 ? e.motivoDescuento : null, autorizadoPor: desc > 0 ? s.usuario.id : null,
      precioCobrado: cobrado, reglaComision: regla, comision: comisionDeServicio(regla, cobrado),
    };
  });

  try {
    const folio = await db.transaction(async (tx) => {
      const [{ n }] = await tx.update(schema.barberias).set({ siguienteFolio: sql`${schema.barberias.siguienteFolio} + 1` })
        .where(eq(schema.barberias.id, bId)).returning({ n: sql<number>`${schema.barberias.siguienteFolio} - 1` });
      const folio = `${s.barberia.folioPrefijo}-${String(n).padStart(6, "0")}`;
      const [v] = await tx.insert(schema.ventas).values({
        barberiaId: bId, folio, turnoId: turno.id, registradaPor: s.usuario.id, total, descuentoTotal: e.descuento,
        observaciones: e.observaciones, claveUnica: e.clave,
      }).returning({ id: schema.ventas.id });
      await tx.insert(schema.conceptos).values(conceptos.map((c) => ({ ...c, ventaId: v.id })));
      if (pagos.length) {
        await tx.insert(schema.pagos).values(pagos.map((p) => ({ barberiaId: bId, ventaId: v.id, metodoPagoId: p.m!.id, nombreMetodo: p.m!.nombre, esEfectivo: p.m!.esEfectivo, monto: p.monto })));
      }
      if (e.propina.monto > 0) {
        await tx.insert(schema.propinas).values({ barberiaId: bId, ventaId: v.id, barberoId: e.propina.barberoId, monto: e.propina.monto, esEfectivo: e.propina.efectivo });
      }
      await registrar(tx, {
        barberiaId: bId, usuarioId: s.usuario.id, tipo: "venta",
        accion: `${s.usuario.nombre} cobró la venta ${folio}`,
        detalle: { folio, total, descuento: e.descuento, motivoDescuento: e.motivoDescuento || undefined },
      });
      return folio;
    });
    revalidatePath("/", "layout");
    return { ok: true, folio, total };
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("ventas_clave_uq")) {
      const [v] = await db.select().from(schema.ventas).where(and(eq(schema.ventas.barberiaId, bId), eq(schema.ventas.claveUnica, e.clave))).limit(1);
      if (v) return { ok: true, folio: v.folio, total: v.total };
    }
    console.error(err);
    return { error: "No se pudo guardar la venta. Revisa tu conexión e intenta otra vez." };
  }
}
