"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { aHora } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import { cambiarPorCliente, cancelarPorCliente, horariosParaCambio } from "../../../actions";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fechaTxt = (f: string) => `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][dow(f)]} ${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
const corto = (f: string) => `${DIAS[dow(f)]} ${Number(f.slice(8))}`;
const TRAMOS: [string, string, number, number][] = [["m", "Mañana", 0, 720], ["t", "Tarde", 720, 1080], ["n", "Noche", 1080, 1440]];

type Persona = { id: string; nombre: string; avatar: string };

export function MiCita({ slug, token, negocio, hoy, maxDias, cita, politica, horas, equipo, cualquiera, persona: personaActual }: {
  slug: string; token: string; negocio: string; hoy: string; maxDias: number; politica: string; horas: number;
  equipo: Persona[]; cualquiera: boolean; persona: string;
  cita: { folio: string; estado: string; estadoTxt: string; cliente: string; fecha: string; hora: string; duracion: number; servicios: { nombre: string; precio: number }[]; total: number; pagado: number; barbero: string; avatar: string; sePuedeCambiar: boolean };
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"ver" | "cancelar" | "cambiar">("ver");
  const [cambio, setCambio] = useState<string | null>(null);
  const [persona, setPersona] = useState(personaActual);
  const [semana, setSemana] = useState(0);
  const [fecha, setFecha] = useState<string | null>(null);
  const [libres, setLibres] = useState<number[] | null>(null);
  const [tramo, setTramo] = useState("");
  const [minuto, setMinuto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const noLlego = cita.estado === "no_asistio";
  const activa = cita.estado === "en_espera" || noLlego;
  const confirmando = cita.estado === "apartada";
  // Mientras Stripe confirma el pago, la página se actualiza sola.
  useEffect(() => {
    if (!confirmando) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [confirmando, router]);
  useEffect(() => {
    setMinuto(null);
    if (!fecha) return;
    let vivo = true;
    setLibres(null);
    horariosParaCambio(token, fecha, persona).then((r) => { if (vivo) setLibres(r); });
    return () => { vivo = false; };
  }, [fecha, persona, token]);

  const limite = Math.min(maxDias, 60);
  const dias = Array.from({ length: 7 }, (_, i) => sumar(hoy, semana * 7 + i)).filter((f) => f <= sumar(hoy, limite));
  const grupos = TRAMOS.map(([k, t, a, b]) => ({ k, t, xs: (libres ?? []).filter((m) => m >= a && m < b) })).filter((g) => g.xs.length);
  const tramoV = grupos.some((g) => g.k === tramo) ? tramo : grupos[0]?.k;
  const nombreDe = (id: string) => (id ? equipo.find((e) => e.id === id)?.nombre ?? cita.barbero : "Quien esté libre");
  const opciones: Persona[] = [...(cualquiera ? [{ id: "", nombre: "Quien esté libre", avatar: "" }] : []), ...equipo];
  const mes = dias.length ? MESES[Number(dias[0].slice(5, 7)) - 1] : "";

  const abrirCambio = () => { setModo("cambiar"); setCambio(null); setError(null); setFecha(null); setMinuto(null); setSemana(0); };
  const confirmar = () => iniciar(async () => {
    if (!fecha || minuto === null) return;
    const r = await cambiarPorCliente(token, fecha, minuto, persona);
    if (r.error) { setError(r.error); return; }
    setCambio(`${corto(fecha)}, ${aHora(minuto)}`);
    setModo("ver");
    setError(null);
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const acciones = activa && cita.sePuedeCambiar && modo === "ver" && (
    <>
      {cita.pagado === 0 && <button type="button" className="bt sec" onClick={() => { setModo("cancelar"); setCambio(null); }}>Cancelar cita</button>}
      <button type="button" className="bt" onClick={abrirCambio}>Cambiar fecha u hora</button>
    </>
  );

  return (
    <main className="reserva mc">
      <header className="rv-cab"><span className="rv-logo" aria-hidden="true"><Icono n="calendario" /></span><span className="rv-tit"><b>{negocio}</b><small>Comprobante de tu cita</small></span></header>
      <div className="mc-rejilla">
        <section className="rv-cuerpo mc-izq">
          {cambio && (
            <div className="mc-listo" role="status">
              <span className="mc-listo-i" aria-hidden="true"><Icono n="palomita" /></span>
              <span><b>Tu cita cambió</b><small>Ahora es el {cambio}. Ya le avisamos al negocio.</small></span>
            </div>
          )}
          <div className={`rv-ticket ${activa ? "" : "inactiva"} ${cambio ? "mc-nuevo" : ""}`}>
            <span className="rv-estado">{noLlego ? <><Icono n="reloj" />No pudimos verte, elige otro día</> : activa ? <><Icono n="palomita" />Cita confirmada</> : confirmando ? <><Icono n="reloj" />Confirmando tu pago…</> : cita.estado === "expirada" ? "El apartado venció sin pago" : cita.estadoTxt}</span>
            <b className="rv-cuando">{fechaTxt(cita.fecha).replace(/^./, (x) => x.toUpperCase())}</b>
            <span className="rv-hora">{cita.hora}<small>{cita.duracion} min</small></span>
            <span className="rv-con"><Avatar avatar={cita.avatar} nombre={cita.barbero} t={28} />Te atiende {cita.barbero}</span>
            <div className="rv-resumen">
              {cita.servicios.map((s, i) => <div key={`${s.nombre}-${i}`} className="entre"><span>{s.nombre}</span><b>{formatoDinero(s.precio)}</b></div>)}
              {cita.pagado > 0 && <div className="entre"><span className="muted">Pagado</span><b>{formatoDinero(cita.pagado)}</b></div>}
              <div className="entre rv-total"><span>{cita.pagado > 0 ? "Por pagar" : "Total"}</span><b>{formatoDinero(cita.total - cita.pagado)}</b></div>
            </div>
            <small className="muted">Folio {cita.folio}, a nombre de {cita.cliente}</small>
          </div>
          {activa && modo === "ver" && <p className="muted rv-guarda">{cita.pagado > 0 ? "Tu pago queda guardado aunque cambies de fecha. Guarda esta página." : "Guarda esta página para cambiar o cancelar tu cita."}</p>}
          {activa && !cita.sePuedeCambiar && <p className="muted rv-guarda">Faltan menos de {horas} horas para tu cita. Para cambiarla, comunícate al negocio.</p>}
        </section>

        <section className="mc-der">
          {modo === "ver" && acciones && <div className="mc-acc">{acciones}</div>}
          {modo === "cancelar" && (
            <div className="rv-tarjeta mc-panel">
              <b className="mc-tit">¿Cancelar tu cita?</b>
              {politica && <p className="muted">{politica}</p>}
              <div className="mc-pie">
                <button type="button" className="bt sec" onClick={() => setModo("ver")}>Regresar</button>
                <button type="button" className="bt peligro" disabled={pend} onClick={() => iniciar(async () => { const r = await cancelarPorCliente(token); if (r.error) setError(r.error); else { setModo("ver"); router.refresh(); } })}>Sí, cancelar</button>
              </div>
            </div>
          )}
          {modo === "cambiar" && (
            <div className="rv-tarjeta mc-panel">
              <div className="entre"><b className="mc-tit">Cambiar tu cita</b><button type="button" className="icb" onClick={() => setModo("ver")} aria-label="Cerrar"><Icono n="cerrar" /></button></div>

              {opciones.length > 1 && (
                <div className="mc-campo"><span className="lab">Con quién</span>
                  <div className="mc-personas">{opciones.map((e) => (
                    <button type="button" key={e.id || "cual"} className={persona === e.id ? "on" : ""} aria-pressed={persona === e.id} onClick={() => setPersona(e.id)}>
                      {e.id ? <Avatar avatar={e.avatar} nombre={e.nombre} t={26} /> : <span className="mc-cual"><Icono n="clientes" /></span>}{e.nombre}
                    </button>
                  ))}</div>
                </div>
              )}

              <div className="mc-campo">
                <div className="entre"><span className="lab">Día, {mes}</span>
                  <span className="mc-nav">
                    <button type="button" className="icb" disabled={semana === 0} onClick={() => setSemana(semana - 1)} aria-label="Semana anterior"><Icono n="izquierda" /></button>
                    <button type="button" className="icb" disabled={sumar(hoy, (semana + 1) * 7) > sumar(hoy, limite)} onClick={() => setSemana(semana + 1)} aria-label="Semana siguiente"><Icono n="derecha" /></button>
                  </span>
                </div>
                <div className="mc-dias">{dias.map((f) => (
                  <button type="button" key={f} className={fecha === f ? "on" : ""} aria-pressed={fecha === f} onClick={() => setFecha(f)}>
                    <small>{f === hoy ? "Hoy" : DIAS[dow(f)]}</small><b>{Number(f.slice(8))}</b>
                  </button>
                ))}</div>
              </div>

              {fecha && (
                <div className="mc-campo"><span className="lab">Hora</span>
                  {libres === null ? <p className="muted">Buscando horarios…</p> : libres.length === 0 ? <p className="muted">Ese día no hay lugar{persona ? ` con ${nombreDe(persona)}` : ""}. Prueba otro día{opciones.length > 1 ? " u otra persona" : ""}.</p> : <>
                    {grupos.length > 1 && <div className="mc-tramos" role="tablist">{grupos.map((g) => <button type="button" role="tab" key={g.k} aria-selected={g.k === tramoV} className={g.k === tramoV ? "on" : ""} onClick={() => setTramo(g.k)}>{g.t}<small>{g.xs.length}</small></button>)}</div>}
                    <div className="mc-horas">{(grupos.find((g) => g.k === tramoV)?.xs ?? []).map((m) => <button type="button" key={m} className={minuto === m ? "on" : ""} aria-pressed={minuto === m} onClick={() => setMinuto(m)}>{aHora(m)}</button>)}</div>
                  </>}
                </div>
              )}

              <div className="mc-compara">
                <span><small>Antes</small><b>{corto(cita.fecha)}, {cita.hora}</b><em>con {cita.barbero}</em></span>
                <Icono n="derecha" />
                <span className={minuto === null ? "vacio" : ""}><small>Nuevo</small><b>{fecha && minuto !== null ? `${corto(fecha)}, ${aHora(minuto)}` : "Elige día y hora"}</b><em>{persona === "" ? "con quien esté libre" : `con ${nombreDe(persona)}`}</em></span>
              </div>
              <button type="button" className="bt mc-ok" disabled={pend || !fecha || minuto === null} onClick={confirmar}>{pend ? "Cambiando…" : "Confirmar cambio"}</button>
            </div>
          )}
          {error && <p className="aviso error">{error}</p>}
        </section>
      </div>
      {acciones && <footer className="rv-barra mc-barra">{acciones}</footer>}
      {!activa && !confirmando && <footer className="rv-barra mc-nueva"><a className="bt" href={`/reservar/${slug}`}>Reservar otra cita</a></footer>}
    </main>
  );
}
