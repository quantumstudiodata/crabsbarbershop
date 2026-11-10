"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MenuMes } from "@/components/Calendario";

/** Pestañas de Equipo en un control segmentado. Conserva el mes elegido. */
export function PestanasEquipo({ pagos }: { pagos: boolean }) {
  const ruta = usePathname();
  const mes = useSearchParams().get("mes");
  const q = mes ? `?mes=${mes}` : "";
  const enPagos = ruta.startsWith("/equipo/pagos");
  return (
    <nav className="eq-tabs" aria-label="Secciones de Equipo">
      <Link href={`/equipo${q}`} aria-current={!enPagos ? "page" : undefined}>Personas</Link>
      {pagos && <Link href="/equipo/pagos" aria-current={enPagos ? "page" : undefined}>Pagos</Link>}
    </nav>
  );
}

/** Mes del rendimiento: en el teléfono solo el ícono del calendario. */
export function MesEquipo({ mes, hoy }: { mes: string; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  return (
    <div className="eq-mes">
      <MenuMes mes={mes} activo icono="calendario" hoy={hoy} elegir={(m) => router.push(m === hoy.slice(0, 7) ? ruta : `${ruta}?mes=${m}`)} />
    </div>
  );
}
