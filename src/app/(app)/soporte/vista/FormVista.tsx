"use client";

import { useState } from "react";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { PAGINAS } from "./paginas";

type Op = { valor: string; texto: string };

/** Puesto, negocio de referencia, página y dispositivo. Abre la vista previa sin salir del Centro de soporte. */
export function FormVista({ puestos, negocios, inicial }: { puestos: Op[]; negocios: Op[]; inicial?: { como?: string; negocio?: string; pagina?: string; disp?: string } }) {
  const [como, setComo] = useState(inicial?.como ?? puestos[0]?.valor ?? "duena");
  const [negocio, setNegocio] = useState(inicial?.negocio ?? "");
  const [pagina, setPagina] = useState(inicial?.pagina ?? "/");
  const [disp, setDisp] = useState(inicial?.disp ?? "escritorio");
  const volver = `/soporte/vista?pagina=${encodeURIComponent(pagina)}&disp=${disp}`;
  const href = `/api/vista?como=${encodeURIComponent(como)}&negocio=${negocio}&volver=${encodeURIComponent(volver)}`;
  return (
    <div className="form-vista">
      <div className="campo"><span>Puesto</span><Selector etiqueta="Puesto" opciones={puestos} valor={como} onChange={setComo} /></div>
      {negocios.length > 1 && <div className="campo"><span>Negocio de referencia</span><Selector etiqueta="Negocio de referencia" opciones={negocios} valor={negocio} onChange={setNegocio} /></div>}
      <div className="campo"><span>Página</span><Selector etiqueta="Página" opciones={PAGINAS} valor={pagina} onChange={setPagina} /></div>
      <div className="campo"><span>Dispositivo</span>
        <div className="seg" role="radiogroup" aria-label="Dispositivo">
          <label><input type="radio" name="disp" checked={disp === "escritorio"} onChange={() => setDisp("escritorio")} />Escritorio</label>
          <label><input type="radio" name="disp" checked={disp === "movil"} onChange={() => setDisp("movil")} />Móvil</label>
        </div>
      </div>
      <a className="bt" href={href}><Icono n="ojo" />Mostrar vista previa</a>
    </div>
  );
}
