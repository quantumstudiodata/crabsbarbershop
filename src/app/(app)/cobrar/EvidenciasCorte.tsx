"use client";

import { useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import { MAX_ADJUNTO, prepararArchivo } from "@/lib/archivo";

type Evidencia = { etiqueta: string; nombre: string; datos: string };

/**
 * Evidencias del corte: fotos o archivos de las transferencias, los pagos con tarjeta u otra cosa.
 * Se puede abrir la cámara o elegir un archivo. Todo es opcional.
 */
export function EvidenciasCorte({ metodos }: { metodos: string[] }) {
  const [lista, setLista] = useState<Evidencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState(metodos[0] ?? "Otra");
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const opciones = [...metodos, "Otra evidencia"];
  const agregar = async (f?: File) => {
    setError(null);
    if (!f) return;
    if (lista.length >= 6) { setError("Se pueden adjuntar hasta 6 archivos."); return; }
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(f.type)) { setError("Solo fotos o PDF."); return; }
    try {
      const datos = await prepararArchivo(f);
      if (datos.length > MAX_ADJUNTO) { setError("El archivo pesa más de 1 MB. Prueba con una foto o un PDF más ligero."); return; }
      setLista((l) => [...l, { etiqueta, nombre: f.name.slice(0, 120) || "foto", datos }]);
    } catch { setError("No se pudo leer el archivo."); }
  };
  return (
    <div className="evid-c">
      <span className="paso-t">Evidencias del corte (opcional)</span>
      <small className="muted">Fotos o archivos de las transferencias, los pagos con tarjeta u otro comprobante.</small>
      {lista.map((e, i) => (
        <span key={i} className="archivo-a evid-f">
          <input type="hidden" name="evidencia" value={e.datos} /><input type="hidden" name="evidenciaNombre" value={e.nombre} /><input type="hidden" name="evidenciaEtiqueta" value={e.etiqueta} />
          <Icono n="clip" /><span><b>{e.etiqueta}</b>, {e.nombre}</span>
          <button type="button" className="icb" aria-label="Quitar archivo" onClick={() => setLista((l) => l.filter((_, k) => k !== i))}><Icono n="cerrar" /></button>
        </span>
      ))}
      <div className="billetes">
        {opciones.map((o) => <button type="button" key={o} className={etiqueta === o ? "on" : ""} onClick={() => setEtiqueta(o)}>{o}</button>)}
      </div>
      <div className="fila" style={{ gap: 8 }}>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { agregar(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" hidden onChange={(e) => { agregar(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="bt sec chico" onClick={() => camara.current?.click()}><Icono n="camara" />Tomar foto</button>
        <button type="button" className="bt sec chico" onClick={() => archivo.current?.click()}><Icono n="clip" />Elegir archivo</button>
      </div>
      {error && <small className="error-a">{error}</small>}
    </div>
  );
}
