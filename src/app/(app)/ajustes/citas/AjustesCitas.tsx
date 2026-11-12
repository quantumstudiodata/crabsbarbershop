"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import type { ConfigCitas as Config, Horario, ModoPago } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import { guardarConfigCitas, guardarDescansosFijos, guardarInterruptorHorarios, quitarBloqueo, type Res } from "../../citas/actions";
import { EditarHorario, EditarRotacion, EditorSemana, NuevoBloqueo, type Bloqueo, type Persona, type Rot } from "../../citas/PantallaCitas";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const MODOS: [ModoPago, string][] = [["sin_pago", "Sin pago"], ["opcional", "Pago opcional"], ["anticipo_pct", "Anticipo por porcentaje"], ["anticipo_fijo", "Anticipo de cantidad fija"], ["completo", "Pago completo"]];
const primer = (n: string) => n.split(" ")[0];
const hora = (t: string) => (t.endsWith(":00") ? String(Number(t.slice(0, 2))) : t.replace(/^0/, ""));
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
type Tab = "horarios" | "reservaciones";

export function AjustesCitas(p: {
  tab: Tab; negocio: string; origen: string; puedeConfig: boolean; puedeHorarios: boolean; cobraEnLinea: boolean;
  inicial: { usaCitas: boolean; slug: string; horario: Horario; cerrados: string[]; config: Config };
  equipo: Persona[]; rotacion: Rot | null; bloqueos: Bloqueo[]; hoy: string; servicios: { nombre: string; precio: number }[]; quien: [string, string][];
}) {
  const router = useRouter();
  const c = p.inicial.config;
  const base = () => ({
    usaCitas: p.inicial.usaCitas, enLinea: c.enLinea, slug: p.inicial.slug, horario: p.inicial.horario, diasCerrados: p.inicial.cerrados,
    anticipacionMinHoras: String(c.anticipacionMinMin / 60), anticipacionMaxDias: String(c.anticipacionMaxDias), margenMin: String(c.margenMin), pasoMin: "15",
    elegirBarbero: c.elegirBarbero, cualquierBarbero: c.cualquierBarbero, variosServicios: c.variosServicios,
    pagoModo: c.pago.modo, pagoValor: c.pago.modo === "anticipo_pct" || c.pago.modo === "anticipo_fijo" ? String(c.pago.valor / 100) : "",
    cancelarHorasAntes: String(c.cancelarHorasAntes), politicaCancelacion: c.politicaCancelacion, politicaReembolso: c.politicaReembolso,
  });
  const [d, setD] = useState(base);
  const [sucio, setSucio] = useState(false);
  const tabs = ([["horarios", "Horarios"], ...(p.puedeConfig ? [["reservaciones", "Reservaciones en línea"]] : [])] as [Tab, string][]);
  const [tab, setTab] = useState<Tab>(tabs.some(([k]) => k === p.tab) ? p.tab : "horarios");
  const [res, setRes] = useState<Res>({});
  const [pend, iniciar] = useTransition();
  const cambia = (x: Partial<typeof d>) => { setD({ ...d, ...x }); setSucio(true); setRes({}); };
  const elegir = (k: Tab) => { setTab(k); setRes({}); try { history.replaceState(null, "", `/ajustes/citas?tab=${k}`); } catch { /* sin historial */ } };
  const guardar = () => iniciar(async () => { const r = await guardarConfigCitas(d); setRes(r); if (!r.error) { setSucio(false); router.refresh(); } });
  const avisar = (r: Res) => { setRes(r); router.refresh(); };
  const barraGuardar = p.puedeConfig && (sucio || res.mensaje || res.error) && (
    <div className="ac-guardar">
      <span>{res.error ? <span className="ac-err">{res.error}</span> : res.mensaje && !sucio ? <><Icono n="palomita" />{res.mensaje}</> : "Tienes cambios sin guardar."}</span>
      {sucio && <div className="fila" style={{ gap: 8 }}><button type="button" className="bt sec chico" onClick={() => { setD(base()); setSucio(false); setRes({}); }}>Descartar</button><button type="button" className="bt chico" disabled={pend} onClick={guardar}>{pend ? "Guardando…" : "Guardar cambios"}<Fl /></button></div>}
    </div>
  );
  return (
    <div className="ac">
      <div className="ac-cab"><h1>Citas y agenda</h1><span>Configura los horarios, la disponibilidad y las reglas de reservación de tu negocio.</span></div>
      {tabs.length > 1 && (
        <div className="ac-tabs" role="tablist" aria-label="Citas y agenda">
          {tabs.map(([k, t]) => <button type="button" key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => elegir(k)}>{t}</button>)}
        </div>
      )}
      {tab === "horarios" && <Horarios {...p} d={d} cambia={cambia} avisar={avisar} guardando={pend} guardar={guardar} sucio={sucio} />}
      {tab === "reservaciones" && (
        <div className="ac-dos">
          <div className="ac-col">
            <section className="glass ac-card">
              <div className="ac-sw"><span><b>Citas y agenda</b><small>Muestra la sección de citas al equipo</small></span><Interruptor etiqueta="Citas y agenda" checked={d.usaCitas} onChange={() => cambia({ usaCitas: !d.usaCitas })} /></div>
              <div className="ac-sw"><span><b>Página de reservaciones</b><small>{d.enLinea ? "Publicada: los clientes reservan desde el enlace" : "Sin publicar: solo el equipo agenda citas"}</small></span><Interruptor etiqueta="Página de reservaciones" checked={d.enLinea} onChange={() => cambia({ enLinea: !d.enLinea })} /></div>
              <span className="lab">Dirección de la página</span>
              <span className="con-prefijo"><em>{p.origen}/reservar/</em><input className="input" value={d.slug} onChange={(e) => cambia({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={40} aria-label="Dirección de la página" /></span>
              <small className="ac-nota">De 3 a 40 letras, números o guiones. Si la cambias, el enlace anterior deja de funcionar.</small>
              {p.inicial.slug && p.inicial.config.enLinea && (
                <div className="fila" style={{ gap: 14 }}>
                  <a className="eq2-link" href={`/reservar/${p.inicial.slug}?desde=ajustes`}>Ver página</a>
                  <Copiar texto={`https://${p.origen}/reservar/${p.inicial.slug}`} conTexto />
                </div>
              )}
            </section>
            <section className="glass ac-card">
              <span className="lab">Cuándo se puede reservar</span>
              <Num etiqueta="Con al menos" valor={d.anticipacionMinHoras} unidad="horas de anticipación" onChange={(v) => cambia({ anticipacionMinHoras: v })} />
              <Num etiqueta="Hasta" valor={d.anticipacionMaxDias} unidad="días hacia adelante" onChange={(v) => cambia({ anticipacionMaxDias: v })} />
            </section>
            <section className="glass ac-card">
              <span className="lab">Descanso entre clientes</span>
              <div className="ac-chips" role="radiogroup" aria-label="Descanso entre clientes">
                {(["0", "5", "10", "15", "20", "30"].includes(d.margenMin) ? ["0", "5", "10", "15", "20", "30"] : ["0", "5", "10", "15", "20", "30", d.margenMin]).map((v) => (
                  <button type="button" key={v} role="radio" aria-checked={d.margenMin === v} className={d.margenMin === v ? "on" : ""} onClick={() => cambia({ margenMin: v, pasoMin: "15" })}>{v === "0" ? "Sin descanso" : `${v} min`}</button>
                ))}
              </div>
              <p className="ac-ejemplo">
                {d.margenMin === "0" ? "Si alguien termina un corte a las 10:30, su siguiente cita puede empezar a las 10:30." : `Si alguien termina un corte a las 10:30, su siguiente cita puede empezar a las ${(() => { const m = 630 + (Number(d.margenMin) || 0); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; })()}. Sirve para limpiar, cobrar y no hacer esperar al siguiente cliente.`}
                {" "}Los horarios se ofrecen cada 15 minutos.
              </p>
            </section>
            <section className="glass ac-card">
              <span className="lab">Cómo reservan</span>
              <div className="ac-sw"><span>El cliente elige quién lo atiende</span><Interruptor etiqueta="Elegir quién atiende" checked={d.elegirBarbero} onChange={() => cambia({ elegirBarbero: !d.elegirBarbero })} /></div>
              <div className="ac-sw"><span>Puede reservar con quien esté libre</span><Interruptor etiqueta="Quien esté libre" checked={d.cualquierBarbero} onChange={() => cambia({ cualquierBarbero: !d.cualquierBarbero })} /></div>
              <div className="ac-sw"><span>Puede reservar varios servicios</span><Interruptor etiqueta="Varios servicios" checked={d.variosServicios} onChange={() => cambia({ variosServicios: !d.variosServicios })} /></div>
              <label className="ac-fila"><span>Pago al reservar</span>
                <Selector etiqueta="Forma de pago al reservar" valor={d.pagoModo} onChange={(v) => cambia({ pagoModo: v as ModoPago })} opciones={MODOS.map(([k, t]) => ({ valor: k, texto: t }))} /></label>
              {(d.pagoModo === "anticipo_pct" || d.pagoModo === "anticipo_fijo") && <Num etiqueta={d.pagoModo === "anticipo_pct" ? "Porcentaje del anticipo" : "Cantidad del anticipo"} valor={d.pagoValor} unidad={d.pagoModo === "anticipo_pct" ? "%" : "pesos"} onChange={(v) => cambia({ pagoValor: v })} />}
              {d.pagoModo !== "sin_pago" && !p.cobraEnLinea && <small className="ac-nota">Para cobrar en línea, conecta Stripe en Configuración del negocio. Mientras tanto las reservaciones se guardan sin pago y el cliente paga en el negocio.</small>}
            </section>
            <section className="glass ac-card">
              <span className="lab">Cancelaciones</span>
              <Num etiqueta="Se puede cambiar hasta" valor={d.cancelarHorasAntes} unidad="horas antes" onChange={(v) => cambia({ cancelarHorasAntes: v })} />
              <label className="ac-campo"><span>Texto de la política</span><textarea className="input" rows={2} maxLength={400} value={d.politicaCancelacion} onChange={(e) => cambia({ politicaCancelacion: e.target.value })} /></label>
              <label className="ac-campo"><span>Política de reembolso</span><textarea className="input" rows={2} maxLength={400} value={d.politicaReembolso} onChange={(e) => cambia({ politicaReembolso: e.target.value })} placeholder="Ejemplo: los pagos no son reembolsables; puedes reagendar tu cita." /></label>
            </section>
            <section className="glass ac-card">
              <span className="lab">Quién puede</span>
              {p.quien.map(([t, q]) => <div key={t} className="ac-fila"><span>{t}</span><b>{q}</b></div>)}
              <small className="ac-nota">Se cambia en Usuarios, con los permisos de cada puesto o persona.</small>
            </section>
          </div>
          <Vista negocio={p.negocio} servicios={p.servicios} politica={d.politicaCancelacion} activa={d.enLinea && d.usaCitas} />
        </div>
      )}
      {tab !== "horarios" && barraGuardar}
      {tab === "horarios" && res.error && <p className="aviso error" style={{ margin: 0 }}>{res.error}</p>}
      {tab === "horarios" && res.mensaje && !res.error && <p className="confirma"><Icono n="palomita" />{res.mensaje}</p>}
    </div>
  );
}

function Num({ etiqueta, valor, unidad, onChange }: { etiqueta: string; valor: string; unidad: string; onChange: (v: string) => void }) {
  return (
    <label className="ac-fila"><span>{etiqueta}</span>
      <span className="ac-num"><input inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} aria-label={etiqueta} /><em>{unidad}</em></span></label>
  );
}

function Copiar({ texto, conTexto }: { texto: string; conTexto?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="ac-copiar" onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1800); })}>
      <Icono n={ok ? "palomita" : "copiar"} />{ok ? "Copiado" : conTexto ? "Copiar enlace" : "Copiar"}
    </button>
  );
}

