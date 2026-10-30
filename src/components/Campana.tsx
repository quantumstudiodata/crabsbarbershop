"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { guardarVistos, hace, leerVistos, useVivo } from "./useVivo";

/**
 * Notificaciones personales: lo que a cada quien le toca saber (pagos, cobros de sus servicios, cambios de precio,
 * diferencias en cortes...). El registro completo de movimientos está en Historial.
 */
export function Campana() {
  const { avisos, solicitudes, alertas } = useVivo();
  const [abierta, setAbierta] = useState(false);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [resaltar, setResaltar] = useState<Set<string>>(new Set());
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => setVistos(leerVistos()), []);
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierta(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierta(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierta]);

  const sinVer = avisos.filter((e) => !vistos.has(e.id)).length + solicitudes.length + alertas.length;
  const abrir = () => {
    if (!abierta) {
      // Las nuevas se quedan resaltadas mientras está abierta; el contador se limpia.
      setResaltar(new Set(avisos.filter((e) => !vistos.has(e.id)).map((e) => e.id)));
      const todos = new Set([...vistos, ...avisos.map((e) => e.id)]);
      setVistos(todos);
      guardarVistos(todos);
    }
    setAbierta((a) => !a);
  };
  const nuevas = avisos.filter((a) => resaltar.has(a.id));
  const anteriores = avisos.filter((a) => !resaltar.has(a.id));
  const fila = (e: (typeof avisos)[number], nueva: boolean) => (
    <Link key={e.id} href={e.href} className={`aviso-n ${nueva ? "nuevo" : ""}`} onClick={() => setAbierta(false)}>
      {e.icono ? <span className="icono-aviso"><Icono n={e.icono as "caja"} /></span> : <Avatar avatar={e.avatar} nombre={e.nombre} t={34} />}
      <span><b>{e.titulo}</b><small>{e.detalle ? `${e.detalle}. ` : ""}{hace(e.t)}</small></span>
      {nueva && <i className="punto-n" aria-label="Nueva" />}
    </Link>
  );
  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button type="button" className="icb campana" onClick={abrir} aria-label={`Notificaciones${sinVer ? `, ${sinVer} sin ver` : ""}`} aria-expanded={abierta}>
        <Icono n="campana" />
        {sinVer > 0 && <em>{sinVer > 9 ? "9+" : sinVer}</em>}
      </button>
      {abierta && (
        <div className="menu avisos" role="dialog" aria-label="Notificaciones">
          <div className="entre" style={{ padding: "6px 8px 8px" }}><b style={{ fontSize: 16 }}>Notificaciones</b></div>
          {alertas.map((a) => (
            <Link key={a.id} href={a.href} className="aviso-n nuevo urgente" onClick={() => setAbierta(false)}>
              <span className="icono-alerta"><Icono n="reloj" /></span>
              <span><b>{a.titulo}</b><small>{a.detalle}</small></span>
            </Link>
          ))}
          {solicitudes.map((s) => (
            <Link key={s.id} href={`/ajustes?restablecer=${s.usuarioId}`} className="aviso-n nuevo" onClick={() => setAbierta(false)}>
              <Avatar avatar={s.avatar} nombre={s.nombre} t={34} />
              <span><b>{s.nombre.split(" ")[0]} pide restablecer su contraseña</b><small>{hace(s.t)}</small></span>
              <i className="punto-n" aria-label="Nueva" />
            </Link>
          ))}
          {avisos.length === 0 && solicitudes.length === 0 && alertas.length === 0 && (
            <div className="sin-avisos"><Icono n="campana" /><p>No tienes notificaciones.<br /><small>Aquí te avisaremos de pagos, cobros de tus servicios y cambios que te importan.</small></p></div>
          )}
          {nuevas.length > 0 && <span className="lab sec-n">Nuevas</span>}
          {nuevas.map((e) => fila(e, true))}
          {anteriores.length > 0 && nuevas.length > 0 && <span className="lab sec-n">Anteriores</span>}
          {anteriores.slice(0, 12).map((e) => fila(e, false))}
        </div>
      )}
    </div>
  );
}
