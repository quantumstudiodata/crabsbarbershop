"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ayudaDe } from "@/lib/ayuda-pantallas";
import { Icono } from "./Icono";

/**
 * Una línea que explica la pantalla las primeras veces que se abre. Se va al cerrarla o a la tercera visita.
 * Se recuerda en este dispositivo; si no hay almacenamiento, simplemente no se muestra.
 */
export function PrimeraVez() {
  const ruta = usePathname();
  const a = ayudaDe(ruta);
  const clave = a?.intro ? `crabs-pv-${a.nombre}` : null;
  const [ver, setVer] = useState(false);
  useEffect(() => {
    setVer(false);
    if (!clave) return;
    try {
      const n = Number(localStorage.getItem(clave) ?? "0");
      if (n >= 3) return;
      localStorage.setItem(clave, String(n + 1));
      setVer(true);
    } catch { /* sin almacenamiento */ }
  }, [clave]);
  if (!ver || !a?.intro) return null;
  return (
    <p className="pv-l subir" role="note">
      <Icono n="ayuda" /><span>{a.intro}</span>
      <button type="button" className="icb" aria-label="Cerrar" onClick={() => { try { localStorage.setItem(clave!, "3"); } catch { /* sin almacenamiento */ } setVer(false); }}><Icono n="cerrar" /></button>
    </p>
  );
}
