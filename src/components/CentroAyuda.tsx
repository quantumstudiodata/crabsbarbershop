"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { type DetalleSolicitud, enviarSolicitud, type EstadoEnvio, misSolicitudes, responderSolicitud, type ResumenSolicitud, verSolicitud } from "@/app/(app)/ayuda-actions";
import { MAX_ADJUNTO, prepararArchivo } from "@/lib/archivo";
import { CATEGORIAS_PROBLEMA, ESTADOS_SOLICITUD, hace, TIPOS_SOLICITUD, type TipoSolicitud } from "@/lib/soporte";
import { useAbrirPanel } from "./BarraMovil";
import { Cajon } from "./Cajon";
import { Icono } from "./Icono";
import { Selector } from "./ui";

type Vista = { v: "inicio" } | { v: "nuevo"; tipo: TipoSolicitud } | { v: "enviado"; folio: number; id: string } | { v: "lista" } | { v: "detalle"; id: string };

const TEXTO: Record<TipoSolicitud, { etiqueta: string; ayuda: string }> = {
  problema: { etiqueta: "Describe el problema", ayuda: "Cuéntanos qué estabas haciendo y qué sucedió..." },
  duda: { etiqueta: "¿Cuál es tu duda?", ayuda: "Cuéntanos qué necesitas entender o hacer..." },
  mejora: { etiqueta: "Tu idea", ayuda: "¿Qué te gustaría que cambiara o se agregara?" },
};

/** Botón de ayuda junto a las notificaciones. Abre un panel lateral sin salir de la página. */
export function CentroAyuda({ abiertas, nuevas }: { abiertas: number; nuevas: number }) {
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>({ v: "inicio" });
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  // Desde una notificación: ?ayuda=<id> abre esa solicitud.
  const pedida = params.get("ayuda");
  useEffect(() => {
    if (!pedida) return;
    setVista(/^[0-9a-f-]{36}$/.test(pedida) ? { v: "detalle", id: pedida } : { v: "lista" });
    setAbierto(true);
    const n = new URLSearchParams(params.toString());
    n.delete("ayuda");
    router.replace(n.toString() ? `${ruta}?${n}` : ruta, { scroll: false });
  }, [pedida, params, router, ruta]);
  useAbrirPanel("ayuda", useCallback(() => setAbierto(true), []));
  const cerrar = () => { setAbierto(false); setVista({ v: "inicio" }); router.refresh(); };
  const atras = vista.v === "nuevo" || vista.v === "lista" ? () => setVista({ v: "inicio" }) : vista.v === "detalle" || vista.v === "enviado" ? () => setVista({ v: "lista" }) : null;
  return (
    <>
      <button type="button" className="icb ayuda-b" onClick={() => setAbierto(true)} aria-label="Centro de ayuda" title="Centro de ayuda">
        <Icono n="ayuda" />{nuevas > 0 && <span className="punto-a" aria-label={`${nuevas} respuestas nuevas`} />}
      </button>
      <Cajon abierto={abierto} cerrar={cerrar} titulo={
        <span className="tit-ayuda">{atras && <button type="button" className="icb" onClick={atras} aria-label="Atrás"><Icono n="izquierda" /></button>}Centro de ayuda</span>
      }>
        {vista.v === "inicio" && <Inicio ir={setVista} abiertas={abiertas} nuevas={nuevas} />}
        {vista.v === "nuevo" && <Formulario key={vista.tipo} tipo={vista.tipo} listo={(folio, id) => setVista({ v: "enviado", folio, id })} />}
        {vista.v === "enviado" && (
          <div className="enviado-a">
            <span className="icono-ok"><Icono n="palomita" /></span>
            <b>Recibimos tu solicitud #{vista.folio}</b>
            <p className="muted">Te avisaremos en las notificaciones cuando soporte responda. Puedes seguir la conversación en Mis solicitudes.</p>
            <button type="button" className="bt sec" onClick={() => setVista({ v: "detalle", id: vista.id })}>Ver mi solicitud</button>
          </div>
        )}
        {vista.v === "lista" && <Lista abrir={(id) => setVista({ v: "detalle", id })} />}
        {vista.v === "detalle" && <Detalle id={vista.id} />}
      </Cajon>
    </>
  );
}

