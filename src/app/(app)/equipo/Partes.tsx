"use client";

import { usePathname, useRouter } from "next/navigation";
import { MenuMes } from "@/components/Calendario";

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
