"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { hace, useVivo } from "./useVivo";

const SEGUNDOS = 9;

/**
 * Actividad en vivo. Lo nuevo aparece como fantasma en la esquina y se desvanece solo,
 * para no tapar la pantalla. Tocando "En vivo" se deja fija la lista.
 */
export function VentanaVivo() {
  const { eventos, solicitudes, nuevos } = useVivo();
  const ruta = usePathname();
  const [fijo, setFijo] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primera = useRef(true);

  const asomar = () => {
    setMostrar(true);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setMostrar(false), SEGUNDOS * 1000);
  };

  useEffect(() => {
    try { setFijo(sessionStorage.getItem("crabs-vivo-fijo") === "si"); } catch {}
  }, []);
  // Al entrar se asoma lo reciente; después, solo cuando llega algo nuevo.
  useEffect(() => {
    if (ruta.startsWith("/cobrar")) return;
    if (primera.current && eventos.length) { primera.current = false; asomar(); }
    else if (nuevos.size) asomar();
  }, [eventos, nuevos, ruta]);
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const alternar = () => {
    const v = !fijo;
    setFijo(v);
    setMostrar(false);
    try { sessionStorage.setItem("crabs-vivo-fijo", v ? "si" : "no"); } catch {}
  };
  const abierto = fijo || mostrar || solicitudes.length > 0;
  const visibles = eventos.slice(0, fijo ? 6 : 3);

  return (
    <aside className="vivo-pila" aria-label="Actividad en vivo" aria-live="polite">
      <button type="button" className="vivo-h" onClick={alternar} aria-pressed={fijo} title={fijo ? "Ocultar la lista" : "Dejar la lista a la vista"}>
        <span className="vivo"><b>En vivo</b></span>
        {!abierto && eventos.length > 0 && <span className="contador-n">{eventos.length}</span>}
        <Icono n={fijo ? "minimizar" : "arriba"} />
      </button>
      {abierto && (
        <div className={`vivo-tarjetas ${!fijo && mostrar ? "se-va" : ""}`} style={{ animationDuration: `${SEGUNDOS}s` }}>
          {solicitudes.map((s) => (
            <div key={s.id} className="vivo-t urgente">
              <Avatar avatar={s.avatar} nombre={s.nombre} t={32} />
              <span><b>{s.nombre.split(" ")[0]} pide restablecer su contraseña</b><small>{hace(s.t)}</small></span>
              <Link className="icb" href={`/ajustes?restablecer=${s.usuarioId}`} aria-label="Restablecer" title="Restablecer"><Icono n="llave" /></Link>
            </div>
          ))}
          {(fijo || mostrar) && visibles.length === 0 && solicitudes.length === 0 && <div className="vivo-t tenue"><span /><span><small>Sin movimientos en las últimas horas.</small></span></div>}
          {(fijo || mostrar) && visibles.map((e, i) => {
            const cuerpo = (
              <>
                <Avatar avatar={e.avatar} nombre={e.nombre} t={32} />
                <span><b>{e.titulo}</b>{e.detalle && <small>{e.detalle}</small>}</span>
                <span className="t">{hace(e.t)}</span>
              </>
            );
            const clase = `vivo-t ${nuevos.has(e.id) ? "nuevo" : ""}`;
            const estilo = { animationDelay: `${i * 0.12}s` };
            return e.href
              ? <Link key={e.id} href={e.href} className={clase} style={estilo}>{cuerpo}</Link>
              : <div key={e.id} className={clase} style={estilo}>{cuerpo}</div>;
          })}
        </div>
      )}
    </aside>
  );
}
