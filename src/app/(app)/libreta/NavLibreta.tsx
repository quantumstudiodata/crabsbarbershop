"use client";

import { useRouter } from "next/navigation";
import { MenuAnio, MenuMes } from "@/components/Calendario";
import { Icono } from "@/components/Icono";

/** Mes, Año o Por barbero, con su selector y el botón de descarga. */
export function NavLibreta({ vista, mes, anio, hoy, descarga }: { vista: "mes" | "anio" | "barberos"; mes: string; anio: string; hoy: string; descarga: string }) {
  const router = useRouter();
  const ir = (q: string) => router.push(`/libreta?${q}`);
  return (
    <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
      <div className="fila selector-p">
        <nav className="seg" aria-label="Vista">
          <button type="button" aria-current={vista === "mes" ? "page" : undefined} onClick={() => ir(`vista=mes&mes=${mes}`)}>Mes</button>
          <button type="button" aria-current={vista === "anio" ? "page" : undefined} onClick={() => ir(`vista=anio&anio=${anio}`)}>Año</button>
          <button type="button" aria-current={vista === "barberos" ? "page" : undefined} onClick={() => ir(`vista=barberos&anio=${anio}`)}>Por barbero</button>
        </nav>
        <div className="botones-p">
          {vista === "mes"
            ? <MenuMes key={mes} mes={mes} activo hoy={hoy} elegir={(m) => ir(`vista=mes&mes=${m}`)} />
            : <MenuAnio anio={anio} activo hoy={hoy} elegir={(y) => ir(`vista=${vista}&anio=${y}`)} />}
        </div>
      </div>
      <a className="chipf" href={descarga}><Icono n="descargar" />Descargar Excel</a>
    </div>
  );
}
