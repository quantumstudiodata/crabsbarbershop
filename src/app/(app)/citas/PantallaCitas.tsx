"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { aHora, aMin, type Horario } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import {
  agendarCita, bloquearHorario, cambiarEstadoCita, horariosCita, cancelarCita, guardarHorarioPersona, guardarRotacion, horariosAgenda, quitarBloqueo, quitarRotacion, reprogramarCita, type Res,
} from "./actions";
import { NuevaCita } from "./NuevaCita";
import { CampoFecha, CampoHora } from "@/components/Calendario";

export type CitaVista = {
  id: string; folio: string; cliente: string; telefono: string; barberoId: string; barbero: string; indiferente: boolean;
  fecha: string; hora: string; horaFin: string; inicioMs: number; duracion: number; servicios: string[]; total: number;
  pagado: number | null; metodo: string | null; estadoPago: string | null; estado: string; observaciones: string; origen: string; creada: string; ventaId: string | null;
};
export type Bloqueo = { id: string; personaId: string; persona: string; fecha: string; desde: string; hasta: string; motivo: string };
export type Persona = { id: string; nombre: string; avatar: string; horario: Horario | null };
type Servicio = { id: string; nombre: string; categoria: string; precio: number; duracionMin: number };
export type Rot = { persona1: string; persona2: string; dia1: number; dia2: number; semanaInicio: string; activo: boolean; estaSemana: { dia: number; persona: string }[] };

