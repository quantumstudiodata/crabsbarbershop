"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Modal, Selector } from "@/components/ui";
import { aHora, aMin, type Horario } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import {
  agendarCita, bloquearHorario, cambiarEstadoCita, horariosCita, cancelarCita, guardarHorarioPersona, guardarRotacion, horariosAgenda, quitarBloqueo, quitarRotacion, reprogramarCita, type Res,
} from "./actions";

export type CitaVista = {
  id: string; folio: string; cliente: string; telefono: string; barberoId: string; barbero: string; indiferente: boolean;
  fecha: string; hora: string; horaFin: string; inicioMs: number; duracion: number; servicios: string[]; total: number;
  pagado: number | null; metodo: string | null; estadoPago: string | null; estado: string; observaciones: string; origen: string; creada: string; ventaId: string | null;
};
type Persona = { id: string; nombre: string; avatar: string; horario: Horario | null };
type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number };
type Rot = { persona1: string; persona2: string; dia1: number; dia2: number; semanaInicio: string; activo: boolean; estaSemana: { dia: number; persona: string }[] };

const ESTADO: Record<string, string> = { apartada: "Apartada", en_espera: "En espera", llego: "Llegó", en_atencion: "En atención", completada: "Completada", no_asistio: "No asistió", cancelada: "Cancelada" };
const PAGO: Record<string, string> = { sin_pago: "Sin pago", anticipo: "Anticipo", pagada: "Pagada" };
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const primer = (n: string) => n.split(" ")[0];
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (f: string) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const fechaTxt = (f: string) => `${DIAS_L[dow(f)]} ${Number(f.slice(8))} de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][Number(f.slice(5, 7)) - 1]}`;
const activa = (e: string) => ["apartada", "en_espera", "llego", "en_atencion"].includes(e);

