import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { leerConfig } from "@/lib/agenda";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";
import { pagosDisponibles } from "@/lib/stripe";
import { PagosLinea } from "../cobro/PagosLinea";

export const metadata = { title: "Pagos en línea" };

export default async function PagosEnLinea({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("configuracion.cobros") || !pagosDisponibles()) redirect("/ajustes/cobro");
  const q = await searchParams;
  const b = s.barberia;
  const estado = ((b.stripeEstado as "sin" | "pendiente" | "activa") ?? "sin");
  const [m] = await db.select({
    cobrado: sql<number>`coalesce(sum(${schema.pagosLinea.monto} + ${schema.pagosLinea.propina}), 0)::int`,
    qr: sql<number>`count(*) filter (where ${schema.pagosLinea.tipo} = 'venta')::int`,
    anticipos: sql<number>`count(*) filter (where ${schema.pagosLinea.tipo} = 'cita')::int`,
  }).from(schema.pagosLinea)
    .where(and(eq(schema.pagosLinea.barberiaId, b.id), eq(schema.pagosLinea.estado, "pagado"), sql`${schema.pagosLinea.pagadoEn} >= date_trunc('month', now())`));
  const p = leerConfig(b.citasConfig).pago;
  const anticipo = !b.usaCitas ? "Agenda apagada" : p.modo === "anticipo_pct" ? `${p.valor / 100}% al reservar` : p.modo === "anticipo_fijo" ? `${formatoDinero(p.valor)} al reservar` : p.modo === "completo" ? "Pago completo al reservar" : p.modo === "opcional" ? "Opcional" : "No se pide";
  return (
    <>
      <div>
        <h1 className="titulo">Pagos en línea</h1>
        <p className="sub">Cobros con tarjeta desde el teléfono del cliente.</p>
      </div>
      <PagosLinea estado={estado} revisar={q.stripe === "volver" || q.stripe === "reintentar" || estado === "pendiente"} puede={!s.vista}
        mes={m ?? { cobrado: 0, qr: 0, anticipos: 0 }} usos={{ qr: estado === "activa", anticipo }} />
    </>
  );
}
