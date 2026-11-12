import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerConfig } from "@/lib/agenda";
import { equipoAgenda, NOMBRE_ESTADO } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { pagosLinea } from "@/lib/db/schema";
import { verificarPago } from "@/lib/pagos";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { MiCita } from "./MiCita";

export const metadata: Metadata = { title: "Tu cita", robots: { index: false } };

export default async function PaginaCita({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  let [c] = await db.select().from(schema.citas).where(eq(schema.citas.token, token.slice(0, 60))).limit(1);
  if (!c) notFound();
  // Mientras el anticipo se confirma, el servidor le pregunta a Stripe por si su aviso aún no llega.
  if (c.estado === "apartada") {
    const pend = await db.select().from(pagosLinea).where(and(eq(pagosLinea.citaId, c.id), eq(pagosLinea.estado, "pendiente")));
    for (const p of pend) await verificarPago(p);
    if (pend.length) [c] = await db.select().from(schema.citas).where(eq(schema.citas.id, c.id)).limit(1);
  }
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, c.barberiaId)).limit(1);
  if (!b || b.slug !== slug) notFound();
  const [u] = await db.select({ nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios).where(eq(schema.usuarios.id, c.barberoId)).limit(1);
  const config = leerConfig(b.citasConfig);
  const z = b.zonaHoraria;
  const equipo = config.elegirBarbero ? (await equipoAgenda(b.id)).map((e) => ({ id: e.id, nombre: e.nombre.split(" ")[0], avatar: e.avatar })) : [];
  return (
    <MiCita
      slug={slug} token={token} negocio={b.nombre} hoy={fechaLocal(new Date(), z)} maxDias={config.anticipacionMaxDias}
      cita={{
        folio: c.folio, estado: c.estado, estadoTxt: NOMBRE_ESTADO[c.estado] ?? c.estado, cliente: c.clienteNombre,
        fecha: fechaLocal(c.inicio, z), hora: horaCorta(c.inicio, z), duracion: c.duracionMin, servicios: c.servicios.map((s) => ({ nombre: s.nombre, precio: s.precio - s.descuento })),
        total: c.total, pagado: c.pagado, barbero: u?.nombre.split(" ")[0] ?? "", avatar: u?.avatar ?? "iniciales",
        sePuedeCambiar: c.estado === "en_espera" && c.inicio.getTime() - Date.now() >= config.cancelarHorasAntes * 3600e3,
      }}
      politica={config.politicaCancelacion} horas={config.cancelarHorasAntes}
      equipo={equipo} cualquiera={config.cualquierBarbero} persona={c.indiferente ? "" : c.barberoId}
    />
  );
}