function Inicio({ ir, abiertas, nuevas }: { ir: (v: Vista) => void; abiertas: number; nuevas: number }) {
  return (
    <div className="inicio-a">
      <p className="pregunta-a">¿En qué podemos ayudarte?</p>
      {(Object.keys(TIPOS_SOLICITUD) as TipoSolicitud[]).map((k) => (
        <button key={k} type="button" className="opcion-a" onClick={() => ir({ v: "nuevo", tipo: k })}>
          <span><b>{TIPOS_SOLICITUD[k].titulo}</b><small>{TIPOS_SOLICITUD[k].detalle}</small></span><Icono n="derecha" />
        </button>
      ))}
      <button type="button" className="opcion-a mis-a" onClick={() => ir({ v: "lista" })}>
        <span>
          <b>Mis solicitudes{abiertas > 0 && <span className="chip-p">{abiertas} {abiertas === 1 ? "abierta" : "abiertas"}</span>}{nuevas > 0 && <span className="chip-p alerta">{nuevas} {nuevas === 1 ? "respuesta nueva" : "respuestas nuevas"}</span>}</b>
          <small>Consulta las solicitudes que has enviado y sus respuestas.</small>
        </span><Icono n="derecha" />
      </button>
    </div>
  );
}

/** Foto o PDF opcional. La foto se reduce antes de enviarse. */
function Adjunto({ chico }: { chico?: boolean }) {
  const [archivo, setArchivo] = useState<{ datos: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const elegir = async (f?: File) => {
    setError(null);
    if (!f) return;
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { setError("Solo fotos o PDF."); return; }
    try {
      const datos = await prepararArchivo(f);
      if (datos.length > MAX_ADJUNTO) { setError("El archivo pesa más de 1 MB."); return; }
      setArchivo({ datos, nombre: f.name.slice(0, 120) });
    } catch { setError("No se pudo leer el archivo."); }
  };
  return (
    <div className={`adjunto-a ${chico ? "chico" : ""}`}>
      {archivo && <><input type="hidden" name="adjunto" value={archivo.datos} /><input type="hidden" name="adjuntoNombre" value={archivo.nombre} /></>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => elegir(e.target.files?.[0])} />
      {archivo ? (
        <span className="archivo-a"><Icono n="clip" /><span>{archivo.nombre}</span><button type="button" className="icb" aria-label="Quitar archivo" onClick={() => { setArchivo(null); if (input.current) input.current.value = ""; }}><Icono n="cerrar" /></button></span>
      ) : chico ? (
        <button type="button" className="icb" aria-label="Adjuntar archivo" title="Adjuntar archivo" onClick={() => input.current?.click()}><Icono n="clip" /></button>
      ) : (
        <button type="button" className="link-c" onClick={() => input.current?.click()}><Icono n="clip" />Adjuntar evidencia (opcional)</button>
      )}
      {error && <small className="error-a">{error}</small>}
    </div>
  );
}

function Formulario({ tipo, listo }: { tipo: TipoSolicitud; listo: (folio: number, id: string) => void }) {
  const [e, accion, enviando] = useActionState<EstadoEnvio, FormData>(enviarSolicitud, {});
  const ruta = usePathname();
  useEffect(() => { if (e.ok && e.folio && e.id) listo(e.folio, e.id); }, [e, listo]);
  return (
    <form action={accion} className="form-a">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="ruta" value={ruta} />
      <input type="hidden" name="pantalla" value={typeof window === "undefined" ? "" : `${window.innerWidth}x${window.innerHeight}`} />
      <b className="tit-form-a">{TIPOS_SOLICITUD[tipo].titulo}</b>
      {tipo === "problema" && (
        <div className="campo">
          <span>¿Qué ocurrió?</span>
          <Selector name="categoria" etiqueta="¿Qué ocurrió?" inicial="" opciones={[{ valor: "", texto: "Selecciona una opción" }, ...CATEGORIAS_PROBLEMA.map((c) => ({ valor: c, texto: c }))]} />
        </div>
      )}
      <label className="campo"><span>{TEXTO[tipo].etiqueta}</span><textarea className="input" name="descripcion" rows={6} placeholder={TEXTO[tipo].ayuda} required minLength={5} maxLength={4000} /></label>
      <Adjunto />
      {e.error && <p className="aviso error">{e.error}</p>}
      <button className="bt" disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}<Icono n="enviar" /></button>
    </form>
  );
}

