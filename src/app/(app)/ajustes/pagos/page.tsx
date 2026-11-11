import { redirect } from "next/navigation";

/** Pagos en línea vive dentro de Configuración del negocio, en Cobros y métodos de pago. */
export default async function PagosEnLinea({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const q = await searchParams;
  redirect(q.stripe ? `/ajustes/cobro?stripe=${q.stripe === "reintentar" ? "reintentar" : "volver"}` : "/ajustes/cobro");
}