const ESTADO: Record<string, string> = { apartada: "Apartada", en_espera: "En espera", llego: "Llegó", en_atencion: "En atención", completada: "Completada", no_asistio: "No asistió", cancelada: "Cancelada" };
const PAGO: Record<string, string> = { sin_pago: "Sin pago", anticipo: "Anticipo", pagada: "Pagada", transferencia: "Transferencia por confirmar" };
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
  abrirNueva?: boolean; abrirCompartir?: boolean; porDefecto: "linea" | "semana";
  zona: string; hoy: string; dia: string; vista: "linea" | "lista" | "calendario" | "semana" | "horarios"; persona: string; citas: CitaVista[]; ahora: number;
  equipo: Persona[]; servicios: Servicio[]; horarioNegocio: Horario; cerrados: string[]; conteo: Record<string, number>;
  rotacion: Rot | null; bloqueos: Bloqueo[];
  enlace: string | null; puede: { modificar: boolean; cancelar: boolean; pagos: boolean; horarios: boolean; cobrar: boolean };
}) {
  const router = useRouter();
  const [ver, setVer] = useState<CitaVista | null>(null);
  const [agendar, setAgendar] = useState<false | { minuto?: number }>(p.abrirNueva && p.puede.modificar ? {} : false);
  const [bloquear, setBloquear] = useState(false);
  const [aviso, setAviso] = useState<Res>({});
  const url = (x: Partial<{ dia: string; vista: string; persona: string }>) => {
    const u = new URLSearchParams();
    const d = x.dia ?? p.dia, v = x.vista ?? p.vista, pe = x.persona ?? p.persona;
    if (d !== p.hoy) u.set("dia", d);
    if (v !== p.porDefecto) u.set("vista", v);
    if (pe) u.set("persona", pe);
    const t = u.toString();
    return `/citas${t ? `?${t}` : ""}`;
  };
  const citas = p.citas.filter((c) => !p.persona || c.barberoId === p.persona);
  const lunes = lunesDe(p.dia);
  const semana = Array.from({ length: 7 }, (_, i) => sumar(lunes, i));

  const [compartir, setCompartir] = useState(!!p.abrirCompartir && !!p.enlace);
  const [verVista, setVerVista] = useState(false);
  const vistas = ([["linea", "Línea del tiempo", "reloj"], ["lista", "Lista", "lista"], ["calendario", "Día por persona", "persona"], ["semana", "Semana", "calendario"]] as [string, string, string][]);
  const actual = vistas.find(([k]) => k === p.vista) ?? vistas[0];
  const MES = (f: string) => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][Number(f.slice(5, 7)) - 1];
  const domingo = semana[6];
  const etiquetaSemana = lunes.slice(5, 7) === domingo.slice(5, 7) ? `${Number(lunes.slice(8))} al ${Number(domingo.slice(8))} de ${MES(lunes)}` : `${Number(lunes.slice(8))} de ${MES(lunes)} al ${Number(domingo.slice(8))} de ${MES(domingo)}`;
  const enSemana = p.vista === "semana";

  return (
    <>
      <div className="entre cab-citas">
        <div>
          <h1 className="titulo">Citas y agenda</h1>
          <p className="sub">{p.dia === p.hoy ? "Hoy, " : ""}{fechaTxt(p.dia)}</p>
        </div>
        <div className="fila acc-citas">
          {p.enlace && (
            <div className="ag-pop-w">
              <button type="button" className="ag-bt" aria-expanded={compartir} onClick={() => setCompartir(!compartir)}><Icono n="enviar" /><span>Compartir reservaciones</span></button>
              {compartir && <Compartir enlace={p.enlace} cerrar={() => setCompartir(false)} />}
            </div>
          )}
          {p.puede.modificar && p.vista !== "linea" && <button type="button" className="ag-bt pri" onClick={() => setAgendar({})}><Icono n="mas" /><span>Nueva cita</span></button>}
        </div>
      </div>
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.mensaje && !aviso.error && <p className="aviso ok">{aviso.mensaje}</p>}

      <div className="ag-ctl">
        <div className="fila ag-izq">
          <div className="ag-pop-w">
            <button type="button" className="ag-bt" aria-haspopup="menu" aria-expanded={verVista} onClick={() => setVerVista(!verVista)} aria-label={`Vista: ${actual[1]}`}><Icono n={actual[2]} /><span>{actual[1]}</span><Icono n="abajo" /></button>
            {verVista && (
              <Flotante cerrar={() => setVerVista(false)} className="ag-menu" rol="menu">
                {vistas.map(([k, t, ic]) => <Link key={k} href={url({ vista: k })} scroll={false} role="menuitemradio" aria-checked={p.vista === k} className={`it ${p.vista === k ? "on" : ""}`} onClick={() => setVerVista(false)}><Icono n={ic} />{t}{p.vista === k && <Icono n="palomita" />}</Link>)}
              </Flotante>
            )}
          </div>
          {enSemana && (
            <div className="ag-nav">
              <Link href={url({ dia: sumar(p.dia, -7) })} scroll={false} aria-label="Semana anterior"><Icono n="izquierda" /></Link>
              <Link href={url({ dia: p.hoy })} scroll={false} className="ag-hoy" title="Ir a esta semana">{etiquetaSemana}</Link>
              <Link href={url({ dia: sumar(p.dia, 7) })} scroll={false} aria-label="Semana siguiente"><Icono n="derecha" /></Link>
            </div>
          )}
        </div>
        <div className="fila ag-mov solo-movil">
          {p.enlace && <button type="button" className="ln-ib" aria-label="Compartir reservaciones" aria-expanded={compartir} onMouseDown={(e) => e.stopPropagation()} onClick={() => setCompartir(!compartir)}><Icono n="enviar" /></button>}
          {p.puede.modificar && p.vista !== "linea" && <button type="button" className="ln-ib pri" onClick={() => setAgendar({})} aria-label="Nueva cita"><Icono n="mas" /></button>}
        </div>
        {p.vista !== "horarios" && p.vista !== "linea" && p.equipo.length > 1 && (
          <Selector className="sel-equipo" etiqueta="Persona" valor={p.persona} onChange={(v) => router.push(url({ persona: v }), { scroll: false })}
            opciones={[{ valor: "", texto: "Todo el equipo" }, ...p.equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }))]} />
        )}
      </div>

      {(p.vista === "lista" || p.vista === "calendario") && (
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

      {p.vista === "linea" && (
        <VistaLinea citas={citas} bloqueos={p.bloqueos} equipo={p.equipo} persona={p.persona} dia={p.dia} hoy={p.hoy} horario={p.horarioNegocio} cerrados={p.cerrados} ahora={p.ahora}
          abrir={setVer} url={url} puede={p.puede} agendar={(m) => setAgendar({ minuto: m })} bloquear={() => setBloquear(true)} avisar={setAviso} />
      )}
      {p.vista === "lista" && <VistaLista citas={citas} ahora={p.ahora} esHoy={p.dia === p.hoy} abrir={setVer} puede={p.puede} avisar={setAviso} />}
      {p.vista === "calendario" && <VistaDia citas={citas} equipo={p.equipo.filter((e) => !p.persona || e.id === p.persona)} horario={p.horarioNegocio} dia={p.dia} abrir={setVer} zona={p.zona} hoy={p.hoy} />}
      {p.vista === "semana" && <VistaSemana citas={citas} semana={semana} horario={p.horarioNegocio} hoy={p.hoy} abrir={setVer} url={url} zona={p.zona} />}

      {ver && <DetalleCita c={ver} cerrar={() => setVer(null)} puede={p.puede} equipo={p.equipo} avisar={setAviso} />}
      {agendar && <NuevaCita equipo={p.equipo} servicios={p.servicios} dia={p.dia} hoy={p.hoy} horario={p.horarioNegocio} cerrados={p.cerrados} minutoInicial={agendar.minuto} personaInicial={p.persona} cerrar={() => setAgendar(false)} avisar={setAviso} />}
      {bloquear && <NuevoBloqueo equipo={p.equipo} dia={p.dia < p.hoy ? p.hoy : p.dia} personaInicial={p.persona} cerrar={() => setBloquear(false)} avisar={setAviso} />}
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

/** Línea de la hora actual: baja poco a poco sobre el calendario. Se actualiza cada 30 segundos. */
function LineaAhora({ zona, ini, fin, px, col }: { zona: string; ini: number; fin: number; px: number; col?: { i: number; de: number } }) {
  const leer = () => { const x = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()); const v = (t: string) => Number(x.find((y) => y.type === t)?.value ?? 0); return (v("hour") % 24) * 60 + v("minute") + v("second") / 60; };
  const [m, setM] = useState<number | null>(null);
  useEffect(() => { setM(leer()); const t = setInterval(() => setM(leer()), 30000); return () => clearInterval(t); }, [zona]); // eslint-disable-line react-hooks/exhaustive-deps
  if (m === null || m < ini || m > fin) return null;
  const hh = Math.floor(m), txt = `${String(Math.floor(hh / 60)).padStart(2, "0")}:${String(hh % 60).padStart(2, "0")}`;
  return (
    <div className="cal-ahora" style={{ top: (m - ini) * px, ["--x" as string]: col ? `calc(46px + (100% - 46px) * ${col.i} / ${col.de})` : "46px", ["--w" as string]: col ? `calc((100% - 46px) / ${col.de})` : "calc(100% - 46px)" }} aria-label={`Ahora, ${txt}`}>
      <span>{txt}</span><i />
    </div>
  );
}

function VistaDia({ citas, equipo, horario, dia, abrir, zona, hoy }: { citas: CitaVista[]; equipo: Persona[]; horario: Horario; dia: string; abrir: (c: CitaVista) => void; zona: string; hoy: string }) {
  const [ini, fin] = rango(horario);
  const horas = Array.from({ length: Math.ceil((fin - ini) / 60) + 1 }, (_, i) => ini + i * 60).filter((m) => m <= fin);
  const px = 1.1; // píxeles por minuto
  void dia;
  return (
    <section className="glass cal-dia subir d1" style={{ ["--cols" as string]: equipo.length }}>
      <div className="cal-cab"><span />{equipo.map((e) => <span key={e.id} className="persona"><Avatar avatar={e.avatar} nombre={e.nombre} t={22} />{primer(e.nombre)}</span>)}</div>
      <div className="cal-cuerpo" style={{ height: (fin - ini) * px }}>
        {dia === hoy && <LineaAhora zona={zona} ini={ini} fin={fin} px={px} />}
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

/** Citas que se cruzan en el tiempo: en la semana se juntan en un solo bloque legible en vez de columnas angostas. */
function grupos(cs: CitaVista[]) {
  const xs = [...cs].sort((a, b) => aMin(a.hora) - aMin(b.hora));
  const res: { ini: number; fin: number; citas: CitaVista[] }[] = [];
  for (const c of xs) {
    const i = aMin(c.hora), f = i + c.duracion, g = res[res.length - 1];
    if (g && i < g.fin) { g.citas.push(c); g.fin = Math.max(g.fin, f); } else res.push({ ini: i, fin: f, citas: [c] });
  }
  return res;
}

function VistaSemana({ citas, semana, horario, hoy, abrir, url, zona }: { zona: string; citas: CitaVista[]; semana: string[]; horario: Horario; hoy: string; abrir: (c: CitaVista) => void; url: (x: { dia?: string; vista?: string }) => string }) {
  const [ini, fin] = rango(horario);
  const px = 1.4;
  return (
    <section className="glass cal-dia cal-semana subir d1" style={{ ["--cols" as string]: 7 }}>
      <div className="cal-cab"><span />{semana.map((d) => <Link key={d} href={url({ dia: d, vista: "calendario" })} className={d === hoy ? "hoy" : ""}>{DIAS[dow(d)]} {Number(d.slice(8))}</Link>)}</div>
      <div className="cal-cuerpo" style={{ height: (fin - ini) * px }}>
        {semana.includes(hoy) && <LineaAhora zona={zona} ini={ini} fin={fin} px={px} col={{ i: semana.indexOf(hoy), de: semana.length }} />}
        <div className="cal-horas">{Array.from({ length: Math.floor((fin - ini) / 120) + 1 }, (_, i) => ini + i * 120).map((m) => <span key={m} style={{ top: (m - ini) * px }}>{aHora(m)}</span>)}</div>
        {semana.map((d) => (
          <div key={d} className="cal-col">
            {grupos(citas.filter((c) => c.fecha === d)).map((g) => {
              const estilo = { top: (g.ini - ini) * px, height: Math.max((g.fin - g.ini) * px - 2, 24) };
              if (g.citas.length === 1) {
                const c = g.citas[0];
                return (
                  <button type="button" key={c.id} className={`blq-c mini e-${c.estado}`} style={estilo} onClick={() => abrir(c)} title={`${c.hora} ${c.cliente}, ${primer(c.barbero)}`}>
                    <b>{c.hora} {c.cliente.split(" ").slice(0, 2).map((x, i) => (i ? `${x[0]}.` : x)).join(" ")}</b><small><i className="est-p" aria-hidden="true" />{ESTADO[c.estado] ?? c.estado}, {primer(c.barbero)}</small>
                  </button>
                );
              }
              return (
                <Link key={g.citas[0].id} href={url({ dia: d, vista: "calendario" })} className="blq-c mini blq-grupo" style={estilo} title={g.citas.map((c) => `${c.hora} ${c.cliente} con ${primer(c.barbero)}`).join("\n")}>
                  <b>{aHora(g.ini)} <span className="blq-n">{g.citas.length} citas</span></b>
                  {g.citas.slice(0, Math.max(1, Math.floor(estilo.height / 16) - 1)).map((c) => <small key={c.id}>{c.hora} {primer(c.cliente)}, {primer(c.barbero)}</small>)}
                </Link>
              );
            })}
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
            <a className="ct-bt" href={`tel:${tel}`}>Llamar</a>
            <a className="ct-bt" href={`https://wa.me/${tel.length === 10 ? `52${tel}` : tel}`} target="_blank" rel="noreferrer">WhatsApp</a>
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
          <div className="campo"><span>Día</span><CampoFecha valor={fecha} min={hoy} cambiar={setFecha} etiqueta="Día" /></div>
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
                <CampoHora valor={v[0]} cambiar={(h) => onChange({ ...valor, [String(d)]: [h, v[1]] })} etiqueta={`Entrada ${DIAS_L[d]}`} />
                <span className="muted">a</span>
                <CampoHora valor={v[1]} cambiar={(h) => onChange({ ...valor, [String(d)]: [v[0], h] })} etiqueta={`Salida ${DIAS_L[d]}`} />
              </span>
            ) : <small className="muted">Cerrado</small>}
          </div>
        );
      })}
    </div>
  );
}

