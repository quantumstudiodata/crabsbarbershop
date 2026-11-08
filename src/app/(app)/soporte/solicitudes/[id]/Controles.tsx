"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { prepararArchivo } from "@/lib/archivo";
import { actualizarSolicitud, type EstadoSoporte, responderComoSoporte } from "../../actions";

type Op = { valor: string; texto: string };

/** Estado, prioridad y responsable: se guardan en cuanto se eligen. */
export function Campos({ id, estado, prioridad, responsable, estados, prioridades, equipo }: { id: string; estado: string; prioridad: string; responsable: string; estados: Op[]; prioridades: Op[]; equipo: Op[] }) {
  const [pend, iniciar] = useTransition();
  const guardar = (campo: string, valor: string) => iniciar(async () => {
    const f = new FormData(); f.set("solicitudId", id); f.set("campo", campo); f.set("valor", valor);
    await actualizarSolicitud(f);
  });
  return (
    <div className={`campos-s ${pend ? "guardando" : ""}`}>
      <div className="campo"><span>Estado</span><Selector etiqueta="Estado" opciones={estados} inicial={estado} onChange={(v) => guardar("estado", v)} /></div>
      <div className="campo"><span>Prioridad</span><Selector etiqueta="Prioridad" opciones={prioridades} inicial={prioridad} onChange={(v) => guardar("prioridad", v)} /></div>
      <div className="campo"><span>Responsable</span><Selector etiqueta="Responsable" opciones={equipo} inicial={responsable} onChange={(v) => guardar("responsable", v)} /></div>
    </div>
  );
}

export function Responder({ id, estado }: { id: string; estado: string }) {
  const [clave, setClave] = useState(0);
  const [e, accion, enviando] = useActionState<EstadoSoporte, FormData>(async (p, f) => {
    const r = await responderComoSoporte(p, f);
    if (r.ok) { setClave((k) => k + 1); setArchivo(null); }
    return r;
  }, {});
  const [archivo, setArchivo] = useState<{ datos: string; nombre: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form key={clave} action={accion} className="responder-a">
      <input type="hidden" name="solicitudId" value={id} />
      {archivo && <><input type="hidden" name="adjunto" value={archivo.datos} /><input type="hidden" name="adjuntoNombre" value={archivo.nombre} /></>}
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (ev) => { const f = ev.target.files?.[0]; if (f) setArchivo({ datos: await prepararArchivo(f), nombre: f.name.slice(0, 120) }); }} />
      <textarea className="input" name="texto" rows={3} placeholder="Escribe la respuesta..." maxLength={4000} />
      <div className="entre" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="fila" style={{ gap: 8 }}>
          <button type="button" className="icb" aria-label="Adjuntar archivo" title="Adjuntar archivo" onClick={() => input.current?.click()}><Icono n="clip" /></button>
          {archivo && <span className="archivo-a"><span>{archivo.nombre}</span><button type="button" className="icb" aria-label="Quitar archivo" onClick={() => setArchivo(null)}><Icono n="cerrar" /></button></span>}
        </span>
        <span className="fila" style={{ gap: 8 }}>
          <span className="muted chico-t">Después</span>
          <Selector name="despues" etiqueta="Estado después de responder" inicial={estado === "resuelto" ? "resuelto" : "esperando"}
            opciones={[{ valor: "esperando", texto: "Esperando respuesta" }, { valor: "revision", texto: "En revisión" }, { valor: "resuelto", texto: "Resuelto" }]} />
          <button className="bt chico" disabled={enviando}>{enviando ? "Enviando…" : "Responder"}<Icono n="enviar" /></button>
        </span>
      </div>
      {e.error && <p className="aviso error">{e.error}</p>}
    </form>
  );
}
