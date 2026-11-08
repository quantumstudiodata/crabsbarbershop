"use client";

import { useRouter } from "next/navigation";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { PAGINAS } from "./paginas";

type Op = { valor: string; texto: string };

/** Barra de la vista previa a pantalla completa. Cada cambio se aplica al momento. */
export function BarraVista({ puestos, negocios, como, negocio, pagina, disp, prueba }: {
  puestos: Op[]; negocios: Op[]; como: string; negocio: string; pagina: string; disp: string; prueba: boolean;
}) {
  const router = useRouter();
  const destino = (p: string, d: string) => `/soporte/vista?pagina=${encodeURIComponent(p)}&disp=${d}`;
  const cambiar = (c: string, n: string) => { window.location.href = `/api/vista?como=${encodeURIComponent(c)}&negocio=${n}&volver=${encodeURIComponent(destino(pagina, disp))}`; };
  return (
    <div className="barra-vp">
      <span className="tit-vp"><Icono n="ojo" />Vista previa</span>
      <div className="ctrl-vp">
        <Selector etiqueta="Puesto" opciones={puestos} valor={como} onChange={(v) => cambiar(v, negocio)} />
        {negocios.length > 1 && <Selector etiqueta="Negocio de referencia" opciones={negocios} valor={negocio} onChange={(v) => cambiar(como, v)} />}
        <Selector etiqueta="Página" opciones={PAGINAS.some((p) => p.valor === pagina) ? PAGINAS : [{ valor: pagina, texto: pagina }, ...PAGINAS]} valor={pagina} onChange={(v) => router.replace(destino(v, disp))} />
        <div className="seg seg-vp" role="radiogroup" aria-label="Dispositivo">
          <label><input type="radio" checked={disp !== "movil"} onChange={() => { window.location.href = pagina; }} />Escritorio</label>
          <label><input type="radio" checked={disp === "movil"} onChange={() => router.replace(destino(pagina, "movil"))} />Móvil</label>
        </div>
      </div>
      <span className={`modo-vp ${prueba ? "prueba" : ""}`}>{prueba ? "Negocio de prueba: acciones reales" : "Solo lectura"}</span>
      <a className="icb salir-vp" href="/api/vista?salir=1" aria-label="Salir de la vista previa" title="Salir de la vista previa"><Icono n="cerrar" /></a>
    </div>
  );
}
