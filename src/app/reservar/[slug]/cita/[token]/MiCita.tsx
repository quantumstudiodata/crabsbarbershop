"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { DatosTransferencia, type CuentaTransferencia } from "@/components/DatosTransferencia";
import { aHora } from "@/lib/agenda";
import { formatoDinero } from "@/lib/money";
import { cambiarPorCliente, cancelarPorCliente, horariosParaCambio, subirComprobante } from "../../../actions";
import { prepararArchivo, MAX_ADJUNTO } from "@/lib/archivo";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fechaTxt = (f: string) => `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][dow(f)]} ${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
const corto = (f: string) => `${DIAS[dow(f)]} ${Number(f.slice(8))}`;
const TRAMOS: [string, string, number, number][] = [["m", "Mañana", 0, 720], ["t", "Tarde", 720, 1080], ["n", "Noche", 1080, 1440]];

type Persona = { id: string; nombre: string; avatar: string };

export function MiCita({ slug, token, negocio, hoy, maxDias, cita, politica, horas, equipo, cualquiera, persona: personaActual, cuenta, whatsapp = "", clienteCancela = false }: {
  cuenta?: CuentaTransferencia | null; whatsapp?: string; clienteCancela?: boolean;
  slug: string; token: string; negocio: string; hoy: string; maxDias: number; politica: string; horas: number;
  equipo: Persona[]; cualquiera: boolean; persona: string;
  cita: { folio: string; estado: string; estadoTxt: string; cliente: string; fecha: string; hora: string; duracion: number; servicios: { nombre: string; precio: number }[]; total: number; pagado: number; transferencia?: number; inicio?: string; comprobante?: boolean; barbero: string; avatar: string; sePuedeCambiar: boolean };
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
      {clienteCancela && cita.pagado === 0 && <button type="button" className="bt sec" onClick={() => { setModo("cancelar"); setCambio(null); }}>Cancelar cita</button>}
      <button type="button" className="bt" onClick={abrirCambio}>Cambiar fecha u hora</button>
    </>
  );

  // Archivo .ics para guardar la cita en el calendario del teléfono.
  const calendario = () => {
    if (!cita.inicio) return;
    const ini = new Date(cita.inicio), fin = new Date(ini.getTime() + cita.duracion * 60000);
    const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Crabs//Citas//ES", "BEGIN:VEVENT", `UID:${cita.folio}@crabs`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(ini)}`, `DTEND:${f(fin)}`,
      `SUMMARY:${negocio}: ${cita.servicios.map((x) => x.nombre).join(", ")}`, `DESCRIPTION:Con ${cita.barbero}. Folio ${cita.folio}. ${window.location.href}`, "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Tu cita", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const el = document.createElement("a"); el.href = url; el.download = `cita-${cita.folio}.ics`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const [subiendo, setSubiendo] = useState(false);
  const [subido, setSubido] = useState(!!cita.comprobante);
  const archivo = async (f?: File) => {
    if (!f) return;
    setError(null); setSubiendo(true);
    try {
      const datos = await prepararArchivo(f);
      if (datos.length > MAX_ADJUNTO) { setError("El archivo pesa mucho. Prueba con una captura de pantalla."); return; }
      const r = await subirComprobante(token, datos, f.name);
      if (r.error) setError(r.error); else { setSubido(true); router.refresh(); }
    } catch { setError("No se pudo leer el archivo."); } finally { setSubiendo(false); }
  };
  const wa = whatsapp ? `https://wa.me/${whatsapp.length === 10 ? `52${whatsapp}` : whatsapp}?text=${encodeURIComponent(`Hola, transferí ${formatoDinero(cita.transferencia ?? 0)} de mi cita ${cita.folio} a nombre de ${cita.cliente}. Te mando mi comprobante.`)}` : "";
  const pendientePago = activa && !!cita.transferencia;
  const titulo = noLlego ? "No pudimos verte" : pendientePago ? "Tu cita está apartada" : activa ? "¡Listo! Tu cita está agendada" : confirmando ? "Confirmando tu pago…" : cita.estado === "expirada" ? "El apartado venció" : cita.estadoTxt;
  const sub = noLlego ? "Elige otro día y hora para tu cita." : pendientePago ? (subido ? "Recibimos tu comprobante. El negocio la confirma en cuanto revise el pago." : "Falta tu transferencia para confirmarla.") : activa ? `Te esperamos en ${negocio}.` : "";
  const pasos = [
    { t: "Reservada", ok: true },
    { t: cita.transferencia || cita.pagado > 0 ? "Pago" : "Pagas en el negocio", ok: cita.pagado > 0 || (!cita.transferencia && activa), espera: pendientePago },
    { t: "Tu visita", ok: cita.estado === "completada" },
  ];

  return (
    <main className="reserva mc">
      <header className="mc-cab">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-crabs.png" alt={negocio} width={946} height={209} />
        <small>Comprobante de reservación</small>
      </header>
      <div className="mc-rejilla">
        <section className="rv-cuerpo mc-izq">
          {cambio && (
            <div className="mc-listo" role="status">
              <span className="mc-listo-i" aria-hidden="true"><Icono n="palomita" /></span>
              <span><b>Tu cita cambió</b><small>Ahora es el {cambio}. Ya le avisamos al negocio.</small></span>
            </div>
          )}
          <article className={`mc-recibo ${activa ? "" : "inactiva"} ${cambio ? "mc-nuevo" : ""}`}>
            <div className="mc-r-cab">
              <span className={`mc-sello ${pendientePago || confirmando ? "espera" : activa ? "ok" : "gris"}`} aria-hidden="true"><Icono n={pendientePago || confirmando || noLlego ? "reloj" : activa ? "palomita" : "cerrar"} /></span>
              <h1>{titulo}</h1>
              {sub && <p>{sub}</p>}
              <ol className="mc-pasos">{pasos.map((x, i) => <li key={i} className={x.ok ? "ok" : x.espera ? "espera" : ""}><i>{x.ok ? <Icono n="palomita" /> : i + 1}</i>{x.t}</li>)}</ol>
            </div>
            <div className="mc-r-cuando">
              <span className="mc-dia"><small>{DIAS[dow(cita.fecha)]}</small><b>{Number(cita.fecha.slice(8))}</b><small>{MESES[Number(cita.fecha.slice(5, 7)) - 1].slice(0, 3)}</small></span>
              <span><b className="mc-h">{cita.hora}</b><small>{fechaTxt(cita.fecha).replace(/^./, (x) => x.toUpperCase())}, {cita.duracion} min</small></span>
            </div>
            <div className="mc-r-filas">
              <div><span>Te atiende</span><b className="mc-con"><Avatar avatar={cita.avatar} nombre={cita.barbero} t={22} />{cita.barbero}</b></div>
              {cita.servicios.map((x, i) => <div key={`${x.nombre}-${i}`}><span>{i === 0 ? "Servicios" : ""}</span><b>{x.nombre}<em>{formatoDinero(x.precio)}</em></b></div>)}
              <div className="mc-tot"><span>Total</span><b>{formatoDinero(cita.total)}</b></div>
              {cita.pagado > 0 && <div><span>Pagado</span><b>{formatoDinero(cita.pagado)}</b></div>}
              {cita.pagado > 0 && cita.pagado < cita.total && <div><span>En el negocio</span><b>{formatoDinero(cita.total - cita.pagado)}</b></div>}
            </div>
            <div className="mc-corte" aria-hidden="true" />
            <div className="mc-r-pie"><span><small>Folio</small><b>{cita.folio}</b></span><span><small>A nombre de</small><b>{cita.cliente}</b></span></div>
          </article>

          {pendientePago && cuenta && (
            <div className="mc-transf">
              <span className="mc-lab">1. Transfiere {cita.transferencia! < cita.total ? "el anticipo" : "el total"}</span>
              <DatosTransferencia cuenta={cuenta} monto={cita.transferencia} concepto={`Cita ${cita.folio}`} />
              <span className="mc-lab">2. Manda tu comprobante</span>
              <div className="mc-comp">
                <label className={`mc-subir ${subido ? "ok" : ""}`}>
                  <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => archivo(e.target.files?.[0])} disabled={subiendo} />
                  <span className="mc-subir-i"><Icono n={subido ? "palomita" : "camara"} /></span>
                  <span><b>{subiendo ? "Subiendo…" : subido ? "Comprobante enviado" : "Subir foto o PDF"}</b><small>{subido ? "Toca para cambiarlo" : "Captura de pantalla de tu transferencia"}</small></span>
                </label>
                {wa && <a className="mc-wa" href={wa} target="_blank" rel="noreferrer"><Icono n="enviar" />Mandarlo por WhatsApp</a>}
              </div>
            </div>
          )}
          {activa && modo === "ver" && !pendientePago && <p className="muted rv-guarda mc-solo-mov">{cita.pagado > 0 ? "Tu pago queda guardado aunque cambies de fecha." : "Guarda esta página: desde aquí puedes cambiar tu cita."}</p>}
          {activa && !cita.sePuedeCambiar && <p className="muted rv-guarda mc-solo-mov">Faltan menos de {horas} horas para tu cita. Para cambiarla, comunícate al negocio.</p>}
          {activa && modo === "ver" && <button type="button" className="mc-cal mc-solo-mov" onClick={calendario}><Icono n="calendario" />Agregar a mi calendario</button>}
        </section>

        <section className="mc-der">
          {/* En escritorio, al lado del comprobante: qué se puede hacer con la cita. */}
          {modo === "ver" && activa && (
            <div className="rv-tarjeta mc-ayuda">
              <span className="mc-ayuda-i" aria-hidden="true"><Icono n="calendario" /></span>
              <b className="mc-tit">{acciones ? "¿Necesitas cambiar algo?" : "Tu cita está guardada"}</b>
              <p className="muted">{acciones ? `Puedes cambiar el día, la hora${opciones.length > 1 ? " o con quién" : ""} desde aquí, hasta ${horas} horas antes de tu cita.` : !cita.sePuedeCambiar ? `Faltan menos de ${horas} horas para tu cita. Para cambiarla, comunícate al negocio.` : "Guarda esta página para consultarla cuando quieras."}</p>
              {acciones && <div className="mc-acc">{acciones}</div>}
              <button type="button" className="mc-cal" onClick={calendario}><Icono n="calendario" />Agregar a mi calendario</button>
              <small className="muted">Guarda esta página: aquí siempre verás tu cita al día.</small>
            </div>
          )}
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