/** Así lo ve el cliente: se actualiza con lo que cambias, antes de guardar. */
function Vista({ negocio, servicios, politica, activa }: { negocio: string; servicios: { nombre: string; precio: number }[]; politica: string; activa: boolean }) {
  return (
    <aside className="ac-vista" aria-label="Vista previa">
      <span className="lab">Así lo ve el cliente</span>
      <div className="ac-tel">
        <div className={`ac-pant ${activa ? "" : "apagada"}`}>
          <b>{negocio}</b><small>Reserva tu cita</small>
          {servicios.slice(0, 3).map((s) => <span key={s.nombre} className="ac-svc">{s.nombre}<b>{formatoDinero(s.precio)}</b></span>)}
          {politica && <small className="ac-pol">{politica}</small>}
          <span className="ac-cta">Elegir horario</span>
          {!activa && <span className="ac-off">Reservaciones apagadas</span>}
        </div>
      </div>
    </aside>
  );
}

function Horarios(p: {
  puedeConfig: boolean; puedeHorarios: boolean; equipo: Persona[]; rotacion: Rot | null; bloqueos: Bloqueo[]; hoy: string;
  inicial: { config: Config }; d: { horario: Horario; diasCerrados: string[] }; cambia: (x: { horario?: Horario; diasCerrados?: string[] }) => void;
  avisar: (r: Res) => void; guardar: () => void; guardando: boolean; sucio: boolean;
}) {
  const [editarNegocio, setEditarNegocio] = useState(false);
  const [abierto, setAbierto] = useState<"persona" | "rot" | "fijo" | "bloq" | null>(null);
  const [editar, setEditar] = useState<Persona | null>(null);
  const [rot, setRot] = useState(false);
  const [bloq, setBloq] = useState(false);
  const [sw, setSw] = useState({ usaHorarioPersona: p.inicial.config.usaHorarioPersona, usaRotacion: p.inicial.config.usaRotacion, usaBloqueos: p.inicial.config.usaBloqueos, usaDescansoFijo: p.inicial.config.usaDescansoFijo });
  const [fijo, setFijo] = useState<{ persona: string; dias: number[]; nuevo: boolean } | null>(null);
  const fijos = p.inicial.config.descansosFijos;
  // Cada persona tiene un solo modo de descanso: los de la rotación no pueden tener descanso fijo y al revés.
  const enRotacion = p.rotacion ? [p.rotacion.persona1, p.rotacion.persona2] : [];
  const libresFijo = p.equipo.filter((e) => !enRotacion.includes(e.id) && !fijos.some((f) => f.persona === e.id));
  const [pend, iniciar] = useTransition();
  const puedeSw = p.puedeHorarios || p.puedeConfig;
  const cambiarSw = (k: keyof typeof sw) => { const v = !sw[k]; setSw({ ...sw, [k]: v }); iniciar(async () => { const r = await guardarInterruptorHorarios(k, v); if (r.error) setSw((x) => ({ ...x, [k]: !v })); p.avisar(r); }); };
  const nom = (id: string) => primer(p.equipo.find((e) => e.id === id)?.nombre ?? "");
  const propios = p.equipo.filter((e) => e.horario);
  const rotTxt = p.rotacion ? `${nom(p.rotacion.persona1)} y ${nom(p.rotacion.persona2)}, ${DIAS_L[p.rotacion.dia1]} y ${DIAS_L[p.rotacion.dia2]}` : "Sin configurar";
  const resumen = (h: Horario | null) => {
    const b = h ?? p.d.horario;
    const dias = ORDEN.filter((x) => b[String(x)]);
    if (!dias.length) return "Sin días de trabajo";
    const iguales = dias.every((x) => b[String(x)][0] === b[String(dias[0])][0] && b[String(x)][1] === b[String(dias[0])][1]);
    return `${h ? "" : "Igual que el negocio: "}${DIAS[dias[0]]} a ${DIAS[dias[dias.length - 1]]}${iguales ? `, ${b[String(dias[0])][0]} a ${b[String(dias[0])][1]}` : ""}`;
  };
  const fila = (k: keyof typeof sw, titulo: string, texto: string, estado: string, cual: "persona" | "rot" | "fijo" | "bloq", cuerpo: React.ReactNode) => (
    <div className="ac-hrow">
      <div className="ac-sw">
        <span><b>{titulo}</b><small>{texto}</small>
          <button type="button" className="ac-estado" aria-expanded={abierto === cual} onClick={() => setAbierto(abierto === cual ? null : cual)}>{sw[k] ? estado : "Apagado, no se aplica"}<span>{abierto === cual ? "Ocultar" : "Configurar"}</span><Icono n={abierto === cual ? "arriba" : "abajo"} /></button></span>
        <Interruptor etiqueta={titulo} checked={sw[k]} disabled={!puedeSw || pend} onChange={() => cambiarSw(k)} />
      </div>
      {abierto === cual && <div className="ac-det">{cuerpo}</div>}
    </div>
  );
  return (
    <div className="ac-col ac-angosta">
      <section className="glass ac-card">
        <div className="entre"><b className="ac-t">Horario del negocio</b>{p.puedeConfig && <button type="button" className="ac-link" onClick={() => setEditarNegocio(!editarNegocio)}>{editarNegocio ? "Cerrar" : "Editar"}</button>}</div>
        {editarNegocio ? (
          <div className="pila" style={{ gap: 14 }}>
            <EditorSemana valor={p.d.horario} onChange={(h) => p.cambia({ horario: h })} />
            <div className="acciones"><button type="button" className="bt" disabled={p.guardando || !p.sucio} onClick={p.guardar}>{p.guardando ? "Guardando…" : "Guardar horario"}<Fl /></button></div>
          </div>
        ) : (
          <>
            <div className="ac-semana">
              {ORDEN.map((x) => { const h = p.d.horario[String(x)]; return <span key={x} className={h ? "" : "cerr"}><b>{DIAS[x]}</b><small>{h ? `${hora(h[0])} a ${hora(h[1])}` : "Cerrado"}</small></span>; })}
            </div>
            <small className="ac-nota">Para un día festivo o vacaciones, usa Bloqueo de horarios con la opción Todo el día.</small>
          </>
        )}
      </section>
      <section className="glass ac-card ac-hrows">
        {fila("usaHorarioPersona", "Horarios personalizados por persona", "Permite que cada persona tenga un horario diferente al del negocio",
          propios.length ? `${lista(propios.map((e) => primer(e.nombre)))} ${propios.length === 1 ? "tiene" : "tienen"} horario propio` : "Todos usan el horario del negocio", "persona",
          <>{p.equipo.map((e) => (
            <div key={e.id} className="ac-p">
              <Avatar avatar={e.avatar} nombre={e.nombre} t={28} />
              <span className="ac-pt"><b>{primer(e.nombre)}</b><small>{resumen(e.horario)}</small></span>
              {p.puedeHorarios && <button type="button" className="ac-link" onClick={() => setEditar(e)}>Editar</button>}
            </div>
          ))}{!p.equipo.length && <small className="ac-nota">No hay personas que atiendan citas.</small>}</>)}
        {fila("usaRotacion", "Descanso rotativo", "Alterna los días de descanso entre dos personas cada semana", rotTxt, "rot",
          <div className="ac-p">
            <span className="ac-pt"><b>{p.rotacion ? "Esta semana" : "Sin configurar"}</b><small>{p.rotacion ? lista(p.rotacion.estaSemana.map((x) => `${nom(x.persona)} descansa el ${DIAS_L[x.dia]}`)) : "Dos personas se turnan dos días de descanso cada semana."}</small></span>
            {p.puedeHorarios && <button type="button" className="ac-link" onClick={() => setRot(true)}>{p.rotacion ? "Editar" : "Configurar"}</button>}
          </div>)}
        {fila("usaDescansoFijo", "Descanso fijo por persona", "Una persona descansa siempre los mismos días de la semana",
          fijos.length ? lista(fijos.map((f) => `${nom(f.persona)} descansa ${lista(f.dias.map((x) => DIAS_L[x]))}`)) : "Sin descansos fijos", "fijo",
          <>{fijos.map((f) => (
            <div key={f.persona} className="ac-p">
              <span className="ac-pt"><b>{nom(f.persona)}</b><small>Descansa {lista(f.dias.map((x) => DIAS_L[x]))}</small></span>
              {p.puedeHorarios && <button type="button" className="ac-link" onClick={() => setFijo({ ...f, nuevo: false })}>Editar</button>}
            </div>
          ))}
          {p.puedeHorarios && (libresFijo.length
            ? <button type="button" className="ac-link ac-mas" onClick={() => setFijo({ persona: libresFijo[0].id, dias: [], nuevo: true })}><Icono n="mas" />Agregar descanso fijo</button>
            : <small className="ac-nota">{p.equipo.length && p.equipo.every((e) => enRotacion.includes(e.id)) ? "Todas las personas ya tienen descanso rotativo. Para darle descanso fijo a alguien, primero sácala de la rotación." : "Todas las personas ya tienen un descanso asignado."}</small>)}</>)}
        {fila("usaBloqueos", "Bloqueo de horarios", "Bloquea unas horas o el día completo, para todo el negocio o para una persona",
          p.bloqueos.length ? `${p.bloqueos.length} ${p.bloqueos.length === 1 ? "bloqueo próximo" : "bloqueos próximos"}` : "Sin bloqueos próximos", "bloq",
          <>{p.bloqueos.map((x) => (
            <div key={x.id} className="ac-p">
              <span className="ac-pt"><b>{x.persona}</b><small>{x.fecha.split("-").reverse().slice(0, 2).join("/")}, {x.desde === "00:00" && x.hasta === "23:59" ? "todo el día" : `${x.desde} a ${x.hasta}`}{x.motivo ? `, ${x.motivo}` : ""}</small></span>
              {p.puedeHorarios && <button type="button" className="icb" disabled={pend} aria-label="Quitar bloqueo" onClick={() => iniciar(async () => p.avisar(await quitarBloqueo(x.id)))}><Icono n="basura" /></button>}
            </div>
          ))}{p.puedeHorarios && <button type="button" className="ac-link ac-mas" onClick={() => setBloq(true)}><Icono n="mas" />Bloquear horario o día</button>}</>)}
      </section>
      <small className="ac-nota">Apagar un interruptor no borra lo configurado: solo deja de aplicarse en la agenda y en las reservaciones.</small>
      {editar && <EditarHorario persona={editar} negocio={p.d.horario} cerrar={() => setEditar(null)} avisar={p.avisar} />}
      {rot && <EditarRotacion equipo={p.equipo} excluir={fijos.map((f) => f.persona)} actual={p.rotacion} dia={p.hoy} cerrar={() => setRot(false)} avisar={p.avisar} />}
      {fijo && <EditarDescansoFijo actual={fijo} opciones={fijo.nuevo ? libresFijo : p.equipo.filter((e) => e.id === fijo.persona)} lista={fijos} cerrar={() => setFijo(null)} avisar={p.avisar} />}
      {bloq && <NuevoBloqueo equipo={p.equipo} dia={p.hoy} cerrar={() => setBloq(false)} avisar={p.avisar} />}
    </div>
  );
}

