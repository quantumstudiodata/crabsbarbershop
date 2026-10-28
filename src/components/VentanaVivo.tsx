"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventoVivo, SolicitudVivo } from "@/app/api/vivo/route";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";

const hace = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h`;
};

function leer(clave: string) { try { return localStorage.getItem(clave); } catch { return null; } }
function guardar(clave: string, v: string) { try { localStorage.setItem(clave, v); } catch {} }

/** Ventana flotante con lo que pasa en el local. Se puede minimizar. */
export function VentanaVivo({ verTodo }: { verTodo: string }) {
  const [min, setMin] = useState(true);
  const [eventos, setEventos] = useState<EventoVivo[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudVivo[]>([]);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const primera = useRef(true);
  const ruta = usePathname();

  // En Cobro la ventana se queda minimizada para no tapar la venta.
  useEffect(() => { if (ruta.startsWith("/cobrar")) setMin(true); }, [ruta]);

  useEffect(() => {
    setMin(location.pathname.startsWith("/cobrar") || leer("crabs-vivo-min") !== "no");
    setVistos(new Set(JSON.parse(leer("crabs-vivo-vistos") ?? "[]")));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/vivo", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { eventos: EventoVivo[]; solicitudes: SolicitudVivo[] };
      setEventos((antes) => {
        if (!primera.current) {
          const ids = new Set(antes.map((e) => e.id));
          const n = d.eventos.filter((e) => !ids.has(e.id)).map((e) => e.id);
          if (n.length) setNuevos((x) => new Set([...x, ...n]));
        }
        primera.current = false;
        return d.eventos;
      });
      setSolicitudes(d.solicitudes);
    } catch {}
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 15000);
    return () => clearInterval(t);
  }, [cargar]);

  const sinLeer = eventos.filter((e) => !vistos.has(e.id)).length + solicitudes.length;
  const alternar = () => {
    const abrir = min;
    setMin(!abrir);
    guardar("crabs-vivo-min", abrir ? "no" : "si");
    if (abrir) {
      const todos = new Set([...vistos, ...eventos.map((e) => e.id)]);
      setVistos(todos);
      guardar("crabs-vivo-vistos", JSON.stringify([...todos].slice(-200)));
    } else setNuevos(new Set());
  };

  return (
    <aside className={`vivo-win ${min ? "min" : ""}`} aria-label="Actividad en vivo">
      <div className="h" onClick={alternar} role="button" tabIndex={0} aria-expanded={!min} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } }}>
        <span className="vivo"><b style={{ fontSize: 13 }}>En vivo</b></span>
        <span className="fila" style={{ gap: 8 }}>
          {min && sinLeer > 0 && <span className="contador-n">{sinLeer}</span>}
          <Icono n={min ? "arriba" : "minimizar"} />
        </span>
      </div>
      {!min && (
        <>
          <div className="lst">
            {solicitudes.map((s) => (
              <div key={s.id} style={{ display: "grid", gap: 0 }}>
                <div className="n nueva">
                  <Avatar avatar={s.avatar} nombre={s.nombre} t={32} />
                  <span><b style={{ fontWeight: 600 }}>{s.nombre.split(" ")[0]} pide restablecer su contraseña</b><small>Desde la pantalla de entrada</small></span>
                  <span className="t">{hace(s.t)}</span>
                </div>
                <div className="acc"><Link className="bt solo" style={{ padding: "7px 14px", fontSize: 13 }} href={`/ajustes?restablecer=${s.usuarioId}`}><Icono n="llave" />Restablecer</Link></div>
              </div>
            ))}
            {eventos.length === 0 && solicitudes.length === 0 && <p className="muted" style={{ padding: "14px 10px", fontSize: 13 }}>Sin movimientos en las últimas horas.</p>}
            {eventos.slice(0, 8).map((e) => {
              const cuerpo = (
                <>
                  <Avatar avatar={e.avatar} nombre={e.nombre} t={32} />
                  <span>{e.titulo}{e.detalle && <small>{e.detalle}</small>}</span>
                  <span className="t">{hace(e.t)}</span>
                </>
              );
              const clase = `n ${nuevos.has(e.id) ? "nueva" : ""}`;
              return e.href ? <Link key={e.id} href={e.href} className={clase}>{cuerpo}</Link> : <div key={e.id} className={clase}>{cuerpo}</div>;
            })}
          </div>
          <div style={{ padding: "8px 14px 12px", borderTop: "1px solid var(--line)" }}>
            <Link href={verTodo} className="enlace">Ver todo el historial</Link>
          </div>
        </>
      )}
    </aside>
  );
}
