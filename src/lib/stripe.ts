import "server-only";
import Stripe from "stripe";
import { headers } from "next/headers";

// Pagos en línea con Stripe Connect: cada negocio conecta su propia cuenta (Standard) y cobra directo en ella.
// Crabs nunca recibe ni guarda datos de tarjetas: el formulario es de Stripe y el pago solo cuenta cuando Stripe lo confirma.

let cliente: Stripe | null = null;

/** Las llaves están puestas: sin ellas todo lo de pagos en línea queda apagado. */
export const pagosDisponibles = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("stripe_sin_llave");
  // STRIPE_API_HOST solo se usa en pruebas locales (servidor simulado de Stripe); en producción no se define.
  const local = process.env.STRIPE_API_HOST ? { host: process.env.STRIPE_API_HOST, port: Number(process.env.STRIPE_API_PORT ?? 12111), protocol: "http" as const } : {};
  cliente ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: "Crabs Barbería" }, maxNetworkRetries: 2, ...local });
  return cliente;
}

/** Un negocio puede cobrar en línea: llaves puestas y su cuenta de Stripe ya aceptada. */
export function cobraEnLinea(b: { stripeCuenta: string | null; stripeEstado: string }) {
  return pagosDisponibles() && !!b.stripeCuenta && b.stripeEstado === "activa";
}

/** Dirección pública del sitio, para los enlaces de regreso de Stripe y del QR. */
export async function origen() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.crabsbarber.shop";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Estado de la cuenta del negocio según Stripe. */
export function estadoDeCuenta(a: Stripe.Account): "pendiente" | "activa" {
  return a.charges_enabled ? "activa" : "pendiente";
}

// Stripe ya no deja crear cuentas conectadas con la API v1: se crean y se revisan con Accounts v2.
// Los cobros siguen siendo directos en la cuenta del negocio (encabezado Stripe-Account), igual que antes.
const VERSION_V2 = process.env.STRIPE_V2_VERSION ?? "2026-09-30.endive";

async function v2<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown, clave?: string): Promise<T> {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("stripe_sin_llave");
  const r = await fetch(`https://api.stripe.com${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Stripe-Version": VERSION_V2,
      ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(clave ? { "Idempotency-Key": clave } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe_v2 ${r.status} ${ruta}: ${JSON.stringify((datos as { error?: unknown }).error ?? datos).slice(0, 600)}`);
  return datos as T;
}

/** Crea la cuenta del negocio: panel completo de Stripe, Stripe cobra sus comisiones y responde por saldos negativos. */
export async function crearCuentaNegocio(b: { id: string; nombre: string }) {
  const a = await v2<{ id: string }>("POST", "/v2/core/accounts", {
    display_name: b.nombre.slice(0, 100),
    identity: { country: "mx" },
    dashboard: "full",
    defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    metadata: { barberiaId: b.id },
  }, `cuenta-v2-${b.id}`);
  return a.id;
}

/** Enlace de una sola vez para que el negocio llene sus datos en Stripe. */
export async function enlaceAltaNegocio(cuenta: string, regreso: string, reintento: string) {
  const l = await v2<{ url: string }>("POST", "/v2/core/account_links", {
    account: cuenta,
    use_case: { type: "account_onboarding", account_onboarding: { return_url: regreso, refresh_url: reintento } },
  });
  return l.url;
}

/** La cuenta del negocio ya puede cobrar con tarjeta. */
export async function estadoCuentaNegocio(cuenta: string): Promise<"pendiente" | "activa"> {
  try {
    const a = await v2<{ configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string } } } } }>("GET", `/v2/core/accounts/${encodeURIComponent(cuenta)}?include=configuration.merchant`);
    return a.configuration?.merchant?.capabilities?.card_payments?.status === "active" ? "activa" : "pendiente";
  } catch (err) {
    // Respaldo: las cuentas v2 también se pueden consultar con la API v1.
    console.error(err);
    return estadoDeCuenta(await stripe().accounts.retrieve(cuenta));
  }
}

/** Lo mínimo que Stripe cobra con tarjeta en pesos: $10. */
export const MINIMO_STRIPE = 1000;

/** Intento de pago en la cuenta del negocio. El monto va en centavos de peso. */
export async function crearIntento(cuenta: string, d: { monto: number; descripcion: string; metadata: Record<string, string>; clave: string }) {
  return stripe().paymentIntents.create({
    amount: d.monto, currency: "mxn", description: d.descripcion.slice(0, 200), metadata: d.metadata,
    automatic_payment_methods: { enabled: true },
  }, { stripeAccount: cuenta, idempotencyKey: d.clave });
}

/** Marca y terminación de la tarjeta, si Stripe la reporta (nunca el número completo). */
export function tarjetaDe(pi: Stripe.PaymentIntent) {
  const ch = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null;
  const c = ch?.payment_method_details?.card;
  return c ? `${(c.brand ?? "tarjeta").replace(/^./, (x) => x.toUpperCase())} ${c.last4 ?? ""}`.trim() : "";
}
