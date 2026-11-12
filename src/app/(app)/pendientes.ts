import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";

type Sesion = Awaited<ReturnType<typeof requerirSesion>>;
export type Pendiente = { id: string; tipo: "llegar" | "cobrar" | "pago"; titulo: string; detalle: string; citaId: string; dia: string; tel?: string; enlace?: string; cliente?: string; hora?: string };

const primer = (n: string) => n.trim().split(" ")[0];

/**
 * Lo que falta registrar hoy: citas que ya debían llegar, citas atendidas sin cobrar y pagos en línea recientes.
 * Nada cambia solo: cada pendiente lleva a confirmar con un toque. El barbero ve solo lo suyo.
 */
export async function pendientesDe(s: Sesion, hoy: string, zona: string, persona?: string): Promise<Pendiente[]> {
  if (!s.barberia.usaCitas || !s.puede("citas.ver")) return [];
  const ahora = Date.now();
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  const base = [eq(schema.citas.barberiaId, s.barberia.id), sql`(${schema.citas.inicio} at time zone ${zona})::date = ${hoy}::date`, ...(persona ? [eq(schema.citas.barberoId, persona)] : [])];
  const campos = { token: schema.citas.token, tel: schema.citas.clienteTelefono, id: schema.citas.id, inicio: schema.citas.inicio, fin: schema.citas.fin, estado: schema.citas.estado, cliente: schema.citas.clienteNombre, total: schema.citas.total, pagado: schema.citas.pagado, servicios: schema.citas.servicios, barbero: schema.usuarios.nombre };
  const [tarde, sinCobrar, pagos] = await Promise.all([
    s.puede("citas.modificar") ? db.select(campos).from(schema.citas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
      .where(and(...base, eq(schema.citas.estado, "en_espera"), lt(schema.citas.inicio, new Date(ahora - 5 * 60000)), gt(schema.citas.inicio, new Date(ahora - 3 * 3600000))))
      .orderBy(schema.citas.inicio) : [],
    cobra ? db.select(campos).from(schema.citas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
      .where(and(...base, isNull(schema.citas.ventaId), inArray(schema.citas.estado, ["llego", "en_atencion", "completada"]), sql`(${schema.citas.estado} = 'completada' or ${schema.citas.fin} < now())`))
      .orderBy(schema.citas.inicio) : [],
    db.select({ id: schema.pagosLinea.id, citaId: schema.pagosLinea.citaId, monto: schema.pagosLinea.monto, tarjeta: schema.pagosLinea.tarjeta, cliente: schema.citas.clienteNombre, inicio: schema.citas.inicio })
      .from(schema.pagosLinea).innerJoin(schema.citas, eq(schema.citas.id, schema.pagosLinea.citaId))
      .where(and(eq(schema.pagosLinea.barberiaId, s.barberia.id), eq(schema.pagosLinea.tipo, "cita"), eq(schema.pagosLinea.estado, "pagado"), gt(schema.pagosLinea.pagadoEn, new Date(ahora - 12 * 3600000)),
        inArray(schema.citas.estado, ["en_espera", "apartada"]), ...(persona ? [eq(schema.citas.barberoId, persona)] : [])))
      .orderBy(desc(schema.pagosLinea.pagadoEn)).limit(5),
  ]);
  const hace = (d: Date) => { const m = Math.round((ahora - d.getTime()) / 60000); return m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim(); };
  return [
    ...tarde.map((c) => ({ id: `l-${c.id}`, citaId: c.id, tipo: "llegar" as const, dia: hoy, tel: c.tel, cliente: primer(c.cliente), hora: horaCorta(c.inicio, zona), enlace: s.barberia.slug ? `/reservar/${s.barberia.slug}/cita/${c.token}` : "", titulo: `¿Llegó ${primer(c.cliente)}?`, detalle: `Cita de las ${horaCorta(c.inicio, zona)} con ${primer(c.barbero)}, ${hace(c.inicio)}` })),
    ...sinCobrar.map((c) => ({ id: `c-${c.id}`, citaId: c.id, tipo: "cobrar" as const, dia: hoy, titulo: `Falta cobrar a ${primer(c.cliente)}`, detalle: `${c.servicios.map((x) => x.nombre).join(" y ")} con ${primer(c.barbero)}, ${formatoDinero(Math.max(c.total - c.pagado, 0))}` })),
    ...pagos.map((p) => ({ id: `p-${p.id}`, citaId: p.citaId!, tipo: "pago" as const, dia: fechaLocal(p.inicio, zona), titulo: `${primer(p.cliente)} pagó en línea`, detalle: `${formatoDinero(p.monto)}${p.tarjeta ? ` con ${p.tarjeta}` : ""}, cita ${fechaLocal(p.inicio, zona) === hoy ? "hoy" : new Intl.DateTimeFormat("es-MX", { timeZone: zona, weekday: "short", day: "numeric" }).format(p.inicio).replace(".", "")} ${horaCorta(p.inicio, zona)}` })),
  ];
}