export function PantallaCitas(p: {
  abrirNueva?: boolean;
  hoy: string; dia: string; vista: "lista" | "calendario" | "semana" | "horarios"; persona: string; citas: CitaVista[]; ahora: number;
  equipo: Persona[]; servicios: Servicio[]; horarioNegocio: Horario; cerrados: string[]; conteo: Record<string, number>;
  rotacion: Rot | null; bloqueos: { id: string; persona: string; fecha: string; desde: string; hasta: string; motivo: string }[];
  enlace: string | null; puede: { modificar: boolean; cancelar: boolean; pagos: boolean; horarios: boolean; cobrar: boolean };
}) {
  const router = useRouter();
  const [ver, setVer] = useState<CitaVista | null>(null);
  const [agendar, setAgendar] = useState(!!p.abrirNueva && p.puede.modificar);
  const [aviso, setAviso] = useState<Res>({});
  const [copiado, setCopiado] = useState(false);
  const url = (x: Partial<{ dia: string; vista: string; persona: string }>) => {
    const u = new URLSearchParams();
    const d = x.dia ?? p.dia, v = x.vista ?? p.vista, pe = x.persona ?? p.persona;
    if (d !== p.hoy) u.set("dia", d);
    if (v !== "lista") u.set("vista", v);
    if (pe) u.set("persona", pe);
    const t = u.toString();
    return `/citas${t ? `?${t}` : ""}`;
  };
  const citas = p.citas.filter((c) => !p.persona || c.barberoId === p.persona);
  const lunes = lunesDe(p.dia);
  const semana = Array.from({ length: 7 }, (_, i) => sumar(lunes, i));

  const copiar = () => {
    if (!p.enlace) return;
    navigator.clipboard?.writeText(`${window.location.origin}${p.enlace}`).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); });
  };

  return (
    <>
      <div className="entre cab-citas">
        <div>
          <h1 className="titulo">Citas y agenda</h1>
          <p className="sub">{p.dia === p.hoy ? "Hoy, " : ""}{fechaTxt(p.dia)}</p>
        </div>
        <div className="fila acc-citas">
          {p.enlace && <button type="button" className="icb" onClick={copiar} aria-label="Copiar el enlace de reservaciones" title="Copiar el enlace de reservaciones"><Icono n={copiado ? "palomita" : "copiar"} /></button>}
          {p.puede.modificar && <button type="button" className="bt" onClick={() => setAgendar(true)}>Agendar<span className="fl" aria-hidden="true"><Icono n="mas" /></span></button>}
        </div>
      </div>
      {copiado && <p className="confirma"><Icono n="palomita" />Enlace copiado. Compártelo por WhatsApp o redes sociales.</p>}
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.mensaje && !aviso.error && <p className="aviso ok">{aviso.mensaje}</p>}

      <div className="ctl-citas">
        <nav className="seg chico" aria-label="Vista">
          {([["lista", "Lista"], ["calendario", "Día"], ["semana", "Semana"], ...(p.puede.horarios ? [["horarios", "Horarios"]] : [])] as [string, string][]).map(([k, t]) => (
            <Link key={k} href={url({ vista: k })} scroll={false} aria-current={p.vista === k ? "page" : undefined}>{t}</Link>
          ))}
        </nav>
        {p.vista !== "horarios" && p.equipo.length > 1 && (
          <Selector className="sel-equipo" etiqueta="Persona" valor={p.persona} onChange={(v) => router.push(url({ persona: v }), { scroll: false })}
            opciones={[{ valor: "", texto: "Todo el equipo" }, ...p.equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }))]} />
        )}
      </div>

      {p.vista !== "horarios" && (
        <div className="tira-dias" role="group" aria-label="Días">
          <Link href={url({ dia: sumar(lunes, -7) })} scroll={false} className="flecha-d" aria-label="Semana anterior"><Icono n="izquierda" /></Link>
          {semana.map((d) => (
            <Link key={d} href={url({ dia: d })} scroll={false} className={`dia-t ${d === p.dia ? "on" : ""} ${d === p.hoy ? "hoy" : ""} ${p.cerrados.includes(d) || !p.horarioNegocio[String(dow(d))] ? "cerrado" : ""}`} aria-current={d === p.dia ? "date" : undefined}>
              <small>{DIAS[dow(d)]}</small><b>{Number(d.slice(8))}</b>{p.conteo[d] ? <i aria-label={`${p.conteo[d]} citas`} /> : <i className="sin" />}
            </Link>
          ))}
          <Link href={url({ dia: sumar(lunes, 7) })} scroll={false} className="flecha-d" aria-label="Semana siguiente"><Icono n="derecha" /></Link>
        </div>
      )}

      {p.vista === "lista" && <VistaLista citas={citas} ahora={p.ahora} esHoy={p.dia === p.hoy} abrir={setVer} puede={p.puede} avisar={setAviso} />}
      {p.vista === "calendario" && <VistaDia citas={citas} equipo={p.equipo.filter((e) => !p.persona || e.id === p.persona)} horario={p.horarioNegocio} dia={p.dia} abrir={setVer} />}
      {p.vista === "semana" && <VistaSemana citas={citas} semana={semana} horario={p.horarioNegocio} hoy={p.hoy} abrir={setVer} url={url} />}
      {p.vista === "horarios" && <VistaHorarios {...p} avisar={setAviso} />}

      {ver && <DetalleCita c={ver} cerrar={() => setVer(null)} puede={p.puede} equipo={p.equipo} avisar={setAviso} />}
      {agendar && <Agendar equipo={p.equipo} servicios={p.servicios} dia={p.dia} hoy={p.hoy} cerrar={() => setAgendar(false)} avisar={setAviso} />}
    </>
  );
}

function Chip({ e }: { e: string }) {
  return <span className={`chip-cita e-${e}`}><i />{ESTADO[e] ?? e}</span>;
}

/** Botón con el siguiente paso natural de la cita. */
function SiguientePaso({ c, avisar }: { c: CitaVista; avisar: (r: Res) => void }) {
  const [pend, iniciar] = useTransition();
  const paso = c.estado === "en_espera" ? ["llego", "Llegó"] : c.estado === "llego" ? ["en_atencion", "Atender"] : c.estado === "en_atencion" ? ["completada", "Completar"] : null;
  if (!paso) return null;
  return <button type="button" className="bt chico paso-c" disabled={pend} onClick={(e) => { e.stopPropagation(); iniciar(async () => { const r = await cambiarEstadoCita(c.id, paso[0]); if (r.error) avisar(r); }); }}>{paso[1]}</button>;
}