export function EditarHorario({ persona, negocio, cerrar, avisar }: { persona: Persona; negocio: Horario; cerrar: () => void; avisar: (r: Res) => void }) {
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

export function EditarRotacion({ equipo: todos, actual, dia, cerrar, avisar, excluir = [] }: { equipo: Persona[]; actual: Rot | null; dia: string; cerrar: () => void; avisar: (r: Res) => void; excluir?: string[] }) {
  // Quien ya tiene descanso fijo no aparece: cada persona tiene un solo modo de descanso.
  const equipo = todos.filter((e) => !excluir.includes(e.id));
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
        {excluir.length > 0 && <small className="ac-nota">No aparecen quienes ya tienen descanso fijo.</small>}
        {equipo.length < 2 && <p className="aviso" style={{ margin: 0 }}>Se necesitan dos personas sin descanso fijo para la rotación.</p>}
        <div className="fila-eg">
          <div className="campo"><span>Primera persona</span><Selector etiqueta="Primera persona" valor={p1} onChange={setP1} opciones={personas} /></div>
          <div className="campo"><span>Descansa el</span><Selector etiqueta="Primer día" valor={d1} onChange={setD1} opciones={dias} /></div>
        </div>
        <div className="fila-eg">
          <div className="campo"><span>Segunda persona</span><Selector etiqueta="Segunda persona" valor={p2} onChange={setP2} opciones={personas} /></div>
          <div className="campo"><span>Descansa el</span><Selector etiqueta="Segundo día" valor={d2} onChange={setD2} opciones={dias} /></div>
        </div>
        <div className="campo"><span>Semana de inicio</span><CampoFecha valor={inicio} cambiar={setInicio} etiqueta="Semana de inicio" /></div>
        <div className="ejemplo-p rot-ej">
          <span><small>Semana del {Number(lunes.slice(8))} {MESES[Number(lunes.slice(5, 7)) - 1]}</small><span>{n(p1)} descansa el {DIAS_L[Number(d1)]}, {n(p2)} el {DIAS_L[Number(d2)]}</span></span>
          <span><small>Semana siguiente</small><span>{n(p1)} descansa el {DIAS_L[Number(d2)]}, {n(p2)} el {DIAS_L[Number(d1)]}</span></span>
        </div>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="entre">
          {actual ? <button type="button" className="link-c peligro-t" disabled={pend} onClick={() => iniciar(async () => { avisar(await quitarRotacion()); cerrar(); })}>Quitar descanso rotativo</button> : <span />}
          <button type="button" className="bt" disabled={pend || equipo.length < 2} onClick={() => iniciar(async () => { const r = await guardarRotacion({ persona1: p1, persona2: p2, dia1: Number(d1), dia2: Number(d2), semanaInicio: inicio, activo: true }); if (r.error) setError(r.error); else { avisar(r); cerrar(); } })}>Guardar<Fl /></button>
        </div>
      </div>
    </Modal>
  );
}

