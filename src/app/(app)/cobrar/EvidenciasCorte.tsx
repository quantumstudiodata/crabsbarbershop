"use client";

import { useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import { MAX_ADJUNTO, prepararArchivo } from "@/lib/archivo";

type Evidencia = { etiqueta: string; nombre: string; datos: string; pdf: boolean };
export type GrupoEvidencia = { metodo: string; total: number; ventas: number; icono: string; enLinea: boolean };

const MAX_ARCHIVOS = 6;

/**
 * Comprobantes del corte, agrupados por forma de pago: se suben las fotos o PDF que sean, en cualquier orden.
 * Los cobros en línea (QR) ya los verificó Stripe y no piden comprobante. Con la función obligatoria,
 * cada forma de pago con cobros necesita al menos un archivo.
 */
export function EvidenciasCorte({ grupos, obligatorio, cambio, dinero }: { grupos: GrupoEvidencia[]; obligatorio: boolean; cambio: (faltan: number) => void; dinero: (n: number) => string }) {
  const [lista, setLista] = useState<Evidencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const destino = useRef("");
  const archivo = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const actualizar = (nueva: Evidencia[]) => {
    setLista(nueva);
    cambio(obligatorio ? grupos.filter((g) => !g.enLinea && g.total > 0 && !nueva.some((e) => e.etiqueta === g.metodo)).length : 0);
  };
  const agregar = async (f?: File) => {
    setError(null);
    if (!f) return;
    if (lista.length >= MAX_ARCHIVOS) { setError(`Se pueden adjuntar hasta ${MAX_ARCHIVOS} archivos en total.`); return; }
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(f.type)) { setError("Solo fotos o PDF."); return; }
    try {
      const datos = await prepararArchivo(f);
      if (datos.length > MAX_ADJUNTO) { setError("El archivo pesa más de 1 MB. Prueba con una foto o un PDF más ligero."); return; }
      actualizar([...lista, { etiqueta: destino.current, nombre: f.name.slice(0, 120) || "foto", datos, pdf: f.type === "application/pdf" }]);
    } catch { setError("No se pudo leer el archivo."); }
  };
  const abrir = (metodo: string, foto: boolean) => { destino.current = metodo; (foto ? camara : archivo).current?.click(); };
  return (
    <div className="ev-grupos">
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { agregar(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" hidden onChange={(e) => { agregar(e.target.files?.[0]); e.target.value = ""; }} />
      {lista.map((e, i) => (
        <span key={i} hidden>
          <input type="hidden" name="evidencia" value={e.datos} /><input type="hidden" name="evidenciaNombre" value={e.nombre} /><input type="hidden" name="evidenciaEtiqueta" value={e.etiqueta} />
        </span>
      ))}
      {grupos.map((g) => {
        const suyos = lista.map((e, i) => ({ ...e, i })).filter((e) => e.etiqueta === g.metodo);
        const falta = !g.enLinea && g.total > 0 && suyos.length === 0;
        return (
          <div key={g.metodo} className="ev-g">
            <div className="ev-h">
              <span className="ev-ic"><Icono n={g.icono} /></span>
              <span className="ev-t"><b>{g.metodo}</b><small>{g.ventas} {g.ventas === 1 ? "cobro" : "cobros"}, {dinero(g.total)}</small></span>
              <span className={`ev-est ${g.enLinea || suyos.length ? "ok" : ""}`}>{g.enLinea ? "Verificado" : suyos.length ? `${suyos.length} ${suyos.length === 1 ? "archivo" : "archivos"}` : falta ? (obligatorio ? "Falta comprobante" : "Sin comprobante") : "Sin cobros"}</span>
            </div>
            {g.enLinea ? <small className="muted">No necesita comprobante: Stripe confirmó cada pago.</small> : (
              <div className="ev-tiras">
                {suyos.map((e) => (
                  <span key={e.i} className="ev-tira">
                    {e.pdf ? <span className="ev-pdf">PDF</span> : <img src={e.datos} alt="" />}
                    <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => actualizar(lista.filter((_, k) => k !== e.i))}><Icono n="cerrar" /></button>
                  </span>
                ))}
                <button type="button" className="ev-mas" onClick={() => abrir(g.metodo, true)}><Icono n="camara" /><span>Foto</span></button>
                <button type="button" className="ev-mas" onClick={() => abrir(g.metodo, false)}><Icono n="clip" /><span>Archivo</span></button>
              </div>
            )}
          </div>
        );
      })}
      {error && <small className="error-a">{error}</small>}
    </div>
  );
}
