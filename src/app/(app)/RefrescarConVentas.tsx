"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useVivo } from "@/components/useVivo";

/** En el teléfono, cuando entra un cobro nuevo, la página se actualiza sola y las cifras cambian con una transición. */
export function RefrescarConVentas() {
  const { nuevos } = useVivo();
  const router = useRouter();
  useEffect(() => {
    if (![...nuevos].some((id) => id.startsWith("v"))) return;
    if (window.matchMedia("(max-width: 760px)").matches) router.refresh();
  }, [nuevos, router]);
  return null;
}
