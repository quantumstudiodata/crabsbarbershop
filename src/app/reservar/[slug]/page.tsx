import { and, asc, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { cobraEnLinea } from "@/lib/stripe";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerConfig, montoAPagar } from "@/lib/agenda";
import { equipoAgenda } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { aplicarPromos, momentoEn, type Promo } from "@/lib/promociones";
import { Reservar } from "./Reservar";

async function cargar(slug: string) {
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.slug, slug.slice(0, 40))).limit(1);
  return b ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await cargar((await params).slug);
  return { title: b ? `Reservar en ${b.nombre}` : "Reservaciones", description: b ? `Agenda tu cita en ${b.nombre} en línea.` : undefined };
}

export default async function PaginaReservar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ desde?: string }> }) {
  const b = await cargar((await params).slug);
  const desde = (await searchParams).desde;
  const regreso = desde === "ajustes" ? { href: "/ajustes/citas?tab=reservaciones", texto: "Regresar a Ajustes" } : desde === "agenda" ? { href: "/citas", texto: "Regresar a la agenda" } : null;
  if (!b) notFound();
  const config = leerConfig(b.citasConfig);
  if (!b.usaCitas || !config.enLinea || b.estadoCuenta !== "activa") {
    return (
      <main className="reserva">
        {regreso && <a href={regreso.href} className="rv-regreso">{regreso.texto}</a>}
        <header className="rv-cab"><b>{b.nombre}</b></header>
        <section className="rv-tarjeta"><h1>Las reservaciones en línea no están disponibles</h1><p className="muted">Comunícate directamente con el negocio para agendar tu cita.</p></section>
      </main>
    );
  }
  const [servicios, cats, equipo, promos, [cal], [buena]] = await Promise.all([
    db.select().from(schema.servicios).where(and(eq(schema.servicios.barberiaId, b.id), eq(schema.servicios.activo, true))).orderBy(asc(schema.servicios.orden), asc(schema.servicios.nombre)),
    db.select().from(schema.categoriasServicio).where(and(eq(schema.categoriasServicio.barberiaId, b.id), isNull(schema.categoriasServicio.eliminadoEn))).orderBy(asc(schema.categoriasServicio.orden)),
    equipoAgenda(b.id),
    b.usaPromociones ? db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, b.id)) : Promise.resolve([]),
    // Para el inicio: calificación de los clientes y una reseña reciente buena, sin el nombre de quien la escribió.
    db.select({ n: sql<number>`count(*)::int`, prom: sql<number>`coalesce(avg(${schema.resenas.calificacion}), 0)::float` }).from(schema.resenas).where(eq(schema.resenas.barberiaId, b.id)),
    db.select({ c: schema.resenas.comentario }).from(schema.resenas).where(and(eq(schema.resenas.barberiaId, b.id), gte(schema.resenas.calificacion, 4), ne(schema.resenas.comentario, ""))).orderBy(desc(schema.resenas.creadoEn)).limit(1),
  ]);
  const ocultas = new Set(cats.filter((c) => !c.activo).map((c) => c.nombre));
  const visibles = servicios.filter((s) => !ocultas.has(s.categoria));
  const orden = cats.map((c) => c.nombre);
  // Precio con promoción automática en línea, como referencia (el precio final se calcula con el día y la hora).
  const m = momentoEn(b.zonaHoraria);
  const conPromo = visibles.map((s) => {
    const ap = aplicarPromos(promos as unknown as Promo[], [{ servicioId: s.id, categoria: s.categoria, precio: s.precio }], { ...m, hora: "12:00" }, "", "linea");
    const d = ap.porLinea[0]?.descuento ?? 0;
    const promo = d ? (promos as unknown as Promo[]).find((x) => x.id === ap.porLinea[0]!.promocionId) : null;
    return { id: s.id, nombre: s.nombre, descripcion: s.descripcion, categoria: s.categoria, precio: s.precio, duracionMin: s.duracionMin || 30, promo: promo ? { nombre: promo.nombre, precio: s.precio - d } : null };
  });
  return (
    <Reservar
      slug={b.slug!} negocio={b.nombre} hoy={fechaLocal(new Date(), b.zonaHoraria)}
      servicios={conPromo.sort((a, c) => orden.indexOf(a.categoria) - orden.indexOf(c.categoria))}
      equipo={equipo.map((e) => ({ id: e.id, nombre: e.nombre.split(" ")[0], avatar: e.avatar }))}
      opciones={{ elegir: config.elegirBarbero, cualquiera: config.cualquierBarbero, varios: config.variosServicios, maxDias: config.anticipacionMaxDias }}
      pago={{ modo: config.pago.modo, ejemplo: montoAPagar(10000, config.pago), politica: config.politicaCancelacion, reembolso: config.politicaReembolso, regla: config.pago, apartarMin: config.apartarMin }}
      cuenta={b.transferenciaClabe ? { banco: b.transferenciaBanco, clabe: b.transferenciaClabe, titular: b.transferenciaTitular } : null}
      enLinea={cobraEnLinea(b) ? { llave: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, cuenta: b.stripeCuenta! } : null}
      regreso={regreso}
      inicio={{ horario: b.horario, cerrados: b.diasCerrados ?? [], zona: b.zonaHoraria, whatsapp: b.whatsapp, resenas: cal?.n ? { promedio: cal.prom, n: cal.n, comentario: (buena?.c ?? "").slice(0, 160) } : null }}
    />
  );
}
