"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

export function MiCita({ slug, token, negocio, hoy, maxDias, cita, politica, horas }: {
  slug: string; token: string; negocio: string; hoy: string; maxDias: number; politica: string; horas: number;
  cita: { folio: string; estado: string; estadoTxt: string; cliente: string; fecha: string; hora: string; duracion: number; servicios: { nombre: string; precio: number }[]; total: number; pagado: number; barbero: string; avatar: string; sePuedeCambiar: boolean };
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"ver" | "cancelar" | "cambiar">("ver");
  const [fecha, setFecha] = useState<string | null>(null);
  const [libres, setLibres] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const activa = cita.estado === "en_espera";
  const elegirDia = (f: string) => { setFecha(f); setLibres(null); horariosParaCambio(token, f).then(setLibres); };
  return (
    <main className="reserva">
      <header className="rv-cab"><span className="rv-logo" aria-hidden="true"><Icono n="calendario" /></span><span className="rv-tit"><b>{negocio}</b><small>Comprobante de tu cita</small></span></header>
      <section className="rv-cuerpo">
        <div className={`rv-ticket ${activa ? "" : "inactiva"}`}>
          <span className="rv-estado">{activa ? <><Icono n="palomita" />Cita confirmada</> : cita.estadoTxt}</span>
          <b className="rv-cuando">{fechaTxt(cita.fecha).replace(/^./, (x) => x.toUpperCase())}</b>
          <span className="rv-hora">{cita.hora}<small>{cita.duracion} min</small></span>
          <span className="rv-con"><Avatar avatar={cita.avatar} nombre={cita.barbero} t={28} />Te atiende {cita.barbero}</span>
          <div className="rv-resumen">
            {cita.servicios.map((s) => <div key={s.nombre} className="entre"><span>{s.nombre}</span><b>{formatoDinero(s.precio)}</b></div>)}
            {cita.pagado > 0 && <div className="entre"><span className="muted">Pagado</span><b>{formatoDinero(cita.pagado)}</b></div>}
            <div className="entre rv-total"><span>{cita.pagado > 0 ? "Por pagar" : "Total"}</span><b>{formatoDinero(cita.total - cita.pagado)}</b></div>
          </div>
          <small className="muted">Folio {cita.folio}, a nombre de {cita.cliente}</small>
        </div>
        {activa && <p className="muted rv-guarda">Guarda esta página para cambiar o cancelar tu cita.</p>}

        {modo === "cancelar" && (
          <div className="rv-tarjeta">
            <b>¿Cancelar tu cita?</b>
            {politica && <p className="muted">{politica}</p>}
            <button type="button" className="bt peligro" disabled={pend} onClick={() => iniciar(async () => { const r = await cancelarPorCliente(token); if (r.error) setError(r.error); else { setModo("ver"); router.refresh(); } })}>Sí, cancelar</button>
          </div>
        )}
        {modo === "cambiar" && (
          <div className="rv-tarjeta">
            <b>Elige el nuevo día</b>
            <div className="rv-dias">{Array.from({ length: Math.min(maxDias + 1, 30) }, (_, i) => sumar(hoy, i)).map((f) => (
              <button type="button" key={f} className={`rv-dia ${fecha === f ? "on" : ""}`} onClick={() => elegirDia(f)}><small>{f === hoy ? "Hoy" : DIAS[dow(f)]}</small><b>{Number(f.slice(8))}</b><small>{MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)}</small></button>
            ))}</div>
            {fecha && (libres === null ? <p className="muted">Buscando horarios…</p> : libres.length === 0 ? <p className="muted">Ese día no hay horarios.</p> : (
              <div className="rv-horas">{libres.map((m) => <button type="button" key={m} disabled={pend} onClick={() => iniciar(async () => { const r = await cambiarPorCliente(token, fecha, m); if (r.error) setError(r.error); else { setModo("ver"); router.refresh(); } })}>{aHora(m)}</button>)}</div>
            ))}
          </div>
        )}
        {error && <p className="aviso error">{error}</p>}
        {activa && !cita.sePuedeCambiar && <p className="muted">Faltan menos de {horas} horas para tu cita. Para cambiarla, comunícate al negocio.</p>}
      </section>
      {activa && cita.sePuedeCambiar && modo === "ver" && (
        <footer className="rv-barra">
          <button type="button" className="bt sec" onClick={() => setModo("cancelar")}>Cancelar cita</button>
          <button type="button" className="bt" onClick={() => setModo("cambiar")}>Cambiar horario</button>
        </footer>
      )}
      {modo !== "ver" && <footer className="rv-barra"><button type="button" className="bt sec" onClick={() => { setModo("ver"); setError(null); }}>Regresar</button><a className="bt" href={`/reservar/${slug}`}>Nueva cita</a></footer>}
    </main>
  );
}
