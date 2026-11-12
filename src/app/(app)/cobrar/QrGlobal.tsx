"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CobroQrAbierto } from "./actions";
import { CobroQR, TarjetasQr } from "./CobroQR";

/**
 * Cobros con QR en espera o recién pagados, visibles en cualquier pantalla (en Cobro ya los muestra su propia pantalla).
 * Así nadie pierde de vista un pago aunque se haya movido a otra sección.
 */
export function QrGlobal() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState<CobroQrAbierto | null>(null);
  const [vistos, setVistos] = useState<string[]>([]);
  if (ruta.startsWith("/cobrar")) return null;
  return (
    <>
      <TarjetasQr nuevo={null} abrir={setAbierto} vistos={vistos} />
      {abierto && (
        <CobroQR key={abierto.id} cobro={abierto} detalle={abierto.detalle ?? ""}
          listo={() => { setVistos((v) => [...v, abierto.id]); setAbierto(null); }}
          cerrar={() => setAbierto(null)}
          cancelado={() => { setVistos((v) => [...v, abierto.id]); setAbierto(null); }} />
      )}
    </>
  );
}