export function NuevoBloqueo({ equipo, dia, cerrar, avisar, personaInicial = "" }: { equipo: Persona[]; dia: string; cerrar: () => void; avisar: (r: Res) => void; personaInicial?: string }) {
  const [quien, setQuien] = useState(personaInicial);
  const [fecha, setFecha] = useState(dia);
  const [desde, setDesde] = useState("14:00");
  const [hasta, setHasta] = useState("15:00");
  const [todoDia, setTodoDia] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Horarios" titulo="Bloquear horario o día">
      <div className="pila" style={{ gap: 12 }}>
        <div className="fila-eg">
          <div className="campo"><span>A quién</span><Selector etiqueta="A quién" valor={quien} onChange={setQuien} opciones={[{ valor: "", texto: "Todo el negocio" }, ...equipo.map((e) => ({ valor: e.id, texto: primer(e.nombre) }))]} /></div>
          <div className="campo"><span>Día</span><CampoFecha valor={fecha} cambiar={setFecha} etiqueta="Día" /></div>
        </div>
        <div className="ac-sw"><span><b>Todo el día</b><small>Para días festivos, vacaciones o cuando el negocio no abre.</small></span><Interruptor etiqueta="Todo el día" checked={todoDia} onChange={setTodoDia} /></div>
        {!todoDia && (
          <div className="fila-eg horario-p">
            <div className="campo"><span>De</span><CampoHora valor={desde} cambiar={setDesde} etiqueta="Desde" /></div>
            <div className="campo"><span>A</span><CampoHora valor={hasta} cambiar={setHasta} etiqueta="Hasta" /></div>
          </div>
        )}
        <label className="campo"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder={todoDia ? "Ejemplo: día festivo, vacaciones" : "Ejemplo: comida, cita médica"} /></label>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones"><button type="button" className="bt" disabled={pend} onClick={() => iniciar(async () => { const r = await bloquearHorario({ usuarioId: quien || null, fecha, desde: todoDia ? "00:00" : desde, hasta: todoDia ? "23:59" : hasta, motivo }); if (r.error) setError(r.error); else { avisar(r); cerrar(); } })}>Bloquear<Fl /></button></div>
      </div>
    </Modal>
  );
}

