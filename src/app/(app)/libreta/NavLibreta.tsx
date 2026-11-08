"use client";

import { useRouter } from "next/navigation";
import { MenuAnio, MenuMes } from "@/components/Calendario";

/** Mes, Año o Por barbero, con su selector y las descargas. */
export function NavLibreta({ vista, mes, anio, hoy, descargas, conDatos }: { vista: "mes" | "anio" | "barberos"; mes: string; anio: string; hoy: string; descargas: React.ReactNode; conDatos: string[] }) {
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
            ? <MenuMes key={mes} mes={mes} activo hoy={hoy} conDatos={conDatos} elegir={(m) => ir(`vista=mes&mes=${m}`)} />
            : <MenuAnio anio={anio} activo hoy={hoy} elegir={(y) => ir(`vista=${vista}&anio=${y}`)} />}
        </div>
      </div>
      {descargas}
    </div>
  );
}
