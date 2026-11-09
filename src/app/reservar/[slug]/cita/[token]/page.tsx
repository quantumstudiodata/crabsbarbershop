import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerConfig } from "@/lib/agenda";
import { NOMBRE_ESTADO } from "@/lib/citas";
import { db, schema } from "@/lib/db";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { MiCita } from "./MiCita";

export const metadata: Metadata = { title: "Tu cita", robots: { index: false } };

export default async function PaginaCita({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const [c] = await db.select().from(schema.citas).where(eq(schema.citas.token, token.slice(0, 60))).limit(1);
  if (!c) notFound();
  const [b] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, c.barberiaId)).limit(1);
  if (!b || b.slug !== slug) notFound();
  const [u] = await db.select({ nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios).where(eq(schema.usuarios.id, c.barberoId)).limit(1);
  const config = leerConfig(b.citasConfig);
  const z = b.zonaHoraria;
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
    />
  );
}
