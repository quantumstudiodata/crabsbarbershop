"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/components/Icono";
import { aHora } from "@/lib/agenda";

type Servicio = { id: string; nombre: string; precio: number; duracionMin: number; promo: { nombre: string; precio: number } | null };
type Persona = { id: string; nombre: string; avatar: string };
export type DatosInicio = {
  horario: Record<string, [string, string]>; cerrados: string[]; zona: string; whatsapp: string;
  resenas: { promedio: number; n: number; comentario: string } | null;
};

const DIAS_L = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

/** Hora y día de la semana del negocio, para saber si está abierto. */
function ahoraEn(zona: string) {
  const x = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date());
  const v = (t: string) => x.find((y) => y.type === t)?.value ?? "";
  const fecha = `${v("year")}-${v("month")}-${v("day")}`;
  return { fecha, dia: new Date(`${fecha}T12:00:00Z`).getUTCDay(), min: (Number(v("hour")) % 24) * 60 + Number(v("minute")) };
}

function estadoNegocio(d: DatosInicio) {
  const { fecha, dia, min } = ahoraEn(d.zona);
  const hoy = d.cerrados.includes(fecha) ? undefined : d.horario[String(dia)];
  if (hoy && min < aMin(hoy[0])) return { abierto: false, t: `Abrimos hoy a las ${hoy[0]}` };
  if (hoy && min < aMin(hoy[1])) return { abierto: true, t: `Abierto ahora, cierra a las ${hoy[1]}` };
  for (let k = 1; k <= 7; k++) {
    const h = d.horario[String((dia + k) % 7)];
    if (h) return { abierto: false, t: `Cerrado, abrimos ${k === 1 ? "mañana" : `el ${DIAS_L[(dia + k) % 7].toLowerCase()}`} a las ${h[0]}` };
  }
  return { abierto: false, t: "Por ahora no hay horario" };
}

/** Pantalla de inicio de la página de reservas: invita a reservar y muestra lo esencial del negocio. */
export function Inicio(p: {
  negocio: string; servicios: Servicio[]; equipo: Persona[]; elegir: boolean; datos: DatosInicio;
  libres: { fecha: string; hoy: boolean; xs: number[] } | null;
  empezar: () => void; conServicio: (id: string) => void; conPersona: (id: string) => void; conHora: (fecha: string, minuto: number) => void;
}) {
  const [saludo, setSaludo] = useState("Hola");
  const [estado, setEstado] = useState<{ abierto: boolean; t: string } | null>(null);
  useEffect(() => {
    const h = ahoraEn(p.datos.zona).min / 60;
    setSaludo(h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches");
    setEstado(estadoNegocio(p.datos));
  }, [p.datos]);
  const semana = [1, 2, 3, 4, 5, 6, 0];
  // Días seguidos con el mismo horario se agrupan: "Lunes a sábado, 10:00 a 20:00".
  const filas: { dias: string; horas: string }[] = [];
  for (const d of semana) {
    const h = p.datos.horario[String(d)];
    const horas = h ? `${h[0]} a ${h[1]}` : "Cerrado";
    const ult = filas[filas.length - 1];
    if (ult && ult.horas === horas) { ult.dias = `${ult.dias.split(" a ")[0]} a ${DIAS_L[d].toLowerCase()}`; } else filas.push({ dias: DIAS_L[d], horas });
  }
  const wa = p.datos.whatsapp.replace(/\D/g, "");
  return (
    <section className="fx-ini">
      <div className="fx-ini-hero fx-cg">
        <p className="fx-ini-sal">{saludo}</p>
        <h1>Agenda tu cita</h1>
        {estado && <span className={`fx-ini-est ${estado.abierto ? "si" : ""}`}><i />{estado.t}</span>}
        <button type="button" className="fx-ini-cta" onClick={p.empezar}>Reservar cita<span><Icono n="derecha" /></span></button>
        {p.libres && p.libres.xs[0] !== undefined && (
          <button type="button" className="fx-ini-prox" onClick={() => p.conHora(p.libres!.fecha, p.libres!.xs[0])}>
            <span>Próximo horario libre</span><b>{p.libres.hoy ? "Hoy" : "Mañana"} a las {aHora(p.libres.xs[0])}</b>
          </button>
        )}
      </div>

      {p.libres && p.libres.xs.length > 1 && (
        <div className="fx-ini-sec">
          <span className="fx-lab">{p.libres.hoy ? "Libres hoy" : "Libres mañana"}</span>
          <div className="fx-ini-hrs">{p.libres.xs.slice(0, 12).map((m) => <button type="button" key={m} onClick={() => p.conHora(p.libres!.fecha, m)}>{aHora(m)}</button>)}</div>
        </div>
      )}

      <div className="fx-ini-sec">
        <span className="fx-lab">Horario y contacto</span>
        <div className="fx-ini-info">{filas.map((f) => <div key={f.dias}><span>{f.dias}</span><b>{f.horas}</b></div>)}</div>
        {wa && <a className="fx-ini-wa" href={`https://wa.me/${wa.length === 10 ? `52${wa}` : wa}`} target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a>}
      </div>
    </section>
  );
}