function VistaLista({ citas, ahora, esHoy, abrir, puede, avisar }: { citas: CitaVista[]; ahora: number; esHoy: boolean; abrir: (c: CitaVista) => void; puede: { modificar: boolean; pagos: boolean }; avisar: (r: Res) => void }) {
  const [filtro, setFiltro] = useState<"todas" | "espera" | "pago">("todas");
  const pendientes = citas.filter((c) => activa(c.estado));
  const siguiente = esHoy ? pendientes.find((c) => c.estado === "en_espera" || c.estado === "llego") ?? null : null;
  const enAtencion = citas.filter((c) => c.estado === "en_atencion");
  const espera = citas.filter((c) => c.estado === "llego");
  const lista = citas.filter((c) => filtro === "todas" || (filtro === "espera" ? c.estado === "llego" || c.estado === "en_espera" : c.estadoPago !== "pagada" && activa(c.estado)));
  return (
    <>
      {esHoy && (siguiente || enAtencion.length > 0) && (
        <section className="glass sig-cita subir">
          {siguiente && (
            <div role="button" tabIndex={0} className="sig-c" onClick={() => abrir(siguiente)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(siguiente); } }}>
              <span className="lab">Sigue</span>
              <span className="sig-h num">{siguiente.hora}</span>
              <span className="sig-t"><b>{siguiente.cliente}</b><small>{siguiente.servicios.join(", ")}, con {primer(siguiente.barbero)}</small></span>
              {puede.modificar ? <SiguientePaso c={siguiente} avisar={avisar} /> : <Chip e={siguiente.estado} />}
            </div>
          )}
          <div className="sig-res">
            <span><b className="num">{espera.length}</b> en espera</span>
            <span><b className="num">{enAtencion.length}</b> en atención</span>
            <span><b className="num">{pendientes.filter((c) => c.inicioMs > ahora).length}</b> por llegar</span>
          </div>
        </section>
      )}
      <section className="glass lista-citas subir d1">
        <div className="entre cab-lc">
          <span className="lab">{citas.length} {citas.length === 1 ? "cita" : "citas"}</span>
          <nav className="seg chico" aria-label="Filtrar">
            <button type="button" aria-current={filtro === "todas" ? "page" : undefined} onClick={() => setFiltro("todas")}>Todas</button>
            <button type="button" aria-current={filtro === "espera" ? "page" : undefined} onClick={() => setFiltro("espera")}>Por atender</button>
            {puede.pagos && <button type="button" aria-current={filtro === "pago" ? "page" : undefined} onClick={() => setFiltro("pago")}>Pago pendiente</button>}
          </nav>
        </div>
        {lista.length === 0 && <p className="muted vacio-c">No hay citas{filtro !== "todas" ? " con ese filtro" : " este día"}.</p>}
        {lista.map((c) => (
          <div key={c.id} role="button" tabIndex={0} className={`fila-cita ${activa(c.estado) ? "" : "pasada"}`} onClick={() => abrir(c)} onKeyDown={(e) => { if (e.key === "Enter") abrir(c); }}>
            <span className="h-c num">{c.hora}<small>{c.duracion} min</small></span>
            <span className="t-c">
              <b>{c.cliente}</b>
              <small><Avatar avatar="iniciales" nombre={c.barbero} t={16} />{primer(c.barbero)}{c.indiferente ? " (asignado)" : ""}, {c.servicios.join(", ")}</small>
              <span className="chips-c"><Chip e={c.estado} />{c.estadoPago && <span className={`chip-pago p-${c.estadoPago}`}>{PAGO[c.estadoPago]}</span>}{c.origen === "linea" && <span className="chip-pago">En línea</span>}</span>
            </span>
            <span className="d-c"><b className="num">{formatoDinero(c.total)}</b>{puede.modificar && activa(c.estado) && <SiguientePaso c={c} avisar={avisar} />}</span>
          </div>
        ))}
      </section>
    </>
  );
}

function rango(h: Horario) {
  const ds = Object.values(h);
  if (!ds.length) return [600, 1200];
  return [Math.min(...ds.map((x) => aMin(x[0]))), Math.max(...ds.map((x) => aMin(x[1])))];
}

