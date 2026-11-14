"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { hace, useVivo } from "./useVivo";

const SEGUNDOS = 5;
const CLAVE_VISTO = "crabs-vivo-visto";

/**
 * Actividad en vivo. Solo lo nuevo se asoma, de uno en uno, y se va solo a los 5 segundos.
 * Lo que ya se vio no vuelve a salir al cambiar de página. Las alertas (como el corte pendiente,
 * que ya tiene su aviso en Inicio) y las solicitudes se ven al abrir la lista con "En vivo".
 */
export function VentanaVivo() {
  const { eventos, solicitudes, alertas, nuevos } = useVivo();
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
  // Solo se asoma lo que todavía no se ha visto en esta sesión, aunque se recargue la página.
  useEffect(() => {
    if (ruta.startsWith("/cobrar") || !eventos.length) return;
    let visto = "";
    try { visto = sessionStorage.getItem(CLAVE_VISTO) ?? ""; } catch {}
    const ultimo = eventos[0].t;
    if (primera.current) { primera.current = false; if (!visto) { try { sessionStorage.setItem(CLAVE_VISTO, ultimo); } catch {} return; } }
    if (ultimo > visto || nuevos.size) {
      try { sessionStorage.setItem(CLAVE_VISTO, ultimo); } catch {}
      asomar();
    }
  }, [eventos, nuevos, ruta]);
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  const alternar = () => {
    const v = !fijo;
    setFijo(v);
    setMostrar(false);
    try { sessionStorage.setItem("crabs-vivo-fijo", v ? "si" : "no"); } catch {}
  };
  const abierto = fijo || mostrar;
  const visibles = eventos.slice(0, fijo ? 6 : 1);
  const urgentes = alertas.length + solicitudes.length;

  return (
    <aside className="vivo-pila" aria-label="Actividad en vivo" aria-live="polite">
      <button type="button" className="vivo-h" onClick={alternar} aria-pressed={fijo} title={fijo ? "Ocultar la lista" : "Dejar la lista a la vista"}>
        <span className="vivo"><b>En vivo</b></span>
        {!fijo && urgentes > 0 && <span className="contador-n">{urgentes}</span>}
        <Icono n={fijo ? "minimizar" : "arriba"} />
      </button>
      {abierto && (
        <div className={`vivo-tarjetas ${!fijo && mostrar ? "se-va" : ""}`} style={{ animationDuration: `${SEGUNDOS}s` }}>
          {fijo && alertas.map((a) => (
            <Link key={a.id} href={a.href} className="vivo-t urgente alerta">
              <span className="icono-alerta"><Icono n="reloj" /></span>
              <span><b>{a.titulo}</b><small>{a.detalle}</small></span>
              <span />
            </Link>
          ))}
          {fijo && solicitudes.map((s) => (
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
