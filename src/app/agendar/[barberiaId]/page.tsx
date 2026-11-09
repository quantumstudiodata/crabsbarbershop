import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { equipoQueAtiende } from "@/lib/datos";
import { fechaLocal } from "@/lib/fechas";
import { Reserva } from "./Reserva";

export const dynamic = "force-dynamic";

export default async function Agendar({ params }: { params: Promise<{ barberiaId: string }> }) {
  const { barberiaId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(barberiaId)) notFound();
  const [barberia] = await db.select().from(schema.barberias).where(eq(schema.barberias.id, barberiaId)).limit(1);
  if (!barberia || !barberia.agendaActiva || barberia.estadoCuenta !== "activa") notFound();
  const [servicios, equipo] = await Promise.all([
    db.select({ id: schema.servicios.id, nombre: schema.servicios.nombre, duracionMin: schema.servicios.duracionMin, precio: schema.servicios.precio, categoria: schema.servicios.categoria })
      .from(schema.servicios).where(and(eq(schema.servicios.barberiaId, barberiaId), eq(schema.servicios.activo, true))).orderBy(asc(schema.servicios.orden), asc(schema.servicios.nombre)),
    equipoQueAtiende(barberiaId),
  ]);
  return (
    <main className="contenedor agendar-publico">
      <header className="agendar-marca"><span className="lab">CRABS BARBERÍA</span><span className="pill gris">{barberia.nombre}</span></header>
      <div className="agendar-hero">
        <span className="lab">RESERVA EN LÍNEA</span>
        <h1 className="titulo brillo">Agenda tu cita</h1>
        <p>Elige un servicio, una persona y el horario que te acomode. Puedes pagar ahora o al llegar.</p>
      </div>
      {servicios.length && equipo.length
        ? <Reserva barberiaId={barberiaId} servicios={servicios} equipo={equipo.map((p) => ({ id: p.id, nombre: p.nombre }))} fechaInicial={fechaLocal(new Date(), barberia.zonaHoraria)} />
        : <section className="glass panel"><p className="muted">Por ahora no hay servicios o personas disponibles para reservar.</p></section>}
      <footer className="agendar-pie">Al reservar, tus datos se usan para organizar esta cita.</footer>
    </main>
  );
}
