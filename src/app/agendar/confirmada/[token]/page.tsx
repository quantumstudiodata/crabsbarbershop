import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { fechaLarga, horaCorta } from "@/lib/fechas";
import { PagoCita } from "./PagoCita";

export const dynamic = "force-dynamic";

export default async function CitaConfirmada({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const [cita] = await db.select().from(schema.citas).where(eq(schema.citas.tokenPublico, token)).limit(1);
  if (!cita) notFound();
  const [[barberia], [barbero]] = await Promise.all([
    db.select({ nombre: schema.barberias.nombre, zona: schema.barberias.zonaHoraria }).from(schema.barberias).where(eq(schema.barberias.id, cita.barberiaId)).limit(1),
    db.select({ nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.id, cita.barberoId)).limit(1),
  ]);
  const pago = cita.estadoPago === "pagada";
  const canc = cita.estado === "cancelada";
  return (
    <main className="contenedor agendar-publico">
      <header className="agendar-marca"><span className="lab">CRABS BARBERÍA</span><span className="pill gris">{barberia?.nombre ?? "Crabs Barbería"}</span></header>
      <section className="glass panel cita-confirmada">
        <span className={`pill ${canc ? "warn" : pago ? "ok" : "gris"}`}>{canc ? "Cita cancelada" : pago ? "Cita pagada" : "Cita reservada"}</span>
        <h1 className="titulo brillo">{canc ? "Tu cita fue cancelada" : `Gracias, ${cita.clienteNombre.split(" ")[0]}`}</h1>
        {!canc && <>
          <p className="muted">Tu horario quedó guardado. Puedes pagar ahora o hacerlo al llegar.</p>
          <div className="cita-detalle">
            <span>Servicio</span><b>{cita.servicioNombre}</b>
            <span>Con</span><b>{barbero?.nombre ?? "Tu barbero"}</b>
            <span>Fecha</span><b>{fechaLarga(fechaLocalSegura(cita.iniciaEn, barberia?.zona ?? "America/Monterrey"))}</b>
            <span>Hora</span><b>{horaCorta(cita.iniciaEn, barberia?.zona ?? "America/Monterrey")}</b>
            <span>Total</span><b>{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(cita.precio / 100)}</b>
            <span>Pago</span><b>{pago ? "Pagado en línea" : cita.estadoPago === "pendiente" ? "Pago en proceso" : cita.estadoPago === "fallida" ? "No se completó; puedes reintentarlo" : "Pendiente; puedes pagar al llegar"}</b>
          </div>
          {!pago && <PagoCita token={token} precio={cita.precio} />}
        </>}
      </section>
      <footer className="agendar-pie">Guarda esta página para consultar tu cita.</footer>
    </main>
  );
}

function fechaLocalSegura(d: Date, zona: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const v = (x: string) => f.find((p) => p.type === x)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}`;
}