/** Descanso fijo de una persona: los días de la semana que siempre descansa. */
function EditarDescansoFijo({ actual, opciones, lista: todos, cerrar, avisar }: { actual: { persona: string; dias: number[]; nuevo: boolean }; opciones: Persona[]; lista: { persona: string; dias: number[] }[]; cerrar: () => void; avisar: (r: Res) => void }) {
  const [persona, setPersona] = useState(actual.persona);
  const [dias, setDias] = useState<number[]>(actual.dias);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const guardarLista = (nueva: { persona: string; dias: number[] }[]) => iniciar(async () => { const r = await guardarDescansosFijos(nueva); if (r.error) setError(r.error); else { avisar(r); cerrar(); } });
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Horarios" titulo="Descanso fijo">
      <div className="pila" style={{ gap: 14 }}>
        <div className="campo"><span>Persona</span>
          {actual.nuevo
            ? <Selector etiqueta="Persona" valor={persona} onChange={setPersona} opciones={opciones.map((e) => ({ valor: e.id, texto: primer(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }))} />
            : <b>{primer(opciones[0]?.nombre ?? "")}</b>}
        </div>
        <small className="ac-nota">Solo aparecen quienes no están en el descanso rotativo.</small>
        <div className="campo"><span>Descansa los</span>
          <div className="dias-fijo" role="group" aria-label="Días de descanso">
            {ORDEN.map((x) => <button key={x} type="button" aria-pressed={dias.includes(x)} className={`chipf ${dias.includes(x) ? "on-suave" : ""}`} onClick={() => setDias(dias.includes(x) ? dias.filter((y) => y !== x) : [...dias, x])}>{DIAS[x]}</button>)}
          </div>
        </div>
        <small className="ac-nota">Esos días no aparece en la agenda ni en las reservaciones.</small>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="entre">
          {!actual.nuevo ? <button type="button" className="link-c peligro-t" disabled={pend} onClick={() => guardarLista(todos.filter((f) => f.persona !== actual.persona))}>Quitar descanso fijo</button> : <span />}
          <button type="button" className="bt" disabled={pend || !dias.length || !persona} onClick={() => guardarLista([...todos.filter((f) => f.persona !== persona), { persona, dias }])}>Guardar<Fl /></button>
        </div>
      </div>
    </Modal>
  );
}
