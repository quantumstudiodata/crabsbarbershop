"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { aHora, montoAPagar, type ConfigCitas } from "@/lib/agenda";
import { PagoReserva, type FormaPago } from "./PagoReserva";
import { formatoDinero } from "@/lib/money";
import { cotizar, diasPublicos, horariosPublicos, reservar } from "../actions";

type Servicio = { id: string; nombre: string; descripcion: string; categoria: string; precio: number; duracionMin: number; promo: { nombre: string; precio: number } | null };
type Persona = { id: string; nombre: string; avatar: string };

const PASOS = ["Servicio", "Barbero", "Fecha", "Hora", "Tus datos", "Resumen", "Pago", "Confirmar"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const fechaTxt = (f: string) => `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][dow(f)]} ${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;

export function Reservar(p: {
  slug: string; negocio: string; hoy: string; servicios: Servicio[]; equipo: Persona[];
  opciones: { elegir: boolean; cualquiera: boolean; varios: boolean; maxDias: number };
  pago: { modo: string; ejemplo: { minimo: number }; politica: string; reembolso: string; regla: ConfigCitas["pago"]; apartarMin: number };
  enLinea: { llave: string; cuenta: string } | null;
  // Cuando el equipo abre la página desde la app: un botón para volver.
  regreso?: { href: string; texto: string } | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [svc, setSvc] = useState<string[]>([]);
  const [persona, setPersona] = useState<string | null>(p.opciones.cualquiera ? null : p.equipo[0]?.id ?? null);
  const [dias, setDias] = useState<Record<string, boolean> | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [horas, setHoras] = useState<number[] | null>(null);
  const [minuto, setMinuto] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [notas, setNotas] = useState("");
  const [sitio, setSitio] = useState("");
  const [cot, setCot] = useState<{ filas: { nombre: string; precio: number; descuento: number }[]; total: number; duracion: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pago en línea (si el negocio lo tiene): anticipo, total o pagar en el negocio.
  const pagaEnLinea = !!p.enLinea && p.pago.modo !== "sin_pago";
  const [forma, setForma] = useState<FormaPago>(p.pago.modo === "completo" ? "total" : p.pago.modo === "opcional" ? "negocio" : "anticipo");
  const [pend, iniciar] = useTransition();
  const elegidos = p.servicios.filter((s) => svc.includes(s.id));
  const duracion = elegidos.reduce((a, s) => a + s.duracionMin, 0);
  const estimado = elegidos.reduce((a, s) => a + (s.promo?.precio ?? s.precio), 0);
  const cats = useMemo(() => [...new Set(p.servicios.map((s) => s.categoria))], [p.servicios]);
  const saltaBarbero = !p.opciones.elegir || (p.equipo.length <= 1 && p.opciones.cualquiera);

  // Al llegar a la fecha se consultan los días con lugar; al elegir un día, sus horarios.
  useEffect(() => {
    if (paso !== 2) return;
    setDias(null);
    diasPublicos(p.slug, svc, persona).then(setDias);
  }, [paso, persona, svc.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fecha || paso !== 3) return;
    setHoras(null);
    horariosPublicos(p.slug, fecha, svc, persona).then(setHoras);
  }, [fecha, paso]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paso !== 5 || !fecha || minuto === null) return;
    cotizar(p.slug, fecha, minuto, svc).then(setCot);
  }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (n: number) => { setError(null); setPaso(n === 1 && saltaBarbero ? (n > paso ? 2 : 0) : n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const puedeSeguir = [svc.length > 0, p.opciones.cualquiera || !!persona, !!fecha, minuto !== null, nombre.trim().length > 1 && tel.replace(/\D/g, "").length >= 10, !!cot, true, true][paso];
  const confirmar = () => iniciar(async () => {
    const r = await reservar(p.slug, { servicioIds: svc, persona, fecha: fecha!, minuto: minuto!, nombre, telefono: tel, notas, sitio });
    if (r.error) { setError(r.error); if (r.error.includes("ocup")) { setMinuto(null); setPaso(3); setFecha(fecha); } return; }
    router.push(`/reservar/${p.slug}/cita/${r.token}`);
  });
  const tocar = (id: string) => {
    if (!p.opciones.varios) { setSvc([id]); setTimeout(() => ir(1), 120); return; }
    setSvc(svc.includes(id) ? svc.filter((x) => x !== id) : [...svc, id]);
  };
  const pagoTxt: Record<string, string> = {
    sin_pago: "Pagas en el negocio al terminar tu servicio.",
    opcional: "Puedes pagar en el negocio al terminar tu servicio.",
    completo: "Este negocio pide el pago completo al reservar.",
    anticipo_fijo: "Este negocio pide un anticipo al reservar.",
    anticipo_pct: "Este negocio pide un anticipo al reservar.",
  };
  const fechas = Array.from({ length: Math.min(p.opciones.maxDias + 1, 60) }, (_, i) => sumar(p.hoy, i));
  const grupos: [string, number[]][] = horas ? [["Mañana", horas.filter((m) => m < 720)], ["Tarde", horas.filter((m) => m >= 720 && m < 1080)], ["Noche", horas.filter((m) => m >= 1080)]] : [];

  return (
    <main className="reserva">
      {p.regreso && <a href={p.regreso.href} className="rv-regreso"><Icono n="izquierda" />{p.regreso.texto}</a>}
      <header className="rv-cab">
        {paso > 0 ? <button type="button" className="icb" onClick={() => ir(paso - 1)} aria-label="Regresar"><Icono n="izquierda" /></button> : <span className="rv-logo" aria-hidden="true"><Icono n="calendario" /></span>}
        <span className="rv-tit"><b>{p.negocio}</b><small>Paso {paso + 1} de 8, {PASOS[paso]}</small></span>
      </header>
      <div className="rv-progreso" aria-hidden="true"><i style={{ width: `${((paso + 1) / 8) * 100}%` }} /></div>

      <section className="rv-cuerpo">
        {paso === 0 && (
          <>
            <h1>¿Qué te vas a hacer?</h1>
            {p.opciones.varios && <p className="muted">Puedes elegir más de un servicio.</p>}
            {cats.map((c) => (
              <div key={c} className="rv-grupo">
                <span className="lab">{c}</span>
                {p.servicios.filter((s) => s.categoria === c).map((s) => (
                  <button type="button" key={s.id} className={`rv-svc ${svc.includes(s.id) ? "on" : ""}`} aria-pressed={svc.includes(s.id)} onClick={() => tocar(s.id)}>
                    <span><b>{s.nombre}</b><small>{s.duracionMin} min{s.descripcion ? `, ${s.descripcion}` : ""}</small>{s.promo && <em className="rv-promo"><Icono n="etiqueta" />{s.promo.nombre}</em>}</span>
                    <span className="rv-precio">{s.promo ? <><s>{formatoDinero(s.precio)}</s>{formatoDinero(s.promo.precio)}</> : formatoDinero(s.precio)}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}

        {paso === 1 && (
          <>
            <h1>¿Quién te atiende?</h1>
            <div className="rv-personas">
              {p.opciones.cualquiera && (
                <button type="button" className={`rv-per ${persona === null ? "on" : ""}`} onClick={() => { setPersona(null); setTimeout(() => ir(2), 120); }}>
                  <span className="rv-cual"><Icono n="persona" /></span><b>Cualquier barbero</b><small>El primero disponible</small>
                </button>
              )}
              {p.opciones.elegir && p.equipo.map((e) => (
                <button type="button" key={e.id} className={`rv-per ${persona === e.id ? "on" : ""}`} onClick={() => { setPersona(e.id); setTimeout(() => ir(2), 120); }}>
                  <Avatar avatar={e.avatar} nombre={e.nombre} t={44} /><b>{e.nombre}</b>
                </button>
              ))}
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <h1>¿Qué día?</h1>
            <div className="rv-dias">
              {fechas.map((f) => {
                const hay = dias?.[f];
                return (
                  <button type="button" key={f} disabled={!dias || !hay} className={`rv-dia ${fecha === f ? "on" : ""}`} onClick={() => { setFecha(f); setMinuto(null); setTimeout(() => ir(3), 120); }}>
                    <small>{f === p.hoy ? "Hoy" : DIAS[dow(f)]}</small><b>{Number(f.slice(8))}</b><small>{MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)}</small>
                  </button>
                );
              })}
            </div>
            {!dias && <p className="muted">Buscando días con lugar…</p>}
            {dias && !Object.values(dias).some(Boolean) && <p className="muted">No hay lugares disponibles en estas fechas.</p>}
          </>
        )}

        {paso === 3 && fecha && (
          <>
            <h1>¿A qué hora?</h1>
            <p className="muted">{fechaTxt(fecha)}</p>
            {horas === null && <p className="muted">Buscando horarios…</p>}
            {horas && horas.length === 0 && <p className="muted">Ese día ya no hay horarios. Elige otro día.</p>}
            {grupos.filter(([, xs]) => xs.length).map(([t, xs]) => (
              <div key={t} className="rv-grupo"><span className="lab">{t}</span>
                <div className="rv-horas">{xs.map((m) => <button type="button" key={m} className={minuto === m ? "on" : ""} onClick={() => { setMinuto(m); setTimeout(() => ir(4), 120); }}>{aHora(m)}</button>)}</div>
              </div>
            ))}
          </>
        )}

        {paso === 4 && (
          <>
            <h1>Tus datos</h1>
            <p className="muted">No necesitas crear una cuenta.</p>
            <label className="campo"><span>Nombre</span><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} placeholder="Tu nombre" /></label>
            <label className="campo"><span>Teléfono (WhatsApp)</span><input className="input" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" placeholder="10 dígitos" /></label>
            <label className="campo"><span>Algo que debamos saber (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} /></label>
            <input className="rv-trampa" tabIndex={-1} autoComplete="off" value={sitio} onChange={(e) => setSitio(e.target.value)} aria-hidden="true" />
          </>
        )}

        {paso === 5 && (
          <>
            <h1>Revisa tu reservación</h1>
            {!cot ? <p className="muted">Calculando…</p> : (
              <div className="rv-resumen">
                {cot.filas.map((f) => (
                  <div key={f.nombre} className="entre"><span>{f.nombre}</span><span>{f.descuento ? <><s className="muted">{formatoDinero(f.precio)}</s> </> : null}<b>{formatoDinero(f.precio - f.descuento)}</b></span></div>
                ))}
                <div className="entre"><span className="muted">Con</span><b>{persona ? p.equipo.find((e) => e.id === persona)?.nombre : "Cualquier barbero"}</b></div>
                <div className="entre"><span className="muted">Cuándo</span><b>{fecha && fechaTxt(fecha)}, {minuto !== null && aHora(minuto)}</b></div>
                <div className="entre"><span className="muted">Duración</span><b>{cot.duracion} min</b></div>
                <div className="entre"><span className="muted">A nombre de</span><b>{nombre}</b></div>
                <div className="entre rv-total"><span>Total</span><b>{formatoDinero(cot.total)}</b></div>
              </div>
            )}
          </>
        )}

        {paso === 6 && (pagaEnLinea ? (
          <PagoReserva slug={p.slug} enLinea={p.enLinea!} modo={p.pago.modo} forma={forma} setForma={setForma}
            total={cot?.total ?? estimado} anticipo={montoAPagar(cot?.total ?? estimado, p.pago.regla).minimo} apartarMin={p.pago.apartarMin}
            politica={p.pago.politica} reembolso={p.pago.reembolso}
            datos={{ servicioIds: svc, persona, fecha: fecha!, minuto: minuto!, nombre, telefono: tel, notas, sitio }}
            alConfirmar={(token) => router.push(`/reservar/${p.slug}/cita/${token}`)}
            alOcupado={() => { setMinuto(null); setPaso(3); }}
            enNegocio={() => ir(7)} />
        ) : (
          <>
            <h1>Pago</h1>
            <div className="rv-pago">
              <span className="rv-opc on"><i className="radio-p" /><span><b>Pagar en el negocio</b><small>{pagoTxt[p.pago.modo]}</small></span></span>
              {p.pago.modo !== "sin_pago" && <small className="muted">El pago en línea estará disponible pronto. Por ahora tu reservación queda confirmada y pagas en el negocio.</small>}
            </div>
            {p.pago.politica && <p className="rv-politica"><b>Cancelaciones.</b> {p.pago.politica}</p>}
            {p.pago.reembolso && <p className="rv-politica"><b>Reembolsos.</b> {p.pago.reembolso}</p>}
          </>
        ))}

        {paso === 7 && (
          <>
            <h1>Confirma tu cita</h1>
            <div className="rv-resumen">
              <div className="entre"><span className="muted">Servicio</span><b>{elegidos.map((s) => s.nombre).join(", ")}</b></div>
              <div className="entre"><span className="muted">Cuándo</span><b>{fecha && fechaTxt(fecha)}, {minuto !== null && aHora(minuto)}</b></div>
              <div className="entre rv-total"><span>Total</span><b>{formatoDinero(cot?.total ?? estimado)}</b></div>
            </div>
            <p className="muted">Al confirmar recibirás tu comprobante. Desde ahí puedes cambiar o cancelar tu cita.</p>
          </>
        )}
        {error && <p className="aviso error">{error}</p>}
      </section>

      {!(paso === 6 && pagaEnLinea) && <footer className="rv-barra">
        <span className="rv-sum"><b>{svc.length ? formatoDinero(cot?.total ?? estimado) : "Elige un servicio"}</b><small>{svc.length ? `${svc.length} ${svc.length === 1 ? "servicio" : "servicios"}, ${duracion} min` : ""}</small></span>
        {paso < 7
          ? <button type="button" className="bt" disabled={!puedeSeguir} onClick={() => ir(paso + 1)}>Continuar</button>
          : <button type="button" className="bt" disabled={pend} onClick={confirmar}>{pend ? "Reservando…" : "Confirmar cita"}</button>}
      </footer>}
    </main>
  );
}
