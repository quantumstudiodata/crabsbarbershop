"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !(t instanceof Element && t.closest("[data-flotante]"))) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  return { abierto, setAbierto, caja };
}

/**
 * Ventana que flota sobre todo, pegada a su botón. Así no la recorta ni le agrega barras
 * una ventana emergente o un panel con desplazamiento.
 */
function Flotante({ ancla, className, children, label }: { ancla: React.RefObject<HTMLDivElement | null>; className: string; children: React.ReactNode; label?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = ancla.current?.getBoundingClientRect();
    if (!r) return;
    const alto = ref.current?.offsetHeight ?? 360, ancho = ref.current?.offsetWidth ?? 310;
    const limite = window.innerHeight - (window.matchMedia("(max-width: 760px)").matches && !document.querySelector(".capa") ? 100 : 0);
    const arriba = r.bottom + 8 + alto > limite && r.top - 8 - alto > 0;
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)), y: arriba ? r.top - 8 - alto : r.bottom + 8, arriba });
  }, [ancla]);
  return createPortal(
    <div ref={ref} data-flotante className={`${className} flotante`} role="dialog" aria-label={label} style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0 }}>{children}</div>,
    document.body,
  );
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
        <Flotante ancla={caja} className="calendario" label="Elegir día">
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
        </Flotante>
      )}
    </div>
  );
}

/** Botón pequeño con un menú que se abre por debajo. */
function Desplegable({ texto, activo, icono, children }: { texto: string; activo: boolean; icono?: string; children: (cerrar: () => void) => React.ReactNode }) {
  const { abierto, setAbierto, caja } = useVentana();
  return (
    <div style={{ position: "relative" }} ref={caja}>
      <button type="button" className={`bp ${activo ? "on" : ""}`} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        {icono ? <><Icono n={icono} /><span className="txt-bp">{texto}</span></> : texto}<Icono n="abajo" className={`ic flecha-bp ${abierto ? "girada" : ""}`} />
      </button>
      {abierto && <Flotante ancla={caja} className="calendario menu-p">{children(() => setAbierto(false))}</Flotante>}
    </div>
  );
}

