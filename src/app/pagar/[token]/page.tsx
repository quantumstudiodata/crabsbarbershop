import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { pagosLinea } from "@/lib/db/schema";
import { vencerSiToca, verificarPago } from "@/lib/pagos";
import { stripe } from "@/lib/stripe";
import { formatoDinero } from "@/lib/money";
import { Pagar } from "./Pagar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pago de tu servicio", robots: { index: false } };

type Detalle = { negocio?: string; conceptos?: { nombre: string; con: string; precio: number }[]; propinaFija?: boolean; descuento?: number; cargo?: number };

/** Página que abre el cliente al escanear el QR del cobro. El formulario de tarjeta es de Stripe, dentro de la página. */
export default async function PaginaPago({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = String(token).slice(0, 40);
  let [p] = await db.select().from(pagosLinea).where(eq(pagosLinea.token, t)).limit(1);
  if (!p || p.tipo !== "venta") notFound();
  if (p.estado === "pendiente") { if (!(await vencerSiToca(p))) await verificarPago(p); [p] = await db.select().from(pagosLinea).where(eq(pagosLinea.token, t)).limit(1); }
  const [b] = await db.select({ nombre: schema.barberias.nombre, cuenta: schema.barberias.stripeCuenta, zona: schema.barberias.zonaHoraria }).from(schema.barberias).where(eq(schema.barberias.id, p.barberiaId)).limit(1);
  if (!b) notFound();
  const d = p.detalle as Detalle;
  let secreto: string | null = null;
  if (p.estado === "pendiente" && p.intento && b.cuenta && process.env.STRIPE_SECRET_KEY) {
    const pi = await stripe().paymentIntents.retrieve(p.intento, {}, { stripeAccount: b.cuenta }).catch(() => null);
    secreto = pi && pi.status !== "canceled" && pi.status !== "succeeded" ? pi.client_secret : null;
  }
  let folio: string | null = null, encuesta: string | null = null;
  if (p.ventaId) [{ folio, encuesta }] = await db.select({ folio: schema.ventas.folio, encuesta: schema.ventas.tokenEncuesta }).from(schema.ventas).where(eq(schema.ventas.id, p.ventaId)).limit(1);
  return (
    <Pagar token={p.token} negocio={b.nombre} estado={p.estado} cuenta={b.cuenta ?? ""} secreto={secreto}
      llavePublica={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
      conceptos={(d.conceptos ?? []).map((c) => ({ ...c, precioTxt: formatoDinero(c.precio) }))} descuento={d.descuento ?? 0}
      monto={p.monto} propina={p.propina} cargo={Number(d.cargo ?? 0)} propinaFija={!!d.propinaFija} folio={folio} encuesta={encuesta} pagadoTxt={p.pagadoEn ? new Intl.DateTimeFormat("es-MX", { timeZone: b.zona, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(p.pagadoEn) : null} tarjeta={p.tarjeta} />
  );
}
