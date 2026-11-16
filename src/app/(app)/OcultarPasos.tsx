"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { marcarConsejos } from "./acciones-usuario";

/** Ocultar Primeros pasos: no vuelve a salir. */
export function OcultarPasos() {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  return <button type="button" className="link-c pp-ocultar" disabled={pend} onClick={() => iniciar(async () => { await marcarConsejos(["primeros-ocultos"]); router.refresh(); })}>Ocultar</button>;
}
