"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sumarDias } from "@/lib/fechas";

type Servicio = { id: string; nombre: string; duracionMin: number; precio: number; categoria: string };
type Persona = { id: string; nombre: string };
type Slot = { hora: string; iniciaEn: string; terminaEn: string };

const dinero = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n / 100);

export function Reserva({ barberiaId, servicios, equipo, fechaInicial }: { barberiaId: string; servicios: Servicio[]; equipo: Persona[]; fechaInicial: string }) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [barberoId, setBarberoId] = useState(equipo[0]?.id ?? "");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const servicio = useMemo(() => servicios.find((s) => s.id === servicioId), [servicios, servicioId]);

  useEffect(() => {
    setHora("");
    setError("");
    if (!servicioId || !barberoId || !fecha) { setSlots([]); return; }
    const abort = new AbortController();
    setCargando(true);
    fetch(`/api/agendar/${barberiaId}?servicioId=${encodeURIComponent(servicioId)}&barberoId=${encodeURIComponent(barberoId)}&fecha=${encodeURIComponent(fecha)}`, { signal: abort.signal })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "No se pudieron consultar los horarios."); return d; })
      .then((d) => setSlots(d.slots ?? []))
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "No se pudieron consultar los horarios."); })
      .finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [barberiaId, servicioId, barberoId, fecha]);

  async function reservar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!servicio || !hora) return;
    setEnviando(true);
    setError("");
    try {
      const r = await fetch(`/api/agendar/${barberiaId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ servicioId, barberoId, fecha, hora, clienteNombre, clienteTelefono, clienteEmail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar la cita.");
      router.push(`/agendar/confirmada/${d.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la cita.");
      setEnviando(false);
    }
  }

  return (
    <form className="glass panel agendar-form" onSubmit={reservar}>
      <label className="campo"><span>Servicio</span><select className="input" value={servicioId} onChange={(e) => setServicioId(e.target.value)} required>
        {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.duracionMin} min · {dinero(s.precio)}</option>)}
      </select></label>
      <div className="agendar-dos">
        <label className="campo"><span>Con quién</span><select className="input" value={barberoId} onChange={(e) => setBarberoId(e.target.value)} required>
          {equipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select></label>
        <label className="campo"><span>Día</span><input className="input" type="date" value={fecha} min={fechaInicial} max={sumarDias(fechaInicial, 60)} onChange={(e) => setFecha(e.target.value)} required /></label>
      </div>
      <fieldset className="agendar-horas">
        <legend className="lab">HORARIOS DISPONIBLES</legend>
        {cargando ? <p className="muted">Buscando horarios…</p> : slots.length === 0 ? <p className="muted">No hay horarios disponibles para esta fecha. Prueba otro día.</p> : (
          <div className="agendar-slots">{slots.map((s) => <button key={s.iniciaEn} type="button" className={`slot-cita ${hora === s.hora ? "seleccionado" : ""}`} aria-pressed={hora === s.hora} onClick={() => setHora(s.hora)}>{s.hora}</button>)}</div>
        )}
      </fieldset>
      <div className="agendar-dos">
        <label className="campo"><span>Tu nombre</span><input className="input" autoComplete="name" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} maxLength={100} required /></label>
        <label className="campo"><span>Teléfono</span><input className="input" type="tel" autoComplete="tel" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} maxLength={25} placeholder="10 dígitos" required /></label>
      </div>
      <label className="campo"><span>Correo (opcional)</span><input className="input" type="email" autoComplete="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} maxLength={200} /></label>
      {error && <p className="aviso error" role="alert">{error}</p>}
      <div className="agendar-resumen"><span>{servicio?.nombre ?? "Servicio"} con {equipo.find((p) => p.id === barberoId)?.nombre ?? ""}</span><b>{servicio ? dinero(servicio.precio) : ""}</b></div>
      <button className="bt grande" type="submit" disabled={enviando || !hora || !clienteNombre.trim() || !clienteTelefono.trim()}>
        <span>{enviando ? "Guardando cita…" : "Reservar cita"}</span><span className="fl">→</span>
      </button>
      <small className="muted">El pago es opcional. Si lo deseas, podrás pagar el total con Stripe después de reservar.</small>
    </form>
  );
}
