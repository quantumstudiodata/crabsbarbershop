"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { aHora, montoAPagar, type ConfigCitas } from "@/lib/agenda";
import { cargoEnLinea } from "@/lib/cargo";
import { formatoDinero } from "@/lib/money";
import { PagoTarjeta } from "./PagoReserva";
import { cotizar, diasPublicos, horariosPublicos, reservar } from "../actions";

type Servicio = { id: string; nombre: string; descripcion: string; categoria: string; precio: number; duracionMin: number; promo: { nombre: string; precio: number } | null };
type Persona = { id: string; nombre: string; avatar: string };
export type FormaPago = "negocio" | "anticipo" | "total";

const PASOS = ["Servicio", "Barbero", "Día", "Hora", "Tus datos", "Confirmar"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const TRAMOS: [string, string, number, number][] = [["m", "Mañana", 0, 720], ["t", "Tarde", 720, 1080], ["n", "Noche", 1080, 1440]];

/** Cantidad que cambia con una transición corta, para que el total "se mueva" en vez de saltar. */
function Monto({ valor }: { valor: number }) {
  const [v, setV] = useState(valor);
  const previo = useRef(valor);
  useEffect(() => {
    const desde = previo.current, hasta = valor;
    previo.current = valor;
    if (desde === hasta || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(hasta); return; }
    const t0 = performance.now();
    let id = 0;
    const paso = (t: number) => { const k = Math.min((t - t0) / 420, 1); setV(Math.round(desde + (hasta - desde) * (1 - (1 - k) ** 3))); if (k < 1) id = requestAnimationFrame(paso); };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor]);
  return <>{formatoDinero(v)}</>;
}

/**
 * Reservación en cuatro pasos: servicio, cuándo (con quién, día y hora en una sola pantalla), datos y confirmar.
 * En el teléfono, una barra fija abajo lleva el total; en escritorio, un panel a la izquierda va mostrando la cita.
 */
export function Reservar(p: {
  slug: string; negocio: string; hoy: string; servicios: Servicio[]; equipo: Persona[];
  opciones: { elegir: boolean; cualquiera: boolean; varios: boolean; maxDias: number };
  pago: { modo: string; ejemplo: { minimo: number }; politica: string; reembolso: string; regla: ConfigCitas["pago"]; apartarMin: number };
  enLinea: { llave: string; cuenta: string } | null;
  regreso?: { href: string; texto: string } | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [dir, setDir] = useState(1);
  const [cat, setCat] = useState("");
  const [svc, setSvc] = useState<string[]>([]);
  const [persona, setPersona] = useState<string | null>(p.opciones.cualquiera || !p.opciones.elegir ? null : p.equipo[0]?.id ?? null);
  const [dias, setDias] = useState<Record<string, boolean> | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [horas, setHoras] = useState<number[] | null>(null);
  const [tramo, setTramo] = useState("");
  const [minuto, setMinuto] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [notas, setNotas] = useState("");
  const [sitio, setSitio] = useState("");
  const [cot, setCot] = useState<{ filas: { nombre: string; precio: number; descuento: number }[]; total: number; duracion: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pagaEnLinea = !!p.enLinea && p.pago.modo !== "sin_pago";
  const [forma, setForma] = useState<FormaPago>(!pagaEnLinea || p.pago.modo === "opcional" ? "negocio" : p.pago.modo === "completo" ? "total" : "anticipo");
  const [pend, iniciar] = useTransition();
  const cats = useMemo(() => [...new Set(p.servicios.map((s) => s.categoria))], [p.servicios]);
  const elegidos = svc.map((id) => p.servicios.find((x) => x.id === id)).filter(Boolean) as Servicio[];
  const nombres = (xs: Servicio[]) => lista([...new Set(xs.map((x) => x.nombre))].map((n) => { const k = xs.filter((x) => x.nombre === n).length; return k > 1 ? `${n} x${k}` : n; }));
  const duracion = elegidos.reduce((a, s) => a + s.duracionMin, 0);
  const estimado = elegidos.reduce((a, s) => a + (s.promo?.precio ?? s.precio), 0);
  const total = cot?.total ?? estimado;
  const anticipo = montoAPagar(total, p.pago.regla).minimo;
  const enTarjeta = forma === "negocio" ? 0 : forma === "total" ? total : anticipo;
  const conCargo = enTarjeta ? enTarjeta + cargoEnLinea(enTarjeta) : 0;
  const quien = persona ? p.equipo.find((e) => e.id === persona) : null;

  // Días con lugar para lo elegido; al cambiar de persona o servicio se vuelven a pedir.
  useEffect(() => {
    if (paso !== 2 || !svc.length) return;
    let vivo = true;
    setDias(null);
    diasPublicos(p.slug, svc, persona).then((d) => {
      if (!vivo) return;
      setDias(d);
      if (fecha && !d[fecha]) { setFecha(null); setMinuto(null); }
    });
    return () => { vivo = false; };
  }, [paso, persona, svc.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fecha || paso !== 3) return;
    let vivo = true;
    setHoras(null);
    horariosPublicos(p.slug, fecha, svc, persona).then((h) => { if (vivo) setHoras(h); });
    return () => { vivo = false; };
  }, [fecha, persona, paso]); // eslint-disable-line react-hooks/exhaustive-deps
  // El precio final depende del día y la hora (promociones): se recalcula si algo cambia.
  useEffect(() => { setCot(null); }, [svc.join(","), fecha, minuto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paso < 4 || cot || !fecha || minuto === null) return;
    let vivo = true;
    cotizar(p.slug, fecha, minuto, svc).then((r) => { if (vivo) setCot(r); });
    return () => { vivo = false; };
  }, [paso, cot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si no hay a quién elegir, el paso Barbero se salta.
  const saltaBarbero = (p.opciones.cualquiera ? 1 : 0) + (p.opciones.elegir ? p.equipo.length : 0) <= 1;
  const ir = (n: number) => { const m = n === 1 && saltaBarbero ? (n > paso ? 2 : 0) : n; setError(null); setDir(m > paso ? 1 : -1); setPaso(m); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const listo = [svc.length > 0, true, !!fecha, minuto !== null, nombre.trim().length > 1 && tel.replace(/\D/g, "").length >= 10, true][paso];
  const avanzar = (n: number) => setTimeout(() => ir(n), 220);
  const tocar = (id: string) => {
    if (!p.opciones.varios) { setSvc([id]); setTimeout(() => ir(1), 180); return; }
    if (!svc.includes(id)) mas(id);
  };
  const mas = (id: string) => setSvc((xs) => (xs.length >= 6 ? xs : [...xs, id]));
  const menos = (id: string) => setSvc((xs) => { const i = xs.lastIndexOf(id); return i < 0 ? xs : [...xs.slice(0, i), ...xs.slice(i + 1)]; });
  const confirmar = () => iniciar(async () => {
    const r = await reservar(p.slug, { servicioIds: svc, persona, fecha: fecha!, minuto: minuto!, nombre, telefono: tel, notas, sitio });
    if (r.error) { setError(r.error); if (r.error.includes("ocup")) { setMinuto(null); ir(3); } return; }
    router.push(`/reservar/${p.slug}/cita/${r.token}`);
  });

  const fechas = Array.from({ length: Math.min(p.opciones.maxDias + 1, 45) }, (_, i) => sumar(p.hoy, i));
  const grupos = TRAMOS.map(([k, t, a, b]) => ({ k, t, xs: (horas ?? []).filter((m) => m >= a && m < b) })).filter((g) => g.xs.length);
  const tramoV = grupos.some((g) => g.k === tramo) ? tramo : grupos.find((g) => minuto !== null && g.xs.includes(minuto))?.k ?? grupos[0]?.k;
  const mesVisible = fecha ? MESES[Number(fecha.slice(5, 7)) - 1] : MESES[Number(p.hoy.slice(5, 7)) - 1];
  const cuando = fecha && minuto !== null ? `${DIAS[dow(fecha)]} ${Number(fecha.slice(8))}, ${aHora(minuto)}` : "";
  const personas = [...(p.opciones.cualquiera ? [{ id: "", nombre: "Quien esté libre", avatar: "" }] : []), ...(p.opciones.elegir ? p.equipo : [])];
  const visibles = cat ? p.servicios.filter((s) => s.categoria === cat) : p.servicios;
  const opcionesPago: [FormaPago, string, string][] = !pagaEnLinea ? [] : p.pago.modo === "opcional"
    ? [["negocio", "En el negocio", formatoDinero(total)], ["total", "Con tarjeta", "Ahora, en línea"]]
    : p.pago.modo === "completo" ? [["total", "Con tarjeta", "Ahora, en línea"]]
      : [["anticipo", "Anticipo con tarjeta", "El resto en el negocio"], ["total", "Todo con tarjeta", "Ahora, en línea"]];

  // Lo que muestra la barra (teléfono) y el panel (escritorio).
  const barra = paso === 0
    ? { t: svc.length ? <Monto valor={total} /> : "Elige un servicio", s: svc.length ? `${svc.length} ${svc.length === 1 ? "servicio" : "servicios"}, ${duracion} min` : "Toca + para agregar" }
    : paso === 5 && forma !== "negocio" ? { t: <Monto valor={conCargo} />, s: forma === "anticipo" ? "Anticipo, el resto en el negocio" : "Pagas ahora con tarjeta" }
      : paso === 5 ? { t: <Monto valor={total} />, s: "Pagas en el negocio" }
        : { t: cuando || <Monto valor={total} />, s: cuando ? `${quien ? `con ${quien.nombre}` : "con quien esté libre"}, ${formatoDinero(total)}` : `${nombres(elegidos)}, ${duracion} min` };
  const boton = paso < 5
    ? <button type="button" className="fx-go" disabled={!listo} onClick={() => ir(paso + 1)}>Continuar<Icono n="derecha" /></button>
    : <button type="button" className="fx-go" disabled={pend} onClick={confirmar}>{pend ? "Reservando…" : "Reservar"}<Icono n="derecha" /></button>;

  const resumen = [
    { k: 0, t: "Servicios", v: svc.length ? nombres(elegidos) : "" },
    ...(saltaBarbero ? [] : [{ k: 1, t: "Barbero", v: paso > 1 ? (quien ? quien.nombre : "Quien esté libre") : "" }]),
    { k: 2, t: "Cuándo", v: cuando },
    { k: 4, t: "A nombre de", v: paso > 4 ? nombre : "" },
  ];

  return (
    <div className="fx">
      <aside className="fx-panel" aria-label="Tu cita">
        <div className="fx-marca"><img className="fx-palabra" src="/logo-crabs.png" alt={p.negocio} width={946} height={209} /><small>Reserva tu cita en menos de un minuto</small></div>
        <ol className="fx-res">
          {resumen.map((r) => (
            <li key={r.k} className={r.v ? "ok" : ""}><i aria-hidden="true">{r.v ? <Icono n="palomita" /> : <Icono n="mas" />}</i><span><small>{r.t}</small><b>{r.v || "Falta"}</b></span>
              {r.v && paso > r.k && <button type="button" onClick={() => ir(r.k)}>Cambiar</button>}</li>
          ))}
        </ol>
        <div className="fx-res-tot"><span>Total</span><b><Monto valor={paso === 5 && forma !== "negocio" ? conCargo : total} /></b></div>
      </aside>

      <main className="fx-main">
        {p.regreso && <a href={p.regreso.href} className="fx-regreso"><Icono n="izquierda" />{p.regreso.texto}</a>}
        <header className="fx-top"><img className="fx-palabra" src="/logo-crabs.png" alt={p.negocio} width={946} height={209} /></header>
        <div className="fx-prog" aria-label={`Paso ${paso + 1} de ${PASOS.length}`}>
          <span className="fx-prog-t"><b>{PASOS[paso]}</b><small>Paso {paso + 1 - (saltaBarbero && paso > 1 ? 1 : 0)} de {PASOS.length - (saltaBarbero ? 1 : 0)}</small></span>
          <span className="fx-prog-b"><i style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }} /></span>
        </div>

        <section key={paso} className={`fx-cuerpo ${dir > 0 ? "adelante" : "atras"}`}>
          {paso === 0 && (
            <>
              <h1 className="fx-h">¿Qué te hacemos hoy?<small>{p.opciones.varios ? "Agrega uno o varios; puedes repetir un servicio" : "Elige un servicio"}</small></h1>
              <div className="fx-lista">
                {visibles.map((s, i) => {
                  const nuevaCat = cats.length > 1 && (i === 0 || visibles[i - 1].categoria !== s.categoria);
                  const n = svc.filter((x) => x === s.id).length;
                  return (
                    <Fragment key={s.id}>
                    {nuevaCat && <span className="fx-cat" style={{ ["--i" as string]: i }}>{s.categoria}</span>}
                    <div className={`fx-svc ${n ? "on" : ""}`} style={{ ["--i" as string]: i }}>
                      <button type="button" className="fx-svc-t" onClick={() => tocar(s.id)} aria-pressed={n > 0}><b>{s.nombre}{s.promo && <em className="fx-promo">{s.promo.nombre}</em>}</b><small>{s.duracionMin} min{s.descripcion ? `, ${s.descripcion}` : ""}</small></button>
                      <span className="fx-p">{s.promo && <s>{formatoDinero(s.precio)}</s>}{formatoDinero(s.promo?.precio ?? s.precio)}</span>
                      {n && p.opciones.varios ? (
                        <span className="fx-step">
                          <button type="button" onClick={() => menos(s.id)} aria-label={`Quitar uno de ${s.nombre}`}><Icono n="minimizar" /></button>
                          <b key={n}>{n}</b>
                          <button type="button" onClick={() => mas(s.id)} disabled={svc.length >= 6} aria-label={`Agregar otro ${s.nombre}`}><Icono n="mas" /></button>
                        </span>
                      ) : <button type="button" className="fx-add" onClick={() => tocar(s.id)} aria-label={`Agregar ${s.nombre}`}><Icono n={n ? "palomita" : "mas"} /></button>}
                    </div>
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <h1 className="fx-h">¿Quién te atiende?<small>Elige a alguien o a quien esté libre</small></h1>
              <div className="fx-barberos" role="radiogroup" aria-label="Quién te atiende">
                {personas.map((e, i) => {
                  const on = (persona ?? "") === e.id;
                  return (
                    <button type="button" key={e.id || "libre"} role="radio" aria-checked={on} className={`fx-bb ${on ? "on" : ""}`} style={{ ["--i" as string]: i }} onClick={() => { setPersona(e.id || null); setMinuto(null); avanzar(2); }}>
                      {e.id ? <Avatar avatar={e.avatar} nombre={e.nombre} t={52} /> : <span className="fx-libre"><Icono n="clientes" /></span>}
                      <span><b>{e.id ? e.nombre : "Quien esté libre"}</b><small>{e.id ? "Barbero" : "El primero disponible"}</small></span>
                      <Icono n="derecha" />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {paso === 2 && (
            <>
              <h1 className="fx-h">¿Qué día?<small>{quien ? `Días con lugar con ${quien.nombre}` : "Días con lugar"}</small></h1>
              <div className="fx-cal">
                <span className="fx-lab">{mesVisible.replace(/^./, (x) => x.toUpperCase())}</span>
                <div className="fx-cal-g">
                  {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <small key={i}>{d}</small>)}
                  {Array.from({ length: (dow(p.hoy) + 6) % 7 }, (_, i) => <span key={`v${i}`} />)}
                  {fechas.map((f, i) => {
                    const hay = !!dias?.[f];
                    return (
                      <button type="button" key={f} style={{ ["--i" as string]: i }} disabled={!dias || !hay} className={`fx-cd ${fecha === f ? "on" : ""} ${f === p.hoy ? "hoy" : ""}`} aria-pressed={fecha === f} aria-label={`${DIAS_L[dow(f)]} ${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`} onClick={() => { setFecha(f); setMinuto(null); avanzar(3); }}>
                        {Number(f.slice(8)) === 1 && <em>{MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)}</em>}{Number(f.slice(8))}
                      </button>
                    );
                  })}
                </div>
                {!dias && <p className="fx-nota">Buscando días con lugar…</p>}
                {dias && !Object.values(dias).some(Boolean) && <p className="fx-nota">No hay lugares disponibles en estas fechas{persona ? ". Prueba con otra persona." : "."}</p>}
              </div>
            </>
          )}

          {paso === 3 && fecha && (
            <>
              <h1 className="fx-h">¿A qué hora?<small>{DIAS_L[dow(fecha)].replace(/^./, (x) => x.toUpperCase())} {Number(fecha.slice(8))} de {MESES[Number(fecha.slice(5, 7)) - 1]}</small></h1>
              {horas === null ? <div className="fx-cargando" aria-label="Buscando horarios"><i /><i /><i /><i /></div>
                : horas.length === 0 ? <p className="fx-nota">Ese día ya no hay horarios. Elige otro día.</p>
                  : grupos.map((g) => (
                    <div key={g.k} className="fx-sec"><span className="fx-lab">{g.t}</span>
                      <div className="fx-hrs">
                        {g.xs.map((m, i) => <button type="button" key={m} style={{ ["--i" as string]: i }} className={minuto === m ? "on" : ""} aria-pressed={minuto === m} onClick={() => { setMinuto(m); avanzar(4); }}>{aHora(m)}</button>)}
                      </div>
                    </div>
                  ))}
            </>
          )}

          {paso === 4 && (
            <>
              <h1 className="fx-h">¿A nombre de quién?<small>Te mandamos tu comprobante por WhatsApp. No necesitas cuenta.</small></h1>
              <div className="fx-campos">
                <label className="fx-campo"><span>Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} placeholder="Tu nombre" autoFocus /></label>
                <label className="fx-campo"><span>WhatsApp</span><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" placeholder="10 dígitos" /></label>
                <label className="fx-campo fx-ancho"><span>Algo que debamos saber</span><input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} placeholder="Opcional" /></label>
              </div>
              <input className="rv-trampa" tabIndex={-1} autoComplete="off" value={sitio} onChange={(e) => setSitio(e.target.value)} aria-hidden="true" />
            </>
          )}

          {paso === 5 && fecha && minuto !== null && (
            <>
              <h1 className="fx-h">Confirma tu cita</h1>
              <div className="fx-when">
                <span className="fx-when-d"><small>{DIAS[dow(fecha)]}</small><b>{Number(fecha.slice(8))}</b></span>
                <span className="fx-when-t"><b>{aHora(minuto)} a {aHora(minuto + (cot?.duracion ?? duracion))}</b><small>{DIAS_L[dow(fecha)]} {Number(fecha.slice(8))} de {MESES[Number(fecha.slice(5, 7)) - 1]}, {quien ? `con ${quien.nombre}` : "con quien esté libre"}</small></span>
                <button type="button" onClick={() => ir(2)}>Cambiar</button>
              </div>
              <div className="fx-tk">
                <div><span>Servicios</span><span className="fx-tk-v">{(cot?.filas ?? elegidos.map((x) => ({ nombre: x.nombre, precio: x.precio, descuento: x.precio - (x.promo?.precio ?? x.precio) }))).map((f, i) => <span key={i}>{f.nombre} <b>{formatoDinero(f.precio - f.descuento)}</b></span>)}</span><button type="button" onClick={() => ir(0)}>Cambiar</button></div>
                <div><span>A nombre de</span><span className="fx-tk-v"><span>{nombre}</span><small>{tel}</small></span><button type="button" onClick={() => ir(4)}>Cambiar</button></div>
              </div>
              {opcionesPago.length > 0 && (
                <div className="fx-sec"><span className="fx-lab">Cómo pagas</span>
                  <div className="fx-pago" role="radiogroup" aria-label="Cómo pagas">
                    {opcionesPago.map(([k, t, s]) => {
                      const m = k === "negocio" ? total : k === "total" ? total + cargoEnLinea(total) : anticipo + cargoEnLinea(anticipo);
                      return (
                        <button type="button" key={k} role="radio" aria-checked={forma === k} className={forma === k ? "on" : ""} onClick={() => setForma(k)}>
                          <span className="fx-radio" aria-hidden="true" /><span><b>{t}</b><small>{s}</small></span>{forma === k && <b className="fx-pago-m"><Monto valor={m} /></b>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {p.pago.politica && <p className="fx-politica">{p.pago.politica}{forma !== "negocio" ? " Lo pagado no es reembolsable; si no puedes venir, cambia tu cita a otro día." : ""}</p>}
            </>
          )}
          {error && <p className="aviso error" role="alert">{error}</p>}
        </section>

        {paso === 5 && forma !== "negocio" && p.enLinea && fecha && minuto !== null ? (
          <PagoTarjeta slug={p.slug} enLinea={p.enLinea} monto={conCargo} forma={forma} apartarMin={p.pago.apartarMin}
            datos={{ servicioIds: svc, persona, fecha, minuto, nombre, telefono: tel, notas, sitio }}
            barra={barra} atras={() => ir(4)}
            alConfirmar={(token) => router.push(`/reservar/${p.slug}/cita/${token}`)}
            alOcupado={() => { setMinuto(null); ir(3); }} />
        ) : (
          <footer className="fx-barra">
            <div>
              {paso > 0 && <button type="button" className="fx-atras" onClick={() => ir(paso - 1)} aria-label="Atrás"><Icono n="izquierda" /></button>}
              <span className="fx-barra-t"><b>{barra.t}</b><small>{barra.s}</small></span>
              {boton}
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}
