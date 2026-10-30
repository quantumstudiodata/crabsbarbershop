"use client";

import { useEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const D = ["L", "M", "M", "J", "V", "S", "D"];

const aFecha = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const aMes = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
export const fechaTexto = (f: string) => `${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}${f.slice(0, 4) === String(new Date().getFullYear()) ? "" : ` de ${f.slice(0, 4)}`}`;
export const mesTexto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Cierra la ventana al hacer clic fuera o con Escape. */
function useVentana() {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  return { abierto, setAbierto, caja };
}

/** Un solo día. */
export function Calendario({ fecha, hoy, elegir, activo = true }: { fecha: string; hoy: string; elegir: (f: string) => void; activo?: boolean }) {
  const { abierto, setAbierto, caja } = useVentana();
  const [mes, setMes] = useState(() => ({ y: Number(fecha.slice(0, 4)), m: Number(fecha.slice(5, 7)) - 1 }));
  const primero = new Date(Date.UTC(mes.y, mes.m, 1)).getUTCDay();
  const vacios = (primero + 6) % 7;
  const diasMes = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate();
  const mesAnt = mes.m === 0 ? { y: mes.y - 1, m: 11 } : { y: mes.y, m: mes.m - 1 };
  const mesSig = mes.m === 11 ? { y: mes.y + 1, m: 0 } : { y: mes.y, m: mes.m + 1 };
  return (
    <div style={{ position: "relative" }} ref={caja}>
      <button type="button" className={`chipf ${activo ? "on-suave" : ""}`} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <Icono n="calendario" />{activo ? fechaTexto(fecha) : "Elegir día"}
      </button>
      {abierto && (
        <div className="calendario" role="dialog" aria-label="Elegir día">
          <div className="entre">
            <button type="button" className="icb" onClick={() => setMes(mesAnt)} aria-label="Mes anterior"><Icono n="izquierda" /></button>
            <b style={{ textTransform: "capitalize" }}>{MESES[mes.m]} {mes.y}</b>
            <button type="button" className="icb" onClick={() => setMes(mesSig)} aria-label="Mes siguiente" disabled={aFecha(mesSig.y, mesSig.m, 1) > hoy}><Icono n="derecha" /></button>
          </div>
          <div className="rejilla">
            {D.map((d, i) => <span className="d" key={i}>{d}</span>)}
            {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: diasMes }, (_, i) => {
              const f = aFecha(mes.y, mes.m, i + 1);
              return (
                <button type="button" key={f} className={[activo && f === fecha ? "ext" : "", f === hoy ? "hoy" : ""].join(" ")} disabled={f > hoy} onClick={() => { elegir(f); setAbierto(false); }} aria-label={fechaTexto(f)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button type="button" className="enlace" style={{ justifySelf: "start" }} onClick={() => { elegir(hoy); setAbierto(false); }}>Ir a hoy</button>
        </div>
      )}
    </div>
  );
}

/** Botón pequeño con un menú que se abre por debajo. */
function Desplegable({ texto, activo, children }: { texto: string; activo: boolean; children: (cerrar: () => void) => React.ReactNode }) {
  const { abierto, setAbierto, caja } = useVentana();
  return (
    <div style={{ position: "relative" }} ref={caja}>
      <button type="button" className={`bp ${activo ? "on" : ""}`} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        {texto}<Icono n="abajo" className={`ic flecha-bp ${abierto ? "girada" : ""}`} />
      </button>
      {abierto && <div className="calendario menu-p" role="dialog">{children(() => setAbierto(false))}</div>}
    </div>
  );
}

/** Mes: se abre por debajo una cuadrícula con los meses y flechas para cambiar de año. */
export function MenuMes({ mes, activo, hoy, elegir }: { mes: string; activo: boolean; hoy: string; elegir: (ym: string) => void }) {
  const [anio, setAnio] = useState(Number(mes.slice(0, 4)));
  const tope = hoy.slice(0, 7);
  return (
    <Desplegable texto={activo ? mesTexto(mes) : "Mes"} activo={activo}>
      {(cerrar) => (
        <>
          <div className="entre">
            <button type="button" className="icb" onClick={() => setAnio(anio - 1)} aria-label="Año anterior"><Icono n="izquierda" /></button>
            <b>{anio}</b>
            <button type="button" className="icb" onClick={() => setAnio(anio + 1)} aria-label="Año siguiente" disabled={anio + 1 > Number(hoy.slice(0, 4))}><Icono n="derecha" /></button>
          </div>
          <div className="rejilla-m">
            {MESES.map((t, i) => {
              const k = aMes(anio, i);
              return <button type="button" key={k} className={activo && k === mes ? "ext" : k === tope ? "hoy" : ""} disabled={k > tope} onClick={() => { elegir(k); cerrar(); }}>{t.slice(0, 3)}</button>;
            })}
          </div>
        </>
      )}
    </Desplegable>
  );
}

/** Año: se abre por debajo la lista de años. */
export function MenuAnio({ anio, activo, hoy, elegir, desde = 2023 }: { anio: string; activo: boolean; hoy: string; elegir: (y: string) => void; desde?: number }) {
  const ultimo = Number(hoy.slice(0, 4));
  const anios = Array.from({ length: Math.max(1, ultimo - desde + 1) }, (_, i) => String(ultimo - i));
  return (
    <Desplegable texto={activo ? anio : "Año"} activo={activo}>
      {(cerrar) => (
        <div className="lista-anios">
          {anios.map((y) => <button type="button" key={y} className={activo && y === anio ? "ext" : ""} onClick={() => { elegir(y); cerrar(); }}>{y}</button>)}
        </div>
      )}
    </Desplegable>
  );
}