/** Capa flotante que se cierra al tocar fuera o con Escape. */
function Flotante({ cerrar, className, rol, children }: { cerrar: () => void; className: string; rol: "menu" | "dialog"; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [cerrar]);
  return <div ref={ref} className={`ag-flot ${className}`} role={rol}>{children}</div>;
}

/** Compartir reservaciones: código QR a la vista, el enlace y las formas de enviarlo. */
function Compartir({ enlace, cerrar }: { enlace: string; cerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof window === "undefined" ? enlace : `${window.location.origin}${enlace}`;
  const corto = url.replace(/^https?:\/\/(www\.)?/, "");
  useEffect(() => {
    let vivo = true;
    import("qrcode").then(({ default: QR }) => QR.toString(url, { type: "svg", margin: 1, color: { dark: "#13171c", light: "#ffffff" } })).then((x) => { if (vivo) setQr(x); }).catch(() => {});
    return () => { vivo = false; };
  }, [url]);
  const copiar = () => navigator.clipboard?.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); });
  const texto = `Agenda tu cita en línea aquí: ${url}`;
  const imprimir = () => {
    if (!qr) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(`<title>Reserva tu cita</title><body style="font-family:system-ui;text-align:center;padding:40px"><h2 style="margin:0 0 6px">Reserva tu cita</h2><p style="color:#555;margin:0 0 20px">Escanea el código con tu teléfono</p><div style="width:280px;margin:0 auto">${qr}</div><p style="margin-top:16px;font-size:14px">${corto}</p><script>setTimeout(()=>print(),300)</` + `script></body>`);
    w.document.close();
  };
  return (
    <Flotante cerrar={cerrar} className="ag-comp ag-comp2" rol="dialog">
      <div className="ag-comp-cab"><span><b>Compartir reservaciones</b><small>Tus clientes agendan solos desde este enlace</small></span><button type="button" className="icb" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button></div>
      <div className="agc-qr">{qr ? <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="qr" />}</div>
      <button type="button" className="agc-enl" onClick={copiar} aria-label="Copiar enlace"><span>{corto}</span><Icono n={copiado ? "palomita" : "copiar"} /></button>
      {copiado && <small className="ag-ok">Enlace copiado</small>}
      <div className="agc-acc">
        <a className="bt" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><Icono n="enviar" />WhatsApp</a>
        <button type="button" className="bt sec" onClick={imprimir} disabled={!qr}><Icono n="imprimir" />Imprimir QR</button>
      </div>
      <a className="agc-ver" href={`${enlace}?desde=agenda`}><Icono n="ojo" />Ver la página como la ve el cliente</a>
    </Flotante>
  );
}

