import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { DIAS_TRANSFERENCIA, autoconfirmarTransferencias } from "@/lib/transferencias";

type Sesion = Awaited<ReturnType<typeof requerirSesion>>;
export type Pendiente = { id: string; tipo: "llegar" | "cobrar" | "pago" | "transferencia" | "recordar"; titulo: string; detalle: string; citaId: string; dia: string; tel?: string; enlace?: string; cliente?: string; hora?: string; comprobante?: boolean;
  /** Citas de mañana para recordar por WhatsApp. */
  lista?: { id: string; cliente: string; hora: string; tel: string; enlace: string; con: string }[] };

const primer = (n: string) => n.trim().split(" ")[0];

/**
 * Lo que falta registrar hoy: citas que ya debían llegar, citas atendidas sin cobrar y pagos en línea recientes.
 * Nada cambia solo: cada pendiente lleva a confirmar con un toque. El barbero ve solo lo suyo.
 */
export async function pendientesDe(s: Sesion, hoy: string, zona: string, persona?: string): Promise<Pendiente[]> {
  if (!s.barberia.usaCitas || !s.puede("citas.ver")) return [];
  const ahora = Date.now();
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  // Una cita nunca desaparece sin registrarse: se revisan los últimos 7 días, no solo hoy.
  const base = [eq(schema.citas.barberiaId, s.barberia.id), gt(schema.citas.inicio, new Date(ahora - 7 * 86400000)), ...(persona ? [eq(schema.citas.barberoId, persona)] : [])];
  const TOLERANCIA = 10 * 60000;
  const campos = { token: schema.citas.token, tel: schema.citas.clienteTelefono, id: schema.citas.id, inicio: schema.citas.inicio, fin: schema.citas.fin, estado: schema.citas.estado, cliente: schema.citas.clienteNombre, total: schema.citas.total, pagado: schema.citas.pagado, servicios: schema.citas.servicios, barbero: schema.usuarios.nombre };
  await autoconfirmarTransferencias(s.barberia.id).catch(() => {});
  const transf = s.puede("citas.modificar") ? await db.select({ creado: schema.citas.creadoEn, id: schema.citas.id, cliente: schema.citas.clienteNombre, monto: schema.citas.transferenciaMonto, inicio: schema.citas.inicio, folio: schema.citas.folio, comp: schema.citas.transferenciaComprobanteEn })
    .from(schema.citas).where(and(eq(schema.citas.barberiaId, s.barberia.id), eq(schema.citas.estadoPago, "transferencia"), inArray(schema.citas.estado, ["en_espera", "llego", "en_atencion"]),
      gt(schema.citas.inicio, new Date(ahora - 24 * 3600000)), ...(persona ? [eq(schema.citas.barberoId, persona)] : []))).orderBy(schema.citas.inicio).limit(10) : [];
  const [tarde, sinCobrar, pagos] = await Promise.all([
    s.puede("citas.modificar") ? db.select(campos).from(schema.citas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
      .where(and(...base, eq(schema.citas.estado, "en_espera"), lt(schema.citas.inicio, new Date(ahora - TOLERANCIA))))
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
  // Citas de mañana: se les recuerda por WhatsApp con su enlace para cambiarla si lo necesitan.
  const manana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const deManana = s.puede("citas.modificar") ? await db.select({ id: schema.citas.id, cliente: schema.citas.clienteNombre, tel: schema.citas.clienteTelefono, inicio: schema.citas.inicio, token: schema.citas.token, barbero: schema.usuarios.nombre })
    .from(schema.citas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
    .where(and(eq(schema.citas.barberiaId, s.barberia.id), eq(schema.citas.estado, "en_espera"), sql`(${schema.citas.inicio} at time zone ${zona})::date = ${manana}::date`, ...(persona ? [eq(schema.citas.barberoId, persona)] : [])))
    .orderBy(schema.citas.inicio) : [];
  const hace = (d: Date) => { const m = Math.round((ahora - d.getTime()) / 60000); return m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim(); };
  const dia = (d: Date) => fechaLocal(d, zona) === hoy ? "hoy" : new Intl.DateTimeFormat("es-MX", { timeZone: zona, weekday: "short", day: "numeric" }).format(d).replace(".", "");
  return [
    ...transf.map((c) => ({ id: `t-${c.id}`, citaId: c.id, tipo: "transferencia" as const, dia: fechaLocal(c.inicio, zona), comprobante: !!c.comp, titulo: c.comp ? `${primer(c.cliente)} mandó su comprobante` : `¿Llegó la transferencia de ${primer(c.cliente)}?`, detalle: `${formatoDinero(c.monto)}, cita ${dia(c.inicio)} ${horaCorta(c.inicio, zona)}, concepto ${c.folio}. Si nadie la cambia, se confirma sola el ${new Intl.DateTimeFormat("es-MX", { timeZone: zona, weekday: "long", day: "numeric" }).format(new Date((c.comp ?? c.creado).getTime() + DIAS_TRANSFERENCIA * 86400000))}` })),
    ...tarde.map((c) => { const otroDia = fechaLocal(c.inicio, zona) !== hoy; return { id: `l-${c.id}`, citaId: c.id, tipo: "llegar" as const, dia: fechaLocal(c.inicio, zona), tel: c.tel, cliente: primer(c.cliente), hora: horaCorta(c.inicio, zona), enlace: s.barberia.slug ? `/reservar/${s.barberia.slug}/cita/${c.token}` : "",
      titulo: otroDia ? `Sin registrar: ${primer(c.cliente)}` : `¿Llegó ${primer(c.cliente)}?`,
      detalle: otroDia ? `Cita del ${dia(c.inicio)} a las ${horaCorta(c.inicio, zona)} con ${primer(c.barbero)}. Marca si llegó o no vino` : `Cita de las ${horaCorta(c.inicio, zona)} con ${primer(c.barbero)}, ${hace(c.inicio)}` }; }),
    ...sinCobrar.map((c) => ({ id: `c-${c.id}`, citaId: c.id, tipo: "cobrar" as const, dia: fechaLocal(c.inicio, zona), titulo: `Falta cobrar a ${primer(c.cliente)}`, detalle: `${c.servicios.map((x) => x.nombre).join(" y ")} con ${primer(c.barbero)}${fechaLocal(c.inicio, zona) !== hoy ? `, cita del ${dia(c.inicio)}` : ""}, ${formatoDinero(Math.max(c.total - c.pagado, 0))}` })),
    ...pagos.map((p) => ({ id: `p-${p.id}`, citaId: p.citaId!, tipo: "pago" as const, dia: fechaLocal(p.inicio, zona), titulo: `${primer(p.cliente)} pagó en línea`, detalle: `${formatoDinero(p.monto)}${p.tarjeta ? ` con ${p.tarjeta}` : ""}, cita ${fechaLocal(p.inicio, zona) === hoy ? "hoy" : new Intl.DateTimeFormat("es-MX", { timeZone: zona, weekday: "short", day: "numeric" }).format(p.inicio).replace(".", "")} ${horaCorta(p.inicio, zona)}` })),
    ...(deManana.length ? [{ id: `r-${manana}`, citaId: "", tipo: "recordar" as const, dia: manana, titulo: deManana.length === 1 ? "Recuerda la cita de mañana" : `Recuerda las ${deManana.length} citas de mañana`,
      detalle: "Un mensaje por WhatsApp con su hora y su enlace baja las inasistencias",
      lista: deManana.map((c) => ({ id: c.id, cliente: primer(c.cliente), hora: horaCorta(c.inicio, zona), tel: c.tel, con: primer(c.barbero), enlace: s.barberia.slug ? `/reservar/${s.barberia.slug}/cita/${c.token}` : "" })) }] : []),
  ];
}
