"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icono } from "./Icono";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const D = ["L", "M", "M", "J", "V", "S", "D"];

const aFecha = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const corta = (f: string) => `${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
const lunes = (f: string) => { const dia = new Date(`${f}T12:00:00Z`).getUTCDay(); return sumar(f, dia === 0 ? -6 : 1 - dia); };

/** Elige un rango de fechas y lo pone en la dirección (?desde=&hasta=). */
export function Calendario({ desde, hasta, hoy }: { desde: string; hasta: string; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => { const f = hasta > hoy ? hoy : hasta; return { y: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1 }; });
  const [inicio, setInicio] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const aplicar = (a: string, b: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("desde", a <= b ? a : b);
    q.set("hasta", a <= b ? b : a);
    q.delete("periodo");
    q.delete("pagina");
    router.push(`${ruta}?${q.toString()}`);
    setAbierto(false);
    setInicio(null);
  };
  const tocar = (f: string) => {
    if (!inicio) setInicio(f);
    else aplicar(inicio, f);
  };

  const primero = new Date(Date.UTC(mes.y, mes.m, 1)).getUTCDay();
  const vacios = (primero + 6) % 7;
  const diasMes = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate();
  const a = inicio ?? desde;
  const b = inicio ? sobre ?? inicio : hasta;
  const [r1, r2] = a <= b ? [a, b] : [b, a];
  const mesAnt = mes.m === 0 ? { y: mes.y - 1, m: 11 } : { y: mes.y, m: mes.m - 1 };
  const mesSig = mes.m === 11 ? { y: mes.y + 1, m: 0 } : { y: mes.y, m: mes.m + 1 };
  const finMesPasado = sumar(`${hoy.slice(0, 8)}01`, -1);

  return (
    <div style={{ position: "relative" }} ref={caja}>
      <button type="button" className="chipf" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <Icono n="calendario" />
        {desde === hasta ? corta(desde) : `${corta(desde)} al ${corta(hasta)}`}
      </button>
      {abierto && (
        <div className="calendario" role="dialog" aria-label="Elegir fechas">
          <div className="atajos">
            <button type="button" onClick={() => aplicar(hoy, hoy)}>Hoy</button>
            <button type="button" onClick={() => aplicar(lunes(hoy), hoy)}>Esta semana</button>
            <button type="button" onClick={() => aplicar(`${hoy.slice(0, 8)}01`, hoy)}>Este mes</button>
            <button type="button" onClick={() => aplicar(`${finMesPasado.slice(0, 8)}01`, finMesPasado)}>Mes pasado</button>
          </div>
          <div className="entre">
            <button type="button" className="icb" onClick={() => setMes(mesAnt)} aria-label="Mes anterior"><Icono n="izquierda" /></button>
            <b style={{ textTransform: "capitalize" }}>{MESES[mes.m]} {mes.y}</b>
            <button type="button" className="icb" onClick={() => setMes(mesSig)} aria-label="Mes siguiente" disabled={aFecha(mesSig.y, mesSig.m, 1) > hoy}><Icono n="derecha" /></button>
          </div>
          <div className="rejilla" onMouseLeave={() => setSobre(null)}>
            {D.map((d, i) => <span className="d" key={i}>{d}</span>)}
            {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: diasMes }, (_, i) => {
              const f = aFecha(mes.y, mes.m, i + 1);
              const ext = f === r1 || f === r2;
              const clase = [ext ? "ext" : f > r1 && f < r2 ? "rango" : "", f === hoy ? "hoy" : ""].join(" ");
              return (
                <button type="button" key={f} className={clase} disabled={f > hoy} onClick={() => tocar(f)} onMouseEnter={() => setSobre(f)} aria-label={corta(f)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          {inicio && <small className="muted">Ahora el último día.</small>}
        </div>
      )}
    </div>
  );
}