/** Línea del tiempo del día (teléfono): horas a la izquierda, la hora actual marcada, huecos libres para agendar y bloqueos. */
function VistaLinea(p: {
  citas: CitaVista[]; bloqueos: Bloqueo[]; equipo: Persona[]; persona: string; dia: string; hoy: string; horario: Horario; cerrados: string[]; ahora: number;
  abrir: (c: CitaVista) => void; url: (x: Partial<{ dia: string; vista: string; persona: string }>) => string;
  puede: { modificar: boolean; horarios: boolean }; agendar: (minuto: number) => void; bloquear: () => void; avisar: (r: Res) => void;
}) {
  const router = useRouter();
  const [quitar, setQuitar] = useState<Bloqueo | null>(null);
  const [pend, iniciar] = useTransition();
  const h = p.cerrados.includes(p.dia) ? null : p.horario[String(dow(p.dia))];
  const PX = 1.2;
  const etiqueta = p.dia === p.hoy ? `Hoy, ${DIAS_L[dow(p.dia)]} ${Number(p.dia.slice(8))}` : `${DIAS_L[dow(p.dia)].replace(/^./, (x) => x.toUpperCase())} ${Number(p.dia.slice(8))}`;
  // Minutos de ahora en la hora local del negocio: la diferencia entre la hora de las citas y su instante da la zona.
  const ahoraMin = (() => {
    if (p.dia !== p.hoy) return null;
    const ref = p.citas[0];
    const d = new Date(p.ahora);
    if (ref) return Math.round(aMin(ref.hora) + (p.ahora - ref.inicioMs) / 60000);
    return d.getHours() * 60 + d.getMinutes();
  })();
  const visibles = p.citas.filter((c) => c.fecha === p.dia && c.estado !== "cancelada" && c.estado !== "expirada");
  const bloqueos = p.bloqueos.filter((b) => b.fecha === p.dia && (!p.persona || !b.personaId || b.personaId === p.persona));
  const barra = (
    <div className="ln-barra">
      <div className="ln-dia">
        <Link href={p.url({ dia: sumar(p.dia, -1) })} scroll={false} aria-label="Día anterior"><Icono n="izquierda" /></Link>
        <span className="ln-fecha"><CampoFecha valor={p.dia} texto={etiqueta} etiqueta="Elegir día" cambiar={(f) => router.push(p.url({ dia: f }), { scroll: false })} /></span>
        {p.dia !== p.hoy && <Link href={p.url({ dia: p.hoy })} scroll={false} className="ln-ahoy">Hoy</Link>}
        <Link href={p.url({ dia: sumar(p.dia, 1) })} scroll={false} aria-label="Día siguiente"><Icono n="derecha" /></Link>
      </div>
      {p.puede.horarios && <button type="button" className="ln-ib" onClick={p.bloquear} aria-label="Bloquear horario" title="Bloquear horario"><Icono n="candado" /></button>}
      {p.puede.modificar && <button type="button" className="ln-ib pri" onClick={() => p.agendar(-1)} aria-label="Nueva cita" title="Nueva cita"><Icono n="mas" /></button>}
    </div>
  );
  const chips = p.equipo.length > 1 && (
    <nav className="ln-chips" aria-label="Persona">
      <Link href={p.url({ persona: "" })} scroll={false} aria-current={!p.persona ? "true" : undefined}>Todo el equipo</Link>
      {p.equipo.map((e) => <Link key={e.id} href={p.url({ persona: e.id })} scroll={false} aria-current={p.persona === e.id ? "true" : undefined}><Avatar avatar={e.avatar} nombre={e.nombre} t={18} />{primer(e.nombre)}</Link>)}
    </nav>
  );
  if (!h) return <>{barra}{chips}<p className="muted ln-vacio">El negocio no abre este día.</p></>;
  const ini = Math.floor(aMin(h[0]) / 60) * 60, fin = Math.ceil(aMin(h[1]) / 60) * 60;
  const y = (m: number) => (m - ini) * PX;
  // Carriles: citas que se empalman (dos personas a la misma hora) van lado a lado.
  const orden = [...visibles].sort((a, b) => a.inicioMs - b.inicioMs);
  const carril = new Map<string, { c: number; de: number }>();
  let grupo: CitaVista[] = [], finGrupo = -1, ocupados: number[] = [];
  const cerrarGrupo = () => { const n = Math.max(ocupados.length, 1); grupo.forEach((c) => carril.set(c.id, { c: carril.get(c.id)!.c, de: n })); grupo = []; ocupados = []; };
  for (const c of orden) {
    const a = aMin(c.hora), b = a + c.duracion;
    if (a >= finGrupo) { cerrarGrupo(); finGrupo = -1; }
    let i = ocupados.findIndex((f) => f <= a);
    if (i < 0) { i = ocupados.length; ocupados.push(b); } else ocupados[i] = b;
    carril.set(c.id, { c: i, de: 1 });
    grupo.push(c);
    finGrupo = Math.max(finGrupo, b);
  }
  cerrarGrupo();
  // Huecos libres de al menos 30 minutos (desde ahora si es hoy), entre citas y bloqueos.
  const ocupado = [...visibles.map((c) => [aMin(c.hora), aMin(c.hora) + c.duracion]), ...bloqueos.map((b) => [aMin(b.desde), aMin(b.hasta)])].sort((a, b) => a[0] - b[0]);
  const huecos: [number, number][] = [];
  let cursor = Math.max(aMin(h[0]), ahoraMin !== null ? Math.ceil(ahoraMin / 15) * 15 : 0);
  if (p.dia < p.hoy) cursor = Infinity;
  for (const [a, b] of [...ocupado, [aMin(h[1]), aMin(h[1])]]) {
    const desde = Math.ceil(cursor / 15) * 15;
    if (a - desde >= 30) huecos.push([desde, a]);
    cursor = Math.max(cursor, b);
  }
  const horas = Array.from({ length: (fin - ini) / 60 + 1 }, (_, i) => ini + i * 60);
  return (
    <>
      {barra}
      {chips}
      <section className="ln" style={{ height: (fin - ini) * PX + 16 }} aria-label={`Agenda del ${etiqueta}`}>
        {horas.map((m) => <span key={m} className="ln-h" style={{ top: y(m) }}><small>{aHora(m)}</small><i /></span>)}
        {huecos.map(([a, b]) => p.puede.modificar ? (
          <button type="button" key={a} className="ln-libre" style={{ top: y(a) + 2, height: Math.max((b - a) * PX - 4, 26) }} onClick={() => p.agendar(a)}>
            <span>Libre de {aHora(a)} a {aHora(b)}</span><b><Icono n="mas" />Agendar</b>
          </button>
        ) : <div key={a} className="ln-libre" style={{ top: y(a) + 2, height: Math.max((b - a) * PX - 4, 26) }}><span>Libre de {aHora(a)} a {aHora(b)}</span></div>)}
        {bloqueos.map((b) => (
          <button type="button" key={b.id} className="ln-blq" style={{ top: y(aMin(b.desde)) + 1, height: Math.max((aMin(b.hasta) - aMin(b.desde)) * PX - 2, 22) }} onClick={() => setQuitar(b)} disabled={!p.puede.horarios}>
            Bloqueado{b.motivo ? `, ${b.motivo}` : ""}{b.personaId ? ` de ${primer(b.persona)}` : ", todo el negocio"}
          </button>
        ))}
        {orden.map((c) => {
          const k = carril.get(c.id)!;
          const ahoraEn = ahoraMin !== null && ahoraMin >= aMin(c.hora) && ahoraMin < aMin(c.hora) + c.duracion;
          return (
            <button type="button" key={c.id} className={`ln-c e-${c.estado} ${ahoraEn || c.estado === "en_atencion" ? "osc" : ""}`} onClick={() => p.abrir(c)}
              style={{ top: y(aMin(c.hora)) + 1, height: Math.max(c.duracion * PX - 3, 26), left: `calc(52px + (100% - 52px) * ${k.c / k.de})`, width: `calc((100% - 52px) / ${k.de} - 4px)` }}>
              <span><b>{c.hora} {c.cliente}</b>{c.duracion >= 25 && <small>{c.servicios.join(", ")}, {primer(c.barbero)}</small>}</span>
              {k.de === 1 && c.duracion >= 25 && <Chip e={c.estado} />}
            </button>
          );
        })}
        {ahoraMin !== null && ahoraMin >= ini && ahoraMin <= fin && <i className="ln-ahora" style={{ top: y(ahoraMin) }} aria-hidden="true" />}
      </section>
      {quitar && (
        <Modal abierto cerrar={() => setQuitar(null)} etiqueta="Bloqueo" titulo={`${quitar.desde} a ${quitar.hasta}`}>
          <div className="pila" style={{ gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>{quitar.personaId ? primer(quitar.persona) : "Todo el negocio"}{quitar.motivo ? `, ${quitar.motivo}` : ""}. Mientras esté bloqueado no se pueden agendar citas en ese horario.</p>
            <div className="acciones"><button type="button" className="bt sec" disabled={pend} onClick={() => iniciar(async () => { const r = await quitarBloqueo(quitar.id); p.avisar(r); if (!r.error) setQuitar(null); })}><Icono n="basura" />Quitar bloqueo</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
