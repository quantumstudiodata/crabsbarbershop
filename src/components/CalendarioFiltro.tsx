"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lunesDe, sumarDias } from "@/lib/fechas";
import type { Periodo } from "@/lib/periodo";
import { Icono } from "./Icono";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const dd = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const finMes = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

type Seleccion = { desde: string; hasta: string } | null;

/**
 * Calendario para filtrar por fecha, igual en todas las pantallas.
 * Atajos arriba, mes y año que se cambian con flechas o tocándolos, los días y un botón Listo.
 * Un toque elige un día; un segundo toque, un rango. Sin elegir nada se ven todas las fechas (si la pantalla lo permite).
 */
export function CalendarioFiltro({ p, hoy, todas = "Todas las fechas", conTodas = true }: { p: Periodo | null; hoy: string; todas?: string; conTodas?: boolean }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"dias" | "meses" | "anios">("dias");
  const [mes, setMes] = useState((p?.desde ?? hoy).slice(0, 7));
  const [sel, setSel] = useState<Seleccion>(p ? { desde: p.desde, hasta: p.hasta } : null);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  const ir = (s: Seleccion) => {
    const n = new URLSearchParams(params.toString());
    for (const k of ["periodo", "fecha", "mes", "anio", "desde", "hasta", "pagina"]) n.delete(k);
    if (s) {
      if (s.desde === s.hasta) { n.set("periodo", "dia"); n.set("fecha", s.desde); }
      else if (s.desde.slice(8) === "01" && s.hasta === finMes(s.desde.slice(0, 7))) { n.set("periodo", "mes"); n.set("mes", s.desde.slice(0, 7)); }
      else if (s.desde.slice(5) === "01-01" && s.hasta.slice(5) === "12-31" && s.desde.slice(0, 4) === s.hasta.slice(0, 4)) { n.set("periodo", "anio"); n.set("anio", s.desde.slice(0, 4)); }
      else { n.set("desde", s.desde); n.set("hasta", s.hasta); }
    }
    setAbierto(false);
    const t = n.toString();
    router.push(t ? `${ruta}?${t}` : ruta, { scroll: false });
  };
  const tocarDia = (f: string) => {
    if (f > hoy) return;
    if (!sel || sel.desde !== sel.hasta) setSel({ desde: f, hasta: f });
    else setSel(f < sel.desde ? { desde: f, hasta: sel.desde } : { desde: sel.desde, hasta: f });
  };
  const atajos: [string, Seleccion][] = [
    ["Hoy", { desde: hoy, hasta: hoy }],
    ["Esta semana", { desde: lunesDe(hoy), hasta: hoy }],
    ["Este mes", { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }],
    ["Este año", { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }],
  ];
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const huecos = (primero + 6) % 7;
  const dias = Number(finMes(mes).slice(8));
  const moverMes = (d: number) => { const t = new Date(Date.UTC(y, m - 1 + d, 1)); const nuevo = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; if (nuevo <= hoy.slice(0, 7)) setMes(nuevo); };
  const texto = sel ? (sel.desde === sel.hasta ? dd(sel.desde) : `${dd(sel.desde)} a ${dd(sel.hasta)}`) : todas;
  const anios = Array.from({ length: 6 }, (_, i) => Number(hoy.slice(0, 4)) - i);

  return (
    <div className="cal-f" ref={caja}>
      <button type="button" className={`campo-f ${p ? "con" : ""}`} aria-haspopup="dialog" aria-expanded={abierto} onClick={() => { setAbierto((a) => !a); setVista("dias"); }}>
        <Icono n="calendario" /><span>{p ? p.etiqueta : todas}</span><Icono n="abajo" />
      </button>
      {/* En el teléfono el calendario es una ventana: el fondo se pone borroso y solo destaca el calendario. */}
      {abierto && <div className="velo-cal" onClick={() => setAbierto(false)} aria-hidden="true" />}
      {abierto && (
        <div className="pop-cal" role="dialog" aria-label="Elegir fechas">
          <div className="atajos-cal">
            {conTodas && <button type="button" className={!sel ? "on" : ""} onClick={() => setSel(null)}>Todas</button>}
            {atajos.map(([t, s]) => <button type="button" key={t} className={sel && s && sel.desde === s.desde && sel.hasta === s.hasta ? "on" : ""} onClick={() => { setSel(s); if (s) setMes(s.hasta.slice(0, 7)); }}>{t}</button>)}
          </div>
          <div className="mes-cal">
            <button type="button" className="icb" aria-label="Mes anterior" onClick={() => moverMes(-1)}><Icono n="izquierda" /></button>
            <button type="button" className={`sel-cal ${vista === "meses" ? "on" : ""}`} onClick={() => setVista(vista === "meses" ? "dias" : "meses")}>{MESES[m - 1]}<Icono n="abajo" /></button>
            <button type="button" className={`sel-cal ${vista === "anios" ? "on" : ""}`} onClick={() => setVista(vista === "anios" ? "dias" : "anios")}>{y}<Icono n="abajo" /></button>
            <button type="button" className="icb" aria-label="Mes siguiente" onClick={() => moverMes(1)} disabled={mes >= hoy.slice(0, 7)}><Icono n="derecha" /></button>
          </div>
          {vista === "meses" && (
            <div className="meses-cal">
              {CORTOS.map((c, i) => {
                const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
                const futuro = ym > hoy.slice(0, 7);
                return <button type="button" key={c} disabled={futuro} className={sel && sel.desde === `${ym}-01` && sel.hasta >= `${ym}-28` ? "on" : ""}
                  onClick={() => { setMes(ym); setSel({ desde: `${ym}-01`, hasta: ym === hoy.slice(0, 7) ? hoy : finMes(ym) }); setVista("dias"); }}>{c}</button>;
              })}
              <button type="button" className="todo-anio" onClick={() => { setSel({ desde: `${y}-01-01`, hasta: String(y) === hoy.slice(0, 4) ? hoy : `${y}-12-31` }); setVista("dias"); }}>Todo {y}</button>
            </div>
          )}
          {vista === "anios" && (
            <div className="meses-cal">{anios.map((a) => <button type="button" key={a} className={a === y ? "on" : ""} onClick={() => { setMes(`${a}-${a === Number(hoy.slice(0, 4)) ? hoy.slice(5, 7) : "12"}`); setVista("meses"); }}>{a}</button>)}</div>
          )}
          {vista === "dias" && (
            <div className="dias-cal">
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i} className="h">{d}</span>)}
              {Array.from({ length: huecos }, (_, i) => <span key={`h${i}`} />)}
              {Array.from({ length: dias }, (_, i) => {
                const f = `${mes}-${String(i + 1).padStart(2, "0")}`;
                const en = sel && f >= sel.desde && f <= sel.hasta;
                const borde = sel && (f === sel.desde || f === sel.hasta);
                return <button type="button" key={f} disabled={f > hoy} className={`${en ? "en" : ""} ${borde ? "borde" : ""} ${f === hoy ? "hoy" : ""}`} onClick={() => tocarDia(f)}>{i + 1}</button>;
              })}
            </div>
          )}
          <div className="pie-cal"><span className="muted">{texto}</span><button type="button" className="bt chico" onClick={() => ir(sel)}>Listo</button></div>
        </div>
      )}
    </div>
  );
}

/** Para pantallas que guardan semanas o el periodo actual por defecto. */
export const semanaActual = (hoy: string) => ({ desde: lunesDe(hoy), hasta: sumarDias(lunesDe(hoy), 6) });