/** Mes: se abre por debajo una cuadrícula con los meses y flechas para cambiar de año. */
export function MenuMes({ mes, activo, hoy, elegir, conDatos, icono }: { mes: string; activo: boolean; hoy: string; elegir: (ym: string) => void; conDatos?: string[]; icono?: string }) {
  const [anio, setAnio] = useState(Number(mes.slice(0, 4)));
  const tope = hoy.slice(0, 7);
  return (
    <Desplegable texto={activo ? mesTexto(mes) : "Mes"} activo={activo} icono={icono}>
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
              const vacio = !!conDatos && !conDatos.includes(k);
              return <button type="button" key={k} className={`${activo && k === mes ? "ext" : k === tope ? "hoy" : ""} ${vacio ? "vacio" : ""}`} disabled={k > tope || vacio} title={vacio ? "Sin información" : undefined} onClick={() => { elegir(k); cerrar(); }}>{t.slice(0, 3)}</button>;
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

const hora12 = (hm: string) => {
  if (!/^\d{2}:\d{2}$/.test(hm)) return "";
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
};

/**
 * Campo de fecha con el diseño de la página (en lugar del calendario del navegador).
 * Con `vacio` se puede dejar sin fecha. Con `name`, manda el valor en el formulario.
 */
export function CampoFecha({ valor, cambiar, min, max, vacio, name, etiqueta = "Fecha" }: {
  valor: string; cambiar?: (f: string) => void; min?: string; max?: string; vacio?: string; name?: string; etiqueta?: string;
}) {
  const { abierto, setAbierto, caja } = useVentana();
  const [interno, setInterno] = useState(valor);
  const actual = cambiar ? valor : interno;
  const base = actual || min || new Date().toISOString().slice(0, 10);
  const [mes, setMes] = useState(() => ({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }));
  const poner = (f: string) => { if (cambiar) cambiar(f); else setInterno(f); setAbierto(false); };
  const primero = new Date(Date.UTC(mes.y, mes.m, 1)).getUTCDay();
  const vacios = (primero + 6) % 7;
  const diasMes = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate();
  const mesAnt = mes.m === 0 ? { y: mes.y - 1, m: 11 } : { y: mes.y, m: mes.m - 1 };
  const mesSig = mes.m === 11 ? { y: mes.y + 1, m: 0 } : { y: mes.y, m: mes.m + 1 };
  const fuera = (f: string) => (!!min && f < min) || (!!max && f > max);
  return (
    <div className="cf-campo" ref={caja}>
      {name && <input type="hidden" name={name} value={actual} />}
      <button type="button" className={`input campo-f-b ${actual ? "" : "vacio"}`} aria-label={etiqueta} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <Icono n="calendario" /><span>{actual ? fechaTexto(actual) : vacio ?? "Elegir fecha"}</span>
      </button>
      {abierto && (
        <Flotante ancla={caja} className="calendario" label={etiqueta}>
          <div className="entre">
            <button type="button" className="icb" onClick={() => setMes(mesAnt)} aria-label="Mes anterior" disabled={!!min && aFecha(mesAnt.y, mesAnt.m, new Date(Date.UTC(mesAnt.y, mesAnt.m + 1, 0)).getUTCDate()) < min}><Icono n="izquierda" /></button>
            <b style={{ textTransform: "capitalize" }}>{MESES[mes.m]} {mes.y}</b>
            <button type="button" className="icb" onClick={() => setMes(mesSig)} aria-label="Mes siguiente" disabled={!!max && aFecha(mesSig.y, mesSig.m, 1) > max}><Icono n="derecha" /></button>
          </div>
          <div className="rejilla">
            {D.map((d, i) => <span className="d" key={i}>{d}</span>)}
            {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: diasMes }, (_, i) => {
              const f = aFecha(mes.y, mes.m, i + 1);
              return <button type="button" key={f} className={f === actual ? "ext" : ""} disabled={fuera(f)} onClick={() => poner(f)} aria-label={fechaTexto(f)}>{i + 1}</button>;
            })}
          </div>
          {vacio !== undefined && actual && <button type="button" className="enlace" style={{ justifySelf: "start" }} onClick={() => poner("")}>{vacio}</button>}
        </Flotante>
      )}
    </div>
  );
}

/** Campo de hora con el diseño de la página: una lista de horas que flota bajo el campo. */
export function CampoHora({ valor, cambiar, paso = 15, desde = "06:00", hasta = "23:45", etiqueta = "Hora" }: {
  valor: string; cambiar: (h: string) => void; paso?: number; desde?: string; hasta?: string; etiqueta?: string;
}) {
  const { abierto, setAbierto, caja } = useVentana();
  const lista = useRef<HTMLDivElement>(null);
  const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const horas: string[] = [];
  for (let m = aMin(desde); m <= aMin(hasta); m += paso) horas.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (valor && !horas.includes(valor)) horas.push(valor), horas.sort();
  useEffect(() => { if (abierto) lista.current?.querySelector(".ext")?.scrollIntoView({ block: "center" }); }, [abierto]);
  return (
    <div className="cf-campo" ref={caja}>
      <button type="button" className="input campo-f-b" aria-label={etiqueta} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <span>{hora12(valor) || "Elegir"}</span>
      </button>
      {abierto && (
        <Flotante ancla={caja} className="calendario lista-horas" label={etiqueta}>
          <div ref={lista} className="lh-c">
            {horas.map((h) => <button type="button" key={h} className={h === valor ? "ext" : ""} onClick={() => { cambiar(h); setAbierto(false); }}>{hora12(h)}</button>)}
          </div>
        </Flotante>
      )}
    </div>
  );
}