function Lista({ abrir }: { abrir: (id: string) => void }) {
  const [filas, setFilas] = useState<ResumenSolicitud[] | null>(null);
  useEffect(() => { misSolicitudes().then(setFilas).catch(() => setFilas([])); }, []);
  if (!filas) return <p className="muted">Cargando…</p>;
  if (!filas.length) return <p className="muted">Todavía no has enviado solicitudes.</p>;
  return (
    <div className="lista-a">
      <b className="tit-form-a">Mis solicitudes</b>
      {filas.map((f) => (
        <button key={f.id} type="button" className={`fila-a ${f.nuevo ? "nuevo" : ""}`} onClick={() => abrir(f.id)}>
          <span className="t-a"><b>{f.asunto}</b><small>#{f.folio}, {TIPOS_SOLICITUD[f.tipo].corto}, {hace(f.t)}</small></span>
          <span className={`chip-p est-${f.estado}`}>{f.nuevo ? "Respuesta nueva" : ESTADOS_SOLICITUD[f.estado]}</span>
        </button>
      ))}
    </div>
  );
}

function Detalle({ id }: { id: string }) {
  const [d, setD] = useState<DetalleSolicitud | null | undefined>(undefined);
  const [, iniciar] = useTransition();
  const cargar = () => iniciar(async () => setD(await verSolicitud(id)));
  useEffect(cargar, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [e, accion, enviando] = useActionState<EstadoEnvio, FormData>(async (p, f) => {
    const r = await responderSolicitud(p, f);
    if (r.ok) { setD(await verSolicitud(id)); setClave((k) => k + 1); }
    return r;
  }, {});
  const [clave, setClave] = useState(0);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [d]);
  if (d === undefined) return <p className="muted">Cargando…</p>;
  if (!d) return <p className="muted">No se encontró la solicitud.</p>;
  return (
    <div className="detalle-a">
      <div className="cab-det-a">
        <b>{d.asunto}</b>
        <span className="fila" style={{ gap: 8 }}><span className={`chip-p est-${d.estado}`}>{ESTADOS_SOLICITUD[d.estado]}</span><small className="muted">#{d.folio}, {TIPOS_SOLICITUD[d.tipo].corto}{d.categoria ? `, ${d.categoria}` : ""}</small></span>
      </div>
      <div className="conv-a">
        {d.mensajes.map((m) => (
          <div key={m.id} className={`msg-a ${m.mio ? "mio" : ""} ${m.deSoporte ? "soporte" : ""}`}>
            <small>{m.mio ? "Tú" : m.autor}, {hace(m.t)}</small>
            <p>{m.texto}</p>
            {m.adjunto && <a className="adj-msg" href={`/api/adjunto/${m.id}`} target="_blank" rel="noreferrer"><Icono n="clip" />{m.adjunto.nombre}</a>}
          </div>
        ))}
        <div ref={fin} />
      </div>
      {d.estado === "resuelto" && <p className="aviso-sutil">Soporte la marcó como resuelta. Si escribes, se vuelve a abrir.</p>}
      <form key={clave} action={accion} className="responder-a">
        <input type="hidden" name="solicitudId" value={d.id} />
        <textarea className="input" name="texto" rows={2} placeholder="Escribe tu respuesta..." maxLength={4000} />
        <div className="entre"><Adjunto chico /><button className="bt chico" disabled={enviando}>{enviando ? "Enviando…" : "Responder"}<Icono n="enviar" /></button></div>
        {e.error && <p className="aviso error">{e.error}</p>}
      </form>
    </div>
  );
}
