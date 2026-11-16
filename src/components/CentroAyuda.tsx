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
import { ayudaDe } from "@/lib/ayuda-pantallas";
import { TIPOS_PETICION, type TipoPeticion } from "@/lib/peticiones-tipos";
import { enviarPeticion, type EstadoPeticion, misPeticiones, type Peticion, peticionesEquipo, resolverPeticion } from "@/app/(app)/peticiones-actions";

type Vista = { v: "inicio" } | { v: "soporte" } | { v: "pedir"; tipo?: TipoPeticion } | { v: "pedido" } | { v: "equipo" } | { v: "nuevo"; tipo: TipoSolicitud } | { v: "enviado"; folio: number; id: string } | { v: "lista" } | { v: "detalle"; id: string };

const TEXTO: Record<TipoSolicitud, { etiqueta: string; ayuda: string }> = {
  problema: { etiqueta: "Describe el problema", ayuda: "Cuéntanos qué estabas haciendo y qué sucedió..." },
  duda: { etiqueta: "¿Cuál es tu duda?", ayuda: "Cuéntanos qué necesitas entender o hacer..." },
  mejora: { etiqueta: "Tu idea", ayuda: "¿Qué te gustaría que cambiara o se agregara?" },
};

/** Botón de ayuda junto a las notificaciones. Abre un panel lateral sin salir de la página. */
export function CentroAyuda({ abiertas, nuevas, guias = [], administra = false, peticiones = { equipo: 0, respondidas: 0 } }: {
  abiertas: number; nuevas: number; /** Temas de la guía que puede repasar: [id, nombre]. */ guias?: [string, string][];
  /** Quien administra recibe las peticiones del equipo; los demás pueden pedirle algo. */ administra?: boolean; peticiones?: { equipo: number; respondidas: number };
}) {
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
  // Desde otros lugares: "Pedir permiso" abre directo el formulario; "Ver" en Inicio abre las peticiones del equipo.
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent).detail as { pedir?: TipoPeticion; ver?: string } | undefined;
      if (d?.pedir && !administra) setVista({ v: "pedir", tipo: d.pedir });
      else if (d?.ver === "peticiones" && administra) setVista({ v: "equipo" });
    };
    window.addEventListener("crabs:ayuda", f);
    return () => window.removeEventListener("crabs:ayuda", f);
  }, [administra]);
  const cerrar = () => { setAbierto(false); setVista({ v: "inicio" }); router.refresh(); };
  const atras = vista.v === "soporte" || vista.v === "lista" || vista.v === "pedir" || vista.v === "pedido" || vista.v === "equipo" ? () => setVista({ v: "inicio" }) : vista.v === "nuevo" ? () => setVista({ v: "soporte" }) : vista.v === "detalle" || vista.v === "enviado" ? () => setVista({ v: "lista" }) : null;
  return (
    <>
      <button type="button" className="icb ayuda-b" onClick={() => setAbierto(true)} aria-label="Centro de ayuda" title="Centro de ayuda">
        <Icono n="ayuda" />{(nuevas > 0 || peticiones.equipo > 0 || peticiones.respondidas > 0) && <span className="punto-a" aria-label="Hay respuestas o peticiones nuevas" />}
      </button>
      <Cajon abierto={abierto} cerrar={cerrar} titulo={
        <span className="tit-ayuda">{atras && <button type="button" className="icb" onClick={atras} aria-label="Atrás"><Icono n="izquierda" /></button>}Centro de ayuda</span>
      }>
        {vista.v === "pedir" && <Pedir key={vista.tipo ?? "x"} inicial={vista.tipo} listo={() => setVista({ v: "pedido" })} />}
        {vista.v === "pedido" && (
          <div className="enviado-a">
            <span className="icono-ok"><Icono n="palomita" /></span>
            <b>Se lo hicimos saber a quien administra</b>
            <p className="muted">Te avisaremos aquí cuando te responda. Tus peticiones quedan en esta misma sección.</p>
            <button type="button" className="bt sec" onClick={() => setVista({ v: "pedir" })}>Ver mis peticiones</button>
          </div>
        )}
        {vista.v === "equipo" && <PeticionesEquipo />}
        {vista.v === "inicio" && <Inicio administra={administra} peticiones={peticiones} ir={setVista} abiertas={abiertas} nuevas={nuevas} guias={guias} verGuia={(p) => { cerrar(); window.dispatchEvent(new CustomEvent("crabs:guia", { detail: { punto: p } })); }} />}
        {vista.v === "soporte" && <Soporte ir={setVista} />}
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

/**
 * Ayuda en tres niveles: primero las respuestas de la pantalla en la que estás y cómo se hace cada cosa;
 * si no se resolvió, escribir a soporte de Crabs.
 */
function Inicio({ ir, abiertas, nuevas, guias, verGuia, administra, peticiones }: {
  ir: (v: Vista) => void; abiertas: number; nuevas: number; guias: [string, string][]; verGuia: (p: string) => void; administra: boolean; peticiones: { equipo: number; respondidas: number };
}) {
  const ruta = usePathname();
  const a = ayudaDe(ruta);
  const [abierta, setAbierta] = useState<number | null>(null);
  const guiaPantalla = a?.guia && guias.some(([g]) => g === a.guia) ? a.guia : null;
  return (
    <div className="inicio-a">
      {administra && (
        <button type="button" className="opcion-a" onClick={() => ir({ v: "equipo" })}>
          <span><b>Peticiones del equipo{peticiones.equipo > 0 && <span className="chip-p alerta">{peticiones.equipo} sin resolver</span>}</b><small>Permisos, correcciones o contraseñas que te pide tu equipo.</small></span><Icono n="derecha" />
        </button>
      )}
      {a && (
        <section className="ay-sec">
          <span className="lab">Sobre esta pantalla, {a.nombre}</span>
          {a.preguntas.map(([q, r], i) => (
            <div key={q} className={`ay-q ${abierta === i ? "on" : ""}`}>
              <button type="button" aria-expanded={abierta === i} onClick={() => setAbierta(abierta === i ? null : i)}><span>{q}</span><Icono n="abajo" /></button>
              {abierta === i && <p>{r}</p>}
            </div>
          ))}
          {guiaPantalla && <button type="button" className="link-c ay-guia" onClick={() => verGuia(guiaPantalla)}><Icono n="tutorial" />Ver cómo se hace, paso a paso</button>}
        </section>
      )}
      {guias.length > 0 && (
        <details className="ay-sec ay-como">
          <summary><span className="lab">¿Cómo se hace?</span><Icono n="abajo" /></summary>
          <div className="ay-temas">{guias.map(([id, nombre]) => <button key={id} type="button" onClick={() => verGuia(id)}><span>{nombre}</span><Icono n="derecha" /></button>)}</div>
        </details>
      )}
      <section className="ay-sec">
        <span className="lab">Si no lo resolviste</span>
        {!administra && (
          <button type="button" className="opcion-a" onClick={() => ir({ v: "pedir" })}>
            <span><b>Pedir algo a quien administra{peticiones.respondidas > 0 && <span className="chip-p alerta">{peticiones.respondidas} {peticiones.respondidas === 1 ? "respuesta" : "respuestas"}</span>}</b><small>Permisos, correcciones o tu contraseña. Lo ve solo quien administra el negocio.</small></span><Icono n="derecha" />
          </button>
        )}
        <button type="button" className="opcion-a" onClick={() => ir({ v: "soporte" })}>
          <span><b>Escribir a soporte de Crabs</b><small>Un problema, una duda o una idea para mejorar. Respondemos de lunes a sábado.</small></span><Icono n="derecha" />
        </button>
        <button type="button" className="opcion-a mis-a" onClick={() => ir({ v: "lista" })}>
          <span>
            <b>Mis solicitudes{abiertas > 0 && <span className="chip-p">{abiertas} {abiertas === 1 ? "abierta" : "abiertas"}</span>}{nuevas > 0 && <span className="chip-p alerta">{nuevas} {nuevas === 1 ? "respuesta nueva" : "respuestas nuevas"}</span>}</b>
            <small>Lo que has enviado a soporte y sus respuestas.</small>
          </span><Icono n="derecha" />
        </button>
      </section>
    </div>
  );
}

/** Escribir a soporte de Crabs: un problema, una duda o una mejora. */
function Soporte({ ir }: { ir: (v: Vista) => void }) {
  return (
    <div className="inicio-a">
      <p className="pregunta-a">¿Qué quieres contarnos?</p>
      {(Object.keys(TIPOS_SOLICITUD) as TipoSolicitud[]).map((k) => (
        <button key={k} type="button" className="opcion-a" onClick={() => ir({ v: "nuevo", tipo: k })}>
          <span><b>{TIPOS_SOLICITUD[k].titulo}</b><small>{TIPOS_SOLICITUD[k].detalle}</small></span><Icono n="derecha" />
        </button>
      ))}
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

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");

/** Pedir algo a quien administra: qué se necesita y una frase. Abajo, lo que ya se pidió y su respuesta. */
function Pedir({ inicial, listo }: { inicial?: TipoPeticion; listo: () => void }) {
  const [e, accion, enviando] = useActionState<EstadoPeticion, FormData>(enviarPeticion, {});
  const [tipo, setTipo] = useState<TipoPeticion>(inicial ?? "permiso");
  const [mias, setMias] = useState<Peticion[] | null>(null);
  const ruta = usePathname();
  useEffect(() => { if (e.ok) listo(); }, [e, listo]);
  useEffect(() => { misPeticiones().then(setMias).catch(() => setMias([])); }, []);
  return (
    <div className="pila">
      <form action={accion} className="pila">
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="pagina" value={ruta} />
        <p className="pregunta-a">¿Qué necesitas?</p>
        <div className="opciones-t" role="radiogroup" aria-label="Qué necesitas">
          {(Object.keys(TIPOS_PETICION) as TipoPeticion[]).map((k) => (
            <label key={k} className="opcion-t"><input type="radio" name="t" checked={tipo === k} onChange={() => setTipo(k)} /><b>{TIPOS_PETICION[k].titulo}</b><small>{TIPOS_PETICION[k].detalle}</small></label>
          ))}
        </div>
        <label className="campo"><span>Cuéntale en una frase</span><textarea className="input" name="texto" rows={3} maxLength={600} placeholder={TIPOS_PETICION[tipo].ejemplo} required /></label>
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones"><button className="bt" disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}</button></div>
      </form>
      {mias && mias.length > 0 && (
        <section className="ay-sec">
          <span className="lab">Tus peticiones</span>
          {mias.map((p) => (
            <div key={p.id} className={`pt-f ${p.estado}`}>
              <span className="pt-cab"><b>{TIPOS_PETICION[p.tipo]?.titulo ?? "Petición"}</b><span className="chip-p">{p.estado === "abierta" ? "En espera" : "Resuelta"}</span></span>
              <small className="muted">{fechaCorta(p.t)}: {p.texto}</small>
              {p.estado === "resuelta" && <p className="pt-resp">{p.respuesta || "Quedó resuelta."}{p.resolvio ? ` (${p.resolvio})` : ""}</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Para quien administra: lo que pide el equipo. Se responde y se marca como resuelta. */
function PeticionesEquipo() {
  const [lista, setLista] = useState<Peticion[] | null>(null);
  const cargar = useCallback(() => { peticionesEquipo().then(setLista).catch(() => setLista([])); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!lista) return <p className="muted">Cargando…</p>;
  if (!lista.length) return <p className="muted">Tu equipo no te ha pedido nada por ahora.</p>;
  return (
    <div className="pila">
      {lista.map((p) => <PeticionFila key={p.id} p={p} listo={cargar} />)}
    </div>
  );
}

function PeticionFila({ p, listo }: { p: Peticion; listo: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoPeticion, FormData>(resolverPeticion, {});
  useEffect(() => { if (e.ok) listo(); }, [e, listo]);
  const ir = p.tipo === "permiso" || p.tipo === "contrasena" ? { href: "/ajustes", texto: "Ir a Usuarios" } : null;
  return (
    <div className={`pt-f ${p.estado}`}>
      <span className="pt-cab"><b>{p.quien?.split(" ")[0]}: {TIPOS_PETICION[p.tipo]?.titulo.toLowerCase() ?? "petición"}</b><span className="chip-p">{p.estado === "abierta" ? fechaCorta(p.t) : "Resuelta"}</span></span>
      <p className="pt-txt">{p.texto}</p>
      {p.estado === "abierta" ? (
        <form action={accion} className="pila">
          <input type="hidden" name="id" value={p.id} />
          <textarea className="input" name="respuesta" rows={2} maxLength={400} placeholder="Respuesta (opcional). Ejemplo: listo, ya tienes el permiso" />
          {e.error && <p className="aviso error">{e.error}</p>}
          <div className="acciones">{ir && <a className="link-c" href={ir.href}>{ir.texto}</a>}<button className="bt chico" disabled={guardando}>{guardando ? "Guardando…" : "Marcar como resuelta"}</button></div>
        </form>
      ) : p.respuesta ? <small className="muted">Respuesta: {p.respuesta}</small> : null}
    </div>
  );
}
