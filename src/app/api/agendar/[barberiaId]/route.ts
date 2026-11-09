import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { equipoQueAtiende } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diaDeSemana, esFechaValida, fechaLocal, sumarDias } from "@/lib/fechas";
import { fechaHoraEnZona, inicioDelDiaEnZona, slotsDisponibles, type HorarioAgenda } from "@/lib/agenda";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const texto = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

async function contexto(barberiaId: string) {
  if (!UUID.test(barberiaId)) return null;
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, barberiaId)).limit(1);
  if (!b || !b.agendaActiva || b.estadoCuenta !== "activa") return null;
  return b;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ barberiaId: string }> }) {
  const { barberiaId } = await params;
  const b = await contexto(barberiaId);
  if (!b) return NextResponse.json({ error: "La agenda no está disponible." }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const servicioId = q.get("servicioId") ?? "";
  const barberoId = q.get("barberoId") ?? "";
  const fecha = q.get("fecha") ?? "";
  if (!UUID.test(servicioId) || !UUID.test(barberoId) || !esFechaValida(fecha)) return NextResponse.json({ error: "Elige un servicio, una persona y una fecha válida." }, { status: 400 });
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  if (fecha < hoy || fecha > sumarDias(hoy, 60)) return NextResponse.json({ error: "Elige una fecha dentro de los próximos 60 días." }, { status: 400 });
  const [[servicio], equipo] = await Promise.all([
    db.select({ id: schema.servicios.id, duracionMin: schema.servicios.duracionMin }).from(schema.servicios)
      .where(and(eq(schema.servicios.id, servicioId), eq(schema.servicios.barberiaId, barberiaId), eq(schema.servicios.activo, true))).limit(1),
    equipoQueAtiende(barberiaId),
  ]);
  if (!servicio || !equipo.some((p) => p.id === barberoId)) return NextResponse.json({ error: "El servicio o la persona ya no están disponibles." }, { status: 404 });
  const desde = inicioDelDiaEnZona(fecha, b.zonaHoraria);
  const hasta = inicioDelDiaEnZona(sumarDias(fecha, 1), b.zonaHoraria);
  const reservas = await db.select({ iniciaEn: schema.citas.iniciaEn, terminaEn: schema.citas.terminaEn, estado: schema.citas.estado })
    .from(schema.citas)
    .where(and(eq(schema.citas.barberiaId, barberiaId), eq(schema.citas.barberoId, barberoId), gte(schema.citas.iniciaEn, desde), lt(schema.citas.iniciaEn, hasta), ne(schema.citas.estado, "cancelada")));
  const slots = slotsDisponibles({ fecha, zona: b.zonaHoraria, horario: b.horarioAgenda as HorarioAgenda, duracionMin: servicio.duracionMin, reservas });
  return NextResponse.json({ slots });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ barberiaId: string }> }) {
  const { barberiaId } = await params;
  const b = await contexto(barberiaId);
  if (!b) return NextResponse.json({ error: "La agenda no está disponible." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "No se pudo leer la reserva." }, { status: 400 }); }
  const servicioId = texto(body.servicioId, 36);
  const barberoId = texto(body.barberoId, 36);
  const fecha = texto(body.fecha, 10);
  const hora = texto(body.hora, 5);
  const clienteNombre = texto(body.clienteNombre, 100);
  const clienteTelefono = texto(body.clienteTelefono, 25);
  const clienteEmail = texto(body.clienteEmail, 200).toLowerCase() || null;
  if (!UUID.test(servicioId) || !UUID.test(barberoId) || !esFechaValida(fecha) || !/^\d{2}:\d{2}$/.test(hora) || !clienteNombre || !/^\+?[\d\s().-]{8,25}$/.test(clienteTelefono)) {
    return NextResponse.json({ error: "Revisa el nombre, teléfono, servicio, persona y horario." }, { status: 400 });
  }
  if (clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail)) return NextResponse.json({ error: "Escribe un correo válido o deja el campo vacío." }, { status: 400 });
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  if (fecha < hoy || fecha > sumarDias(hoy, 60)) return NextResponse.json({ error: "Elige una fecha dentro de los próximos 60 días." }, { status: 400 });

  const [[servicio], equipo] = await Promise.all([
    db.select().from(schema.servicios).where(and(eq(schema.servicios.id, servicioId), eq(schema.servicios.barberiaId, barberiaId), eq(schema.servicios.activo, true))).limit(1),
    equipoQueAtiende(barberiaId),
  ]);
  const barbero = equipo.find((p) => p.id === barberoId);
  if (!servicio || !barbero) return NextResponse.json({ error: "El servicio o la persona ya no están disponibles." }, { status: 404 });
  const iniciaEn = fechaHoraEnZona(fecha, hora, b.zonaHoraria);
  const terminaEn = new Date(iniciaEn.getTime() + servicio.duracionMin * 60_000);
  if (iniciaEn <= new Date()) return NextResponse.json({ error: "Ese horario ya pasó. Elige otro." }, { status: 409 });
  const desde = inicioDelDiaEnZona(fecha, b.zonaHoraria);
  const hasta = inicioDelDiaEnZona(sumarDias(fecha, 1), b.zonaHoraria);

  try {
    const cita = await db.transaction(async (tx) => {
      // Serializa reservas simultáneas de la misma persona y el mismo día antes de validar el espacio.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${barberiaId}), hashtext(${barberoId + ":" + fecha}))`);
      const reservas = await tx.select({ iniciaEn: schema.citas.iniciaEn, terminaEn: schema.citas.terminaEn, estado: schema.citas.estado })
        .from(schema.citas)
        .where(and(eq(schema.citas.barberiaId, barberiaId), eq(schema.citas.barberoId, barberoId), gte(schema.citas.iniciaEn, desde), lt(schema.citas.iniciaEn, hasta), ne(schema.citas.estado, "cancelada")));
      const opciones = slotsDisponibles({ fecha, zona: b.zonaHoraria, horario: b.horarioAgenda as HorarioAgenda, duracionMin: servicio.duracionMin, reservas });
      if (!opciones.some((x) => x.iniciaEn === iniciaEn.toISOString())) throw new Error("SLOT_TAKEN");
      const [guardada] = await tx.insert(schema.citas).values({
        barberiaId, servicioId, barberoId, clienteNombre, clienteTelefono, clienteEmail,
        servicioNombre: servicio.nombre, duracionMin: servicio.duracionMin, precio: servicio.precio,
        iniciaEn, terminaEn, estado: "reservada", estadoPago: "sin_pagar",
      }).returning({ id: schema.citas.id, tokenPublico: schema.citas.tokenPublico });
      return guardada;
    });
    return NextResponse.json({ ok: true, token: cita.tokenPublico, precio: servicio.precio, servicio: servicio.nombre, barbero: barbero.nombre, iniciaEn: iniciaEn.toISOString() }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") return NextResponse.json({ error: "Ese horario acaba de ocuparse. Elige otro." }, { status: 409 });
    return NextResponse.json({ error: "No se pudo guardar la cita. Intenta de nuevo." }, { status: 500 });
  }
}
