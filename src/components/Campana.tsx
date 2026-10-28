"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { guardarVistos, hace, leerVistos, useVivo } from "./useVivo";

/** Campana con los avisos recientes y cuántos no se han visto. */
export function Campana({ verTodo }: { verTodo: string }) {
  const { eventos, solicitudes } = useVivo();
  const [abierta, setAbierta] = useState(false);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
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

  const sinVer = eventos.filter((e) => !vistos.has(e.id)).length + solicitudes.length;
  const abrir = () => {
    setAbierta((a) => !a);
    const todos = new Set([...vistos, ...eventos.map((e) => e.id)]);
    setVistos(todos);
    guardarVistos(todos);
  };
  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button type="button" className="icb campana" onClick={abrir} aria-label={`Avisos${sinVer ? `, ${sinVer} sin ver` : ""}`} aria-expanded={abierta}>
        <Icono n="campana" />
        {sinVer > 0 && <em>{sinVer > 9 ? "9+" : sinVer}</em>}
      </button>
      {abierta && (
        <div className="menu avisos" role="dialog" aria-label="Avisos">
          <div className="entre" style={{ padding: "6px 8px 8px" }}><b>Avisos</b><Link href={verTodo} className="enlace" onClick={() => setAbierta(false)}>Ver todo</Link></div>
          {solicitudes.map((s) => (
            <Link key={s.id} href={`/ajustes?restablecer=${s.usuarioId}`} className="aviso-n nuevo" onClick={() => setAbierta(false)}>
              <Avatar avatar={s.avatar} nombre={s.nombre} t={30} />
              <span><b>{s.nombre.split(" ")[0]} pide restablecer su contraseña</b><small>{hace(s.t)}</small></span>
            </Link>
          ))}
          {eventos.length === 0 && solicitudes.length === 0 && <p className="muted" style={{ padding: "8px 10px", fontSize: 13 }}>No hay avisos todavía.</p>}
          {eventos.slice(0, 8).map((e) => (
            <Link key={e.id} href={e.href ?? verTodo} className="aviso-n" onClick={() => setAbierta(false)}>
              <Avatar avatar={e.avatar} nombre={e.nombre} t={30} />
              <span><b>{e.titulo}</b><small>{e.detalle ? `${e.detalle}. ` : ""}{hace(e.t)}</small></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
