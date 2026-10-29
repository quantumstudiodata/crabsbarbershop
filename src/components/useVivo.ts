"use client";

import { useEffect, useState } from "react";
import type { AlertaVivo, EventoVivo, SolicitudVivo } from "@/app/api/vivo/route";

// Una sola consulta cada 15 segundos, compartida por la ventana En vivo y la campana.
type Datos = { eventos: EventoVivo[]; solicitudes: SolicitudVivo[]; alertas: AlertaVivo[]; nuevos: Set<string> };
let datos: Datos = { eventos: [], solicitudes: [], alertas: [], nuevos: new Set() };
let cargado = false;
const oyentes = new Set<(d: Datos) => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

async function cargar() {
  try {
    const r = await fetch("/api/vivo", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { eventos: EventoVivo[]; solicitudes: SolicitudVivo[]; alertas?: AlertaVivo[] };
    const antes = new Set(datos.eventos.map((e) => e.id));
    const nuevos = cargado ? new Set(d.eventos.filter((e) => !antes.has(e.id)).map((e) => e.id)) : new Set<string>();
    cargado = true;
    datos = { eventos: d.eventos, solicitudes: d.solicitudes, alertas: d.alertas ?? [], nuevos };
    oyentes.forEach((f) => f(datos));
  } catch {}
}

export function useVivo() {
  const [d, setD] = useState(datos);
  useEffect(() => {
    oyentes.add(setD);
    if (!reloj) {
      cargar();
      reloj = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 15000);
    }
    return () => {
      oyentes.delete(setD);
      if (oyentes.size === 0 && reloj) { clearInterval(reloj); reloj = null; }
    };
  }, []);
  return d;
}

export const hace = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
};

export function leerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem("crabs-vistos") ?? "[]")); } catch { return new Set(); }
}
export function guardarVistos(s: Set<string>) {
  try { localStorage.setItem("crabs-vistos", JSON.stringify([...s].slice(-300))); } catch {}
}
