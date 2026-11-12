"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Icono } from "@/components/Icono";
import { aHora, type Horario } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import { agendarCita, horariosAgenda, type CitaLista, type Res } from "./actions";
import { CampoFecha } from "@/components/Calendario";

type Persona = { id: string; nombre: string };
type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number };

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_L = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const primer = (n: string) => n.split(" ")[0];
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const TITULOS = ["¿Qué servicios?", "¿Cuándo y con quién?", "¿Para quién es?"];

/**
 * Nueva cita en tres pasos: servicios, cuándo y con quién, y los datos del cliente.
 * En escritorio es una ventana angosta; en el teléfono, una hoja que sube desde abajo. Solo se cierra con la X.
 */
export function NuevaCita({ equipo, servicios, dia, hoy, horario, cerrados, cerrar, avisar, minutoInicial, personaInicial = "" }: {
  equipo: Persona[]; servicios: Servicio[]; dia: string; hoy: string; horario: Horario; cerrados: string[]; minutoInicial?: number; personaInicial?: string;
  cerrar: () => void; avisar: (r: Res) => void;
}) {
  const [paso, setPaso] = useState(0);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [persona, setPersona] = useState(personaInicial);
  // Desde un hueco libre de la agenda: se propone esa hora la primera vez que aparece libre.
  const propuesta = useRef(minutoInicial !== undefined && minutoInicial >= 0 ? minutoInicial : null);
  const abierto = (f: string) => !cerrados.includes(f) && !!horario[String(dow(f))];
  // Los próximos días que abre el negocio, empezando por el día que se está viendo en la agenda.
  const dias = useMemo(() => {
    const xs: string[] = [];
    for (let f = dia < hoy ? hoy : dia, i = 0; xs.length < 6 && i < 30; i++, f = sumar(f, 1)) if (abierto(f)) xs.push(f);
    return xs.length ? xs : [dia < hoy ? hoy : dia];
  }, [dia, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fecha, setFecha] = useState(dias[0]);
  const [otra, setOtra] = useState(false);
  const [libres, setLibres] = useState<{ minuto: number; personas: string[] }[] | null>(null);
  const [minuto, setMinuto] = useState<number | null>(null);
  const [tramo, setTramo] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const [listo, setListo] = useState<CitaLista | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [montado, setMontado] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!montado) return;
    const previo = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", tecla);
    document.body.classList.add("con-hoja");
    return () => { document.removeEventListener("keydown", tecla); document.body.classList.remove("con-hoja"); previo?.focus?.(); };
  }, [montado]); // eslint-disable-line react-hooks/exhaustive-deps
  // Al cambiar de paso, el foco va al título para que se lea dónde se está.
  useEffect(() => { ref.current?.querySelector<HTMLElement>("h2")?.focus(); setError(null); }, [paso, montado]);
  useEffect(() => {
    setMinuto(null);
    if (paso < 1 || !elegidos.length) return;
    let vivo = true;
    setLibres(null);
    horariosAgenda(fecha, elegidos, persona || null).then((r) => {
      if (!vivo) return;
      setLibres(r);
      if (propuesta.current !== null) {
        const x = r.find((l) => l.minuto >= propuesta.current!);
        if (x) setMinuto(x.minuto);
        propuesta.current = null;
      }
    });
    return () => { vivo = false; };
  }, [fecha, persona, elegidos.join(","), paso >= 1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las horas libres se agrupan en mañana, tarde y noche para no mostrar una lista larga.
  const grupos = ([["m", "Mañana", 0, 720], ["t", "Tarde", 720, 1080], ["n", "Noche", 1080, 1440]] as const)
    .map(([k, t, a, b]) => ({ k, t, xs: (libres ?? []).filter((x) => x.minuto >= a && x.minuto < b) })).filter((g) => g.xs.length);
  const tramoV = grupos.some((g) => g.k === tramo) ? tramo : grupos.find((g) => minuto !== null && g.xs.some((x) => x.minuto === minuto))?.k ?? grupos[0]?.k;
  const sel = elegidos.map((id) => servicios.find((s) => s.id === id)).filter(Boolean) as Servicio[];
  const mas = (id: string) => setElegidos((xs) => (xs.length >= 6 ? xs : [...xs, id]));
  const menos = (id: string) => setElegidos((xs) => { const i = xs.lastIndexOf(id); return i < 0 ? xs : [...xs.slice(0, i), ...xs.slice(i + 1)]; });
  const total = sel.reduce((a, s) => a + s.precio, 0);
  const duracion = sel.reduce((a, s) => a + s.duracionMin, 0);
  const cats = [...new Set(servicios.map((s) => s.categoria))];
  const quien = persona ? primer(equipo.find((e) => e.id === persona)?.nombre ?? "") : "Quien esté libre";
  const cuandoCorto = minuto === null ? "" : `${DIAS[dow(fecha)]} ${Number(fecha.slice(8))}, ${aHora(minuto)}`;
  const cuando = minuto === null ? "" : `${DIAS_L[dow(fecha)]} ${Number(fecha.slice(8))}, ${aHora(minuto)} a ${aHora(minuto + duracion)}`;

  const siguiente = () => {
    if (paso === 0 && !elegidos.length) { setError("Elige al menos un servicio."); return; }
    if (paso === 1 && minuto === null) { setError("Elige la hora."); return; }
    if (paso < 2) { setPaso(paso + 1); return; }
    if (nombre.trim().length < 2) { setError("Escribe el nombre del cliente."); return; }
    iniciar(async () => {
      const r = await agendarCita({ servicioIds: elegidos, persona: persona || null, fecha, minuto: minuto!, nombre, telefono: tel, observaciones: obs });
      if (r.error) setError(r.error); else { avisar({ mensaje: r.mensaje }); setListo(r); }
    });
  };

  if (!montado) return null;
  if (listo) {
    const url = listo.enlace ? `${window.location.origin}${listo.enlace}` : "";
    const hora = minuto === null ? "" : aHora(minuto);
    const servicioTxt = lista([...new Set(sel.map((s) => s.nombre))].map((n) => { const k = sel.filter((s) => s.nombre === n).length; return k > 1 ? `${n} x${k}` : n; }));
    const con = listo.con || quien;
    const msg = `Hola ${primer(nombre.trim())}, tu cita en ${listo.negocio} quedó para el ${DIAS_L[dow(fecha)].toLowerCase()} ${Number(fecha.slice(8))} a las ${hora} con ${con} (${servicioTxt}, ${formatoDinero(listo.total ?? total)}).${url ? ` Aquí puedes verla, cambiarla o cancelarla: ${url}` : ""}`;
    const d = tel.replace(/\D/g, "");
    const wa = `https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(msg)}`;
    return createPortal(
      <div className="capa nc-capa">
        <div ref={ref} className="nc nc-listo" role="dialog" aria-modal="true" aria-labelledby={id}>
          <div className="nc-cab">
            <span className="nc-asa" aria-hidden="true" />
            <div className="entre">
              <span className="nc-ok"><span className="nc-ok-i" aria-hidden="true"><Icono n="palomita" /></span><span><h2 id={id} tabIndex={-1}>Cita agendada</h2><small>Folio {listo.folio}</small></span></span>
              <button type="button" className="icb cerrar-x" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button>
            </div>
          </div>
          <div className="nc-cuerpo">
            <div className="nc-ticket">
              <div><span>Cliente</span><b>{nombre.trim()}</b></div>
              <div><span>Cuándo</span><b>{cuandoCorto}</b></div>
              <div><span>Con</span><b>{con}</b></div>
              <div><span>Servicio</span><b>{servicioTxt}</b></div>
              <div><span>Total</span><b className="num nc-tt">{formatoDinero(listo.total ?? total)}</b></div>
            </div>
            <span className="lab">Mensaje para el cliente</span>
            <p className="nc-msg">{msg}</p>
          </div>
          <div className="nc-acc">
            <a className="bt nc-wa" href={wa} target="_blank" rel="noreferrer" onClick={() => setTimeout(cerrar, 300)}>Enviar por WhatsApp</a>
            {url && <button type="button" className="bt sec" onClick={async () => { try { await navigator.clipboard.writeText(msg); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ } }}>{copiado ? "Copiado" : "Copiar mensaje"}</button>}
            {url && <a className="bt sec" href={url} target="_blank" rel="noreferrer">Ver como cliente</a>}
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div className="capa nc-capa">
      <div ref={ref} className="nc" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="nc-cab">
          <span className="nc-asa" aria-hidden="true" />
          <div className="entre">
            <span className="nc-tit"><small className="lab">Paso {paso + 1} de 3</small><h2 id={id} tabIndex={-1}>{TITULOS[paso]}</h2></span>
            <button type="button" className="icb cerrar-x" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button>
          </div>
          <div className="nc-prog" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= paso ? "on" : ""} />)}</div>
        </div>

        <div className="nc-cuerpo">
          {paso === 0 && (
            <>
              <small className="nc-ayuda">Toca + para agregar; puedes repetir un servicio</small>
              {cats.map((c) => (
                <div key={c} className="nc-grupo nc-lista">
                  {cats.length > 1 && <span className="lab">{c}</span>}
                  {servicios.filter((s) => s.categoria === c).map((s) => {
                    const n = elegidos.filter((x) => x === s.id).length;
                    return (
                      <div key={s.id} className={`nc-fila ${n ? "on" : ""}`}>
                        <button type="button" className="nc-n" onClick={() => mas(s.id)}><b>{s.nombre}</b><small>{s.duracionMin} min</small></button>
                        <b className="num nc-p">{formatoDinero(s.precio)}</b>
                        {n ? (
                          <span className="cm-step nc-step">
                            <button type="button" aria-label={`Quitar uno de ${s.nombre}`} onClick={() => menos(s.id)}><Icono n="minimizar" /></button>
                            <b>{n}</b>
                            <button type="button" aria-label={`Agregar otro ${s.nombre}`} disabled={elegidos.length >= 6} onClick={() => mas(s.id)}><Icono n="mas" /></button>
                          </span>
                        ) : <button type="button" className="cm-add nc-add" aria-label={`Agregar ${s.nombre}`} disabled={elegidos.length >= 6} onClick={() => mas(s.id)}><Icono n="mas" /></button>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {paso === 1 && (
            <>
              <div className="nc-campo"><span>Quién atiende</span>
                <div className="nc-seg" role="radiogroup" aria-label="Quién atiende">
                  {[{ id: "", nombre: "Cualquiera" }, ...equipo].map((e) => (
                    <button type="button" key={e.id} role="radio" aria-checked={persona === e.id} className={persona === e.id ? "on" : ""} onClick={() => setPersona(e.id)}>{primer(e.nombre)}</button>
                  ))}
                </div>
              </div>
              <div className="nc-campo">
                <div className="entre"><span>Día</span><button type="button" className="nc-otra" aria-expanded={otra} onClick={() => setOtra(!otra)}><Icono n="calendario" />Otra fecha</button></div>
                {otra ? <CampoFecha valor={fecha} min={hoy} cambiar={(f) => f && setFecha(f)} etiqueta="Fecha de la cita" />
                  : <div className="nc-dias">
                    {(dias.includes(fecha) ? dias : [fecha, ...dias.slice(0, 5)]).map((f) => (
                      <button type="button" key={f} className={fecha === f ? "on" : ""} aria-pressed={fecha === f} onClick={() => setFecha(f)}>
                        {f === hoy ? "Hoy" : DIAS[dow(f)]}<b>{Number(f.slice(8))}</b>
                      </button>
                    ))}
                  </div>}
              </div>
              <div className="nc-campo"><span>Hora disponible</span>
                {libres === null ? <small className="muted">Buscando horarios…</small>
                  : libres.length === 0 ? <small className="muted">No hay horarios libres ese día. Prueba con otro día o con otra persona.</small>
                  : <>
                    {grupos.length > 1 && (
                      <div className="nc-seg nc-tramos" role="tablist" aria-label="Momento del día">
                        {grupos.map((g) => <button type="button" key={g.k} role="tab" aria-selected={g.k === tramoV} className={g.k === tramoV ? "on" : ""} onClick={() => setTramo(g.k)}>{g.t}<small>{g.xs.length}</small></button>)}
                      </div>
                    )}
                    <div className="nc-horas">{(grupos.find((g) => g.k === tramoV)?.xs ?? []).map((x) => <button type="button" key={x.minuto} className={minuto === x.minuto ? "on" : ""} aria-pressed={minuto === x.minuto} onClick={() => setMinuto(x.minuto)}>{aHora(x.minuto)}</button>)}</div>
                  </>}
                {!persona && <small className="muted">Con Cualquiera se asigna a quien esté libre a esa hora.</small>}
              </div>
            </>
          )}

          {paso === 2 && (
            <>
              <label className="nc-campo"><span>Nombre</span><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="off" /></label>
              <label className="nc-campo"><span>Teléfono</span><input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="10 dígitos" autoComplete="off" /></label>
              <label className="nc-campo"><span>Observaciones</span><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} placeholder="Opcional" /></label>
              <div className="nc-res">
                <div><span>Servicios</span><span>{lista([...new Set(sel.map((s) => s.nombre))].map((n) => { const k = sel.filter((s) => s.nombre === n).length; return k > 1 ? `${n} x${k}` : n; }))}</span></div>
                <div><span>Cuándo</span><span>{cuando}</span></div>
                <div><span>Con</span><span>{quien}</span></div>
              </div>
            </>
          )}
          {error && <p className="aviso error nc-err" role="alert">{error}</p>}
        </div>

        <div className="nc-pie">
          {paso > 0 && <button type="button" className="nc-atras" onClick={() => setPaso(paso - 1)} aria-label="Atrás"><Icono n="izquierda" /><span>Atrás</span></button>}
          <span className="nc-total">
            <small>{paso === 0 ? (sel.length ? `${sel.length} ${sel.length === 1 ? "servicio" : "servicios"}, ${duracion} min` : "Sin servicios") : paso === 1 ? (cuandoCorto || "Total") : "Total"}</small>
            <b className="num">{formatoDinero(total)}</b>
          </span>
          <button type="button" className="nc-sig" disabled={pend || (paso === 0 && !elegidos.length)} onClick={siguiente}>
            {pend ? "Guardando…" : paso === 2 ? "Agendar cita" : "Siguiente"}{!pend && <span className="nc-fl"><Icono n="derecha" /></span>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