function VistaDia({ citas, equipo, horario, dia, abrir }: { citas: CitaVista[]; equipo: Persona[]; horario: Horario; dia: string; abrir: (c: CitaVista) => void }) {
  const [ini, fin] = rango(horario);
  const horas = Array.from({ length: Math.ceil((fin - ini) / 60) + 1 }, (_, i) => ini + i * 60).filter((m) => m <= fin);
  const px = 1.1; // píxeles por minuto
  void dia;
  return (
    <section className="glass cal-dia subir d1" style={{ ["--cols" as string]: equipo.length }}>
      <div className="cal-cab"><span />{equipo.map((e) => <span key={e.id} className="persona"><Avatar avatar={e.avatar} nombre={e.nombre} t={22} />{primer(e.nombre)}</span>)}</div>
      <div className="cal-cuerpo" style={{ height: (fin - ini) * px }}>
        <div className="cal-horas">{horas.map((m) => <span key={m} style={{ top: (m - ini) * px }}>{aHora(m)}</span>)}</div>
        {equipo.map((e) => (
          <div key={e.id} className="cal-col">
            {horas.map((m) => <i key={m} className="linea-h" style={{ top: (m - ini) * px }} />)}
            {citas.filter((c) => c.barberoId === e.id).map((c) => {
              const m = aMin(c.hora);
              return (
                <button type="button" key={c.id} className={`blq-c e-${c.estado}`} style={{ top: (m - ini) * px, height: Math.max(c.duracion * px - 2, 22) }} onClick={() => abrir(c)}>
                  <b>{c.hora} {c.cliente}</b><small>{c.servicios.join(", ")}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function VistaSemana({ citas, semana, horario, hoy, abrir, url }: { citas: CitaVista[]; semana: string[]; horario: Horario; hoy: string; abrir: (c: CitaVista) => void; url: (x: { dia?: string; vista?: string }) => string }) {
  const [ini, fin] = rango(horario);
  const px = 0.8;
  return (
    <section className="glass cal-dia cal-semana subir d1" style={{ ["--cols" as string]: 7 }}>
      <div className="cal-cab"><span />{semana.map((d) => <Link key={d} href={url({ dia: d, vista: "calendario" })} className={d === hoy ? "hoy" : ""}>{DIAS[dow(d)]} {Number(d.slice(8))}</Link>)}</div>
      <div className="cal-cuerpo" style={{ height: (fin - ini) * px }}>
        <div className="cal-horas">{Array.from({ length: Math.floor((fin - ini) / 120) + 1 }, (_, i) => ini + i * 120).map((m) => <span key={m} style={{ top: (m - ini) * px }}>{aHora(m)}</span>)}</div>
        {semana.map((d) => (
          <div key={d} className="cal-col">
            {citas.filter((c) => c.fecha === d).map((c) => (
              <button type="button" key={c.id} className={`blq-c mini e-${c.estado}`} style={{ top: (aMin(c.hora) - ini) * px, height: Math.max(c.duracion * px - 2, 16) }} onClick={() => abrir(c)} title={`${c.hora} ${c.cliente}`}>
                <b>{c.hora}</b><small>{primer(c.cliente)}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function DetalleCita({ c, cerrar, puede, equipo, avisar }: { c: CitaVista; cerrar: () => void; puede: { modificar: boolean; cancelar: boolean; pagos: boolean; cobrar: boolean }; equipo: Persona[]; avisar: (r: Res) => void }) {
  const [pend, iniciar] = useTransition();
  const [modo, setModo] = useState<"ver" | "cancelar" | "cambiar">("ver");
  const [motivo, setMotivo] = useState("");
  const correr = (f: () => Promise<Res>) => iniciar(async () => { const r = await f(); avisar(r); if (!r.error) cerrar(); });
  const tel = c.telefono.replace(/\D/g, "");
  const pendiente = c.pagado !== null ? Math.max(c.total - c.pagado, 0) : null;
  if (modo === "cambiar") return <Agendar equipo={equipo} servicios={[]} dia={c.fecha} hoy={c.fecha} cerrar={cerrar} avisar={avisar} cambiar={c} />;
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Cita ${c.folio}`} titulo={c.cliente}>
      {modo === "ver" ? (
        <div className="pila" style={{ gap: 12 }}>
          <div className="entre"><Chip e={c.estado} /><span className="fila" style={{ gap: 6 }}>
            <a className="icb" href={`tel:${tel}`} aria-label="Llamar"><Icono n="persona" /></a>
            <a className="icb" href={`https://wa.me/${tel.length === 10 ? `52${tel}` : tel}`} target="_blank" rel="noreferrer" aria-label="Escribir por WhatsApp"><Icono n="enviar" /></a>
          </span></div>
          <div className="datos resumen-cfg">
            <div><span>Teléfono</span><b>{c.telefono}</b></div>
            <div><span>Servicios</span><b>{c.servicios.join(", ")}</b></div>
            <div><span>Atiende</span><b>{c.barbero}{c.indiferente ? " (eligió cualquier barbero)" : ""}</b></div>
            <div><span>Fecha</span><b>{fechaTxt(c.fecha)}</b></div>
            <div><span>Hora</span><b>{c.hora} a {c.horaFin}, {c.duracion} min</b></div>
            <div><span>Precio</span><b>{formatoDinero(c.total)}</b></div>
            {puede.pagos && c.pagado !== null && <>
              <div><span>Pagado</span><b>{formatoDinero(c.pagado)}{c.metodo ? `, ${c.metodo}` : ""}</b></div>
              <div><span>Por pagar</span><b>{formatoDinero(pendiente ?? 0)}</b></div>
            </>}
            {c.observaciones && <div><span>Observaciones</span><b>{c.observaciones}</b></div>}
            <div><span>Registrada</span><b>{c.origen === "linea" ? "En línea" : "En el negocio"}, {c.creada}</b></div>
          </div>
          {puede.modificar && activa(c.estado) && (
            <div className="acc-cita">
              {c.estado === "en_espera" && <button type="button" className="bt sec chico" disabled={pend} onClick={() => correr(() => cambiarEstadoCita(c.id, "llego"))}>Llegó</button>}
              {(c.estado === "en_espera" || c.estado === "llego") && <button type="button" className="bt sec chico" disabled={pend} onClick={() => correr(() => cambiarEstadoCita(c.id, "en_atencion"))}>En atención</button>}
              <button type="button" className="bt sec chico" disabled={pend} onClick={() => correr(() => cambiarEstadoCita(c.id, "completada"))}>Completada</button>
              {c.estado === "en_espera" && <button type="button" className="bt sec chico" disabled={pend} onClick={() => correr(() => cambiarEstadoCita(c.id, "no_asistio"))}>No asistió</button>}
              {(c.estado === "en_espera" || c.estado === "llego") && <button type="button" className="bt sec chico" onClick={() => setModo("cambiar")}><Icono n="calendario" />Cambiar horario</button>}
            </div>
          )}
          <div className="entre acc-fin">
            {puede.cancelar && activa(c.estado) ? <button type="button" className="link-c peligro-t" onClick={() => setModo("cancelar")}>Cancelar cita</button> : <span />}
            {puede.cobrar && !c.ventaId && c.estado !== "cancelada" && c.estado !== "no_asistio" && <Link className="bt chico" href={`/cobrar?cita=${c.id}`}>Cobrar<Fl /></Link>}
          </div>
        </div>
      ) : (
        <div className="pila" style={{ gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>Se le avisará al cliente que su cita se canceló.</p>
          <label className="campo"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ejemplo: el cliente pidió cancelar" /></label>
          <div className="acciones"><button type="button" className="bt peligro" disabled={pend} onClick={() => correr(() => cancelarCita(c.id, motivo))}>Sí, cancelar cita<Fl /></button></div>
        </div>
      )}
    </Modal>
  );
}

/** Agendar una cita desde el negocio (o cambiar el horario de una existente). */
function Agendar({ equipo, servicios, dia, hoy, cerrar, avisar, cambiar }: { equipo: Persona[]; servicios: Servicio[]; dia: string; hoy: string; cerrar: () => void; avisar: (r: Res) => void; cambiar?: CitaVista }) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [persona, setPersona] = useState(cambiar?.barberoId ?? "");
  const [fecha, setFecha] = useState(dia < hoy ? hoy : dia);
  const [libres, setLibres] = useState<{ minuto: number; personas: string[] }[] | null>(null);
  const [minuto, setMinuto] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const cats = useMemo(() => [...new Set(servicios.map((s) => s.categoria))], [servicios]);
  const ids = cambiar ? null : elegidos;
  useEffect(() => {
    setMinuto(null);
    if (!cambiar && !elegidos.length) { setLibres(null); return; }
    let vivo = true;
    (async () => {
      // Al cambiar una cita se usan sus mismos servicios: se piden por duración con la persona elegida.
      const r = cambiar ? await horariosCita(cambiar.id, fecha, persona) : await horariosAgenda(fecha, ids!, persona || null);
      if (vivo) setLibres(r);
    })();
    return () => { vivo = false; };
  }, [fecha, persona, elegidos.join(","), cambiar?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = servicios.filter((s) => elegidos.includes(s.id)).reduce((a, s) => a + s.precio, 0);
  const guardar = () => iniciar(async () => {
    if (minuto === null) { setError("Elige la hora."); return; }
    const r = cambiar
      ? await reprogramarCita(cambiar.id, fecha, minuto, persona || libres?.find((x) => x.minuto === minuto)?.personas[0] || cambiar.barberoId)
      : await agendarCita({ servicioIds: elegidos, persona: persona || null, fecha, minuto, nombre, telefono: tel, observaciones: obs });
    if (r.error) setError(r.error); else { avisar(r); cerrar(); }
  });
  return (
    <Modal abierto cerrar={cerrar} etiqueta={cambiar ? `Cita ${cambiar.folio}` : "Nueva cita"} titulo={cambiar ? "Cambiar horario" : "Agendar cita"} ancho>
      <div className="pila form-cita">
        {!cambiar && (
          <div className="campo"><span>Servicios</span>
            <div className="svc-cita">
              {cats.map((c) => (
                <div key={c} className="grupo-sc"><small>{c}</small>
                  <div>{servicios.filter((s) => s.categoria === c).map((s) => (
                    <button type="button" key={s.id} className={elegidos.includes(s.id) ? "on" : ""} aria-pressed={elegidos.includes(s.id)} onClick={() => setElegidos(elegidos.includes(s.id) ? elegidos.filter((x) => x !== s.id) : [...elegidos, s.id])}>
                      {s.nombre}<small>{formatoDinero(s.precio)}</small>
                    </button>
                  ))}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="fila-eg">
          <div className="campo"><span>Atiende</span>
            <Selector etiqueta="Quién atiende" valor={persona} onChange={setPersona} opciones={[...(cambiar ? [] : [{ valor: "", texto: "Cualquiera" }]), ...equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }))]} />
          </div>
          <label className="campo"><span>Día</span><input className="input" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        </div>
        <div className="campo"><span>Hora</span>
          {libres === null ? <small className="muted">{cambiar ? "Buscando horarios…" : "Elige los servicios para ver los horarios libres."}</small>
            : libres.length === 0 ? <small className="muted">No hay horarios libres ese día.</small>
            : <div className="horas-c">{libres.map((x) => <button type="button" key={x.minuto} className={minuto === x.minuto ? "on" : ""} onClick={() => setMinuto(x.minuto)}>{aHora(x.minuto)}</button>)}</div>}
        </div>
        {!cambiar && (
          <>
            <div className="fila-eg">
              <label className="campo"><span>Cliente</span><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre" /></label>
              <label className="campo"><span>Teléfono</span><input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="10 dígitos" /></label>
            </div>
            <label className="campo"><span>Observaciones (opcional)</span><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} /></label>
          </>
        )}
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="entre">
          {!cambiar ? <span className="muted">{elegidos.length ? `Total ${formatoDinero(total)}` : ""}</span> : <span />}
          <button type="button" className="bt" disabled={pend} onClick={guardar}>{pend ? "Guardando…" : cambiar ? "Guardar cambio" : "Agendar"}<Fl /></button>
        </div>
      </div>
    </Modal>
  );
}


function VistaHorarios(p: { equipo: Persona[]; horarioNegocio: Horario; rotacion: Rot | null; bloqueos: { id: string; persona: string; fecha: string; desde: string; hasta: string; motivo: string }[]; dia: string; avisar: (r: Res) => void }) {
  const [editar, setEditar] = useState<Persona | null>(null);
  const [rot, setRot] = useState(false);
  const [bloq, setBloq] = useState(false);
  const [pend, iniciar] = useTransition();
  const resumen = (h: Horario | null) => {
    const base = h ?? p.horarioNegocio;
    const dias = ORDEN.filter((d) => base[String(d)]);
    if (!dias.length) return "Sin días de trabajo";
    const iguales = dias.every((d) => base[String(d)][0] === base[String(dias[0])][0] && base[String(d)][1] === base[String(dias[0])][1]);
    return `${h ? "" : "Igual que el negocio: "}${DIAS[dias[0]]} a ${DIAS[dias[dias.length - 1]]}${iguales ? `, ${base[String(dias[0])][0]} a ${base[String(dias[0])][1]}` : ""}`;
  };
  const nom = (id: string) => primer(p.equipo.find((e) => e.id === id)?.nombre ?? "");
  return (
    <>
      <section className="glass panel-h subir">
        <span className="lab">Horario de cada persona</span>
        {p.equipo.map((e) => (
          <div key={e.id} className="fila-h">
            <Avatar avatar={e.avatar} nombre={e.nombre} t={30} />
            <span className="t-c"><b>{primer(e.nombre)}</b><small>{resumen(e.horario)}</small></span>
            <button type="button" className="bt sec chico" onClick={() => setEditar(e)}><Icono n="editar" />Editar</button>
          </div>
        ))}
      </section>

      <section className="glass panel-h subir d1">
        <div className="entre"><span className="lab">Descanso rotativo</span>
          <button type="button" className="bt sec chico" onClick={() => setRot(true)}><Icono n={p.rotacion ? "editar" : "mas"} />{p.rotacion ? "Editar" : "Configurar"}</button></div>
        {p.rotacion ? (
          <div className="rot-res">
            <small className="muted">Cada semana se alterna. Esta semana:</small>
            {p.rotacion.estaSemana.map((x) => <span key={x.dia}><b>{nom(x.persona)}</b> descansa el {DIAS_L[x.dia]}</span>)}
          </div>
        ) : <small className="muted">Dos personas se turnan dos días de descanso cada semana, por ejemplo lunes y miércoles.</small>}
      </section>

      <section className="glass panel-h subir d2">
        <div className="entre"><span className="lab">Horarios bloqueados</span>
          <button type="button" className="bt sec chico" onClick={() => setBloq(true)}><Icono n="candado" />Bloquear horario</button></div>
        {p.bloqueos.length === 0 && <small className="muted">No hay horarios bloqueados próximamente.</small>}
        {p.bloqueos.map((x) => (
          <div key={x.id} className="fila-h">
            <span className="t-c"><b>{x.persona}</b><small>{fechaTxt(x.fecha)}, {x.desde} a {x.hasta}{x.motivo ? `, ${x.motivo}` : ""}</small></span>
            <button type="button" className="icb" disabled={pend} aria-label="Quitar bloqueo" onClick={() => iniciar(async () => p.avisar(await quitarBloqueo(x.id)))}><Icono n="basura" /></button>
          </div>
        ))}
      </section>

      {editar && <EditarHorario persona={editar} negocio={p.horarioNegocio} cerrar={() => setEditar(null)} avisar={p.avisar} />}
      {rot && <EditarRotacion equipo={p.equipo} actual={p.rotacion} dia={p.dia} cerrar={() => setRot(false)} avisar={p.avisar} />}
      {bloq && <NuevoBloqueo equipo={p.equipo} dia={p.dia} cerrar={() => setBloq(false)} avisar={p.avisar} />}
    </>
  );
}

export function EditorSemana({ valor, onChange }: { valor: Horario; onChange: (h: Horario) => void }) {
  return (
    <div className="ed-semana">
      {ORDEN.map((d) => {
        const v = valor[String(d)];
        return (
          <div key={d} className={`dia-ed ${v ? "" : "off"}`}>
            <button type="button" className={`dia-b ${v ? "on" : ""}`} aria-pressed={!!v} onClick={() => { const n = { ...valor }; if (v) delete n[String(d)]; else n[String(d)] = ["10:00", "20:00"]; onChange(n); }}>{DIAS[d]}</button>
            {v ? (
              <span className="horas-ed">
                <input className="input" type="time" value={v[0]} onChange={(e) => onChange({ ...valor, [String(d)]: [e.target.value, v[1]] })} aria-label={`Entrada ${DIAS_L[d]}`} />
                <span className="muted">a</span>
                <input className="input" type="time" value={v[1]} onChange={(e) => onChange({ ...valor, [String(d)]: [v[0], e.target.value] })} aria-label={`Salida ${DIAS_L[d]}`} />
              </span>
            ) : <small className="muted">Cerrado</small>}
          </div>
        );
      })}
    </div>
  );
}

function EditarHorario({ persona, negocio, cerrar, avisar }: { persona: Persona; negocio: Horario; cerrar: () => void; avisar: (r: Res) => void }) {
  const [propio, setPropio] = useState(!!persona.horario);
  const [h, setH] = useState<Horario>(persona.horario ?? negocio);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Horario" titulo={primer(persona.nombre)}>
      <div className="pila" style={{ gap: 12 }}>
        <nav className="seg chico" aria-label="Tipo de horario">
          <button type="button" aria-current={!propio ? "page" : undefined} onClick={() => setPropio(false)}>Igual que el negocio</button>
          <button type="button" aria-current={propio ? "page" : undefined} onClick={() => setPropio(true)}>Horario propio</button>
        </nav>
        {propio ? <EditorSemana valor={h} onChange={setH} /> : <small className="muted">Trabaja en el horario del negocio. El descanso rotativo se aplica aparte.</small>}
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones"><button type="button" className="bt" disabled={pend} onClick={() => iniciar(async () => { const r = await guardarHorarioPersona(persona.id, propio ? h : null, true); if (r.error) setError(r.error); else { avisar(r); cerrar(); } })}>Guardar<Fl /></button></div>
      </div>
    </Modal>
  );
}

function EditarRotacion({ equipo, actual, dia, cerrar, avisar }: { equipo: Persona[]; actual: Rot | null; dia: string; cerrar: () => void; avisar: (r: Res) => void }) {
  const [p1, setP1] = useState(actual?.persona1 ?? equipo[0]?.id ?? "");
  const [p2, setP2] = useState(actual?.persona2 ?? equipo[1]?.id ?? "");
  const [d1, setD1] = useState(String(actual?.dia1 ?? 1));
  const [d2, setD2] = useState(String(actual?.dia2 ?? 3));
  const [inicio, setInicio] = useState(actual?.semanaInicio ?? lunesDe(dia));
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const personas = equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }));
  const dias = ORDEN.map((d) => ({ valor: String(d), texto: DIAS_L[d][0].toUpperCase() + DIAS_L[d].slice(1) }));
  const n = (id: string) => primer(equipo.find((e) => e.id === id)?.nombre ?? "");
  const lunes = lunesDe(inicio);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Horarios" titulo="Descanso rotativo">
      <div className="pila" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>En la semana de inicio, la primera persona descansa el primer día y la segunda el segundo día. La semana siguiente se invierte, y así sucesivamente.</p>
        <div className="fila-eg">
          <div className="campo"><span>Primera persona</span><Selector etiqueta="Primera persona" valor={p1} onChange={setP1} opciones={personas} /></div>
          <div className="campo"><span>Descansa el</span><Selector etiqueta="Primer día" valor={d1} onChange={setD1} opciones={dias} /></div>
        </div>
        <div className="fila-eg">
          <div className="campo"><span>Segunda persona</span><Selector etiqueta="Segunda persona" valor={p2} onChange={setP2} opciones={personas} /></div>
          <div className="campo"><span>Descansa el</span><Selector etiqueta="Segundo día" valor={d2} onChange={setD2} opciones={dias} /></div>
        </div>
        <label className="campo"><span>Semana de inicio</span><input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <div className="ejemplo-p rot-ej">
          <span><small>Semana del {Number(lunes.slice(8))} {MESES[Number(lunes.slice(5, 7)) - 1]}</small><span>{n(p1)} descansa el {DIAS_L[Number(d1)]}, {n(p2)} el {DIAS_L[Number(d2)]}</span></span>
          <span><small>Semana siguiente</small><span>{n(p1)} descansa el {DIAS_L[Number(d2)]}, {n(p2)} el {DIAS_L[Number(d1)]}</span></span>
        </div>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="entre">
          {actual ? <button type="button" className="link-c peligro-t" disabled={pend} onClick={() => iniciar(async () => { avisar(await quitarRotacion()); cerrar(); })}>Quitar descanso rotativo</button> : <span />}
          <button type="button" className="bt" disabled={pend} onClick={() => iniciar(async () => { const r = await guardarRotacion({ persona1: p1, persona2: p2, dia1: Number(d1), dia2: Number(d2), semanaInicio: inicio, activo: true }); if (r.error) setError(r.error); else { avisar(r); cerrar(); } })}>Guardar<Fl /></button>
        </div>
      </div>
    </Modal>
  );
}

function NuevoBloqueo({ equipo, dia, cerrar, avisar }: { equipo: Persona[]; dia: string; cerrar: () => void; avisar: (r: Res) => void }) {
  const [quien, setQuien] = useState("");
  const [fecha, setFecha] = useState(dia);
  const [desde, setDesde] = useState("14:00");
  const [hasta, setHasta] = useState("15:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Horarios" titulo="Bloquear horario">
      <div className="pila" style={{ gap: 12 }}>
        <div className="fila-eg">
          <div className="campo"><span>A quién</span><Selector etiqueta="A quién" valor={quien} onChange={setQuien} opciones={[{ valor: "", texto: "Todo el negocio" }, ...equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre) }))]} /></div>
          <label className="campo"><span>Día</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        </div>
        <div className="fila-eg horario-p">
          <label className="campo"><span>De</span><input className="input" type="time" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="campo"><span>A</span><input className="input" type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        <label className="campo"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder="Ejemplo: comida, cita médica" /></label>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones"><button type="button" className="bt" disabled={pend} onClick={() => iniciar(async () => { const r = await bloquearHorario({ usuarioId: quien || null, fecha, desde, hasta, motivo }); if (r.error) setError(r.error); else { avisar(r); cerrar(); } })}>Bloquear<Fl /></button></div>
      </div>
    </Modal>
  );
}
