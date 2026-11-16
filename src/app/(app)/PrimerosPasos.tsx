import { and, eq, inArray, sql } from "drizzle-orm";
import type { requerirSesion } from "@/lib/auth";
import { db, schema as t } from "@/lib/db";
import { PasosLinea } from "./PasosLinea";

type Sesion = Awaited<ReturnType<typeof requerirSesion>>;
export type Paso = { id: string; texto: string; detalle: string; href: string; hecho: boolean };

/**
 * Primeros pasos en Inicio, según el puesto: una línea con el avance bajo el saludo. Cada punto se marca solo cuando se hace la operación real.
 * Para Titular es la puesta en marcha del negocio (servicios, equipo, cómo se paga, formas de pago, reservas);
 * para quien atiende, lo básico del día. Desaparece al completarse o al ocultarla.
 */
export async function PrimerosPasos({ s }: { s: Sesion }) {
  if (s.vista) return null;
  const [yo] = await db.select({ v: t.usuarios.consejosVistos }).from(t.usuarios).where(eq(t.usuarios.id, s.usuario.id)).limit(1);
  if ((yo?.v ?? []).includes("primeros-ocultos")) return null;
  const b = s.barberia;
  const cuenta = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const n = sql<number>`count(*)::int`;
  const configura = s.usuario.rol === "duena" || s.puede("configuracion.cobros");
  let pasos: Paso[];
  if (configura) {
    const [servicios, gente, sinRegla, metodos, enLinea, ventas, cortes] = await Promise.all([
      cuenta(db.select({ n }).from(t.servicios).where(and(eq(t.servicios.barberiaId, b.id), eq(t.servicios.activo, true)))),
      cuenta(db.select({ n }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, b.id), eq(t.usuarios.activo, true), inArray(t.usuarios.rol, ["barbera", "encargada"])))),
      cuenta(db.select({ n }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, b.id), eq(t.usuarios.activo, true), inArray(t.usuarios.rol, ["barbera", "encargada"]),
        sql`not exists (select 1 from ${t.reglasComision} r where r.barbero_id = ${t.usuarios.id} and r.vigente_hasta is null)`))),
      cuenta(db.select({ n }).from(t.metodosPago).where(and(eq(t.metodosPago.barberiaId, b.id), eq(t.metodosPago.activo, true), eq(t.metodosPago.esEfectivo, false)))),
      b.usaCitas ? cuenta(db.select({ n }).from(t.citas).where(and(eq(t.citas.barberiaId, b.id), eq(t.citas.origen, "linea")))) : Promise.resolve(0),
      cuenta(db.select({ n }).from(t.ventas).where(eq(t.ventas.barberiaId, b.id))),
      cuenta(db.select({ n }).from(t.turnosCaja).where(and(eq(t.turnosCaja.barberiaId, b.id), eq(t.turnosCaja.estado, "cerrado")))),
    ]);
    pasos = [
      { id: "servicios", texto: "Revisa tus servicios y precios", detalle: "Lo que ofreces, cuánto cuesta y cuánto dura.", href: "/ajustes/servicios", hecho: servicios > 0 },
      { id: "equipo", texto: "Da de alta a tu equipo", detalle: "Cada persona entra con su usuario y su puesto.", href: "/ajustes", hecho: gente > 0 },
      { id: "pago", texto: "Di cómo se le paga a cada quien", detalle: "Comisión, sueldo o renta de silla, y cada cuándo.", href: "/ajustes", hecho: gente > 0 && sinRegla === 0 },
      { id: "formas", texto: "Elige tus formas de pago", detalle: "Efectivo, transferencia, tarjeta o QR.", href: "/ajustes/cobro", hecho: metodos > 0 },
      ...(b.usaCitas ? [{ id: "reservas", texto: "Comparte tu enlace de reservas", detalle: "Los clientes agendan solos; se marca con la primera reserva en línea.", href: "/citas", hecho: enLinea > 0 }] : []),
      { id: "cobro", texto: "Haz tu primer cobro", detalle: "Elige el servicio, quién lo hizo y cómo pagó.", href: "/cobrar", hecho: ventas > 0 },
      { id: "corte", texto: "Haz tu primer corte de caja", detalle: "Al terminar el día se cuenta el efectivo y se cierra la caja.", href: "/cobrar?caja=cerrar", hecho: cortes > 0 },
    ];
  } else {
    const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
    if (!cobra) return null;
    const [ventas, abiertas, cortes] = await Promise.all([
      cuenta(db.select({ n }).from(t.ventas).where(and(eq(t.ventas.barberiaId, b.id), eq(t.ventas.registradaPor, s.usuario.id)))),
      cuenta(db.select({ n }).from(t.turnosCaja).where(and(eq(t.turnosCaja.barberiaId, b.id), eq(t.turnosCaja.abiertoPor, s.usuario.id)))),
      cuenta(db.select({ n }).from(t.turnosCaja).where(and(eq(t.turnosCaja.barberiaId, b.id), eq(t.turnosCaja.cerradoPor, s.usuario.id)))),
    ]);
    pasos = [
      ...(s.puede("caja.operar") ? [{ id: "abrir", texto: "Abre la caja", detalle: "Cuenta con cuánto efectivo empiezas el día.", href: "/cobrar", hecho: abiertas > 0 }] : []),
      { id: "cobro", texto: "Cobra tu primer servicio", detalle: "Elige el servicio y cómo pagó el cliente.", href: "/cobrar", hecho: ventas > 0 },
      ...(s.puede("caja.operar") ? [{ id: "corte", texto: "Haz un corte de caja", detalle: "Al terminar el día se cuenta el efectivo y se cierra la caja.", href: "/cobrar?caja=cerrar", hecho: cortes > 0 }] : []),
    ];
  }
  const hechos = pasos.filter((p) => p.hecho).length;
  if (!pasos.length || hechos === pasos.length) return null;
  // Una línea bajo el saludo con el avance; al tocarla se abre la lista en una ventana.
  return <PasosLinea pasos={pasos} titular={configura} />;
}
