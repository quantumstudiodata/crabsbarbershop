import "server-only";
import { headers } from "next/headers";

/** Si quien abre la página está en un teléfono. Sirve para paginar menos registros; el diseño lo resuelve el CSS. */
export async function esMovil(): Promise<boolean> {
  const h = await headers();
  if (h.get("sec-ch-ua-mobile") === "?1") return true;
  return /Mobi|Android|iPhone|iPod/i.test(h.get("user-agent") ?? "");
}
