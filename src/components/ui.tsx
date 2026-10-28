"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "./Icono";

/** Ventana emergente. Se cierra con Esc o tocando fuera. */
export function Modal({ abierto, cerrar, etiqueta, titulo, ancho, children }: {
  abierto: boolean; cerrar: () => void; etiqueta?: string; titulo: React.ReactNode; ancho?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", tecla);
    const foco = ref.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]), button:not(.cerrar-x)");
    foco?.focus();
    return () => { document.removeEventListener("keydown", tecla); previo?.focus?.(); };
  }, [abierto, cerrar]);
  if (!abierto || typeof document === "undefined") return null;
  return createPortal(
    <div className="capa" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={ref} className={`modal ${ancho ? "ancho" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-h">
          <div>
            {etiqueta && <span className="lab">{etiqueta}</span>}
            <h2 className="titulo" id={id}>{titulo}</h2>
          </div>
          <button type="button" className="icb cerrar-x" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Interruptor({ name, checked, defaultChecked, onChange, etiqueta, disabled, value = "si" }: {
  name?: string; checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void; etiqueta: string; disabled?: boolean; value?: string;
}) {
  return (
    <span className="sw">
      <input type="checkbox" role="switch" name={name} value={value} checked={checked} defaultChecked={defaultChecked} disabled={disabled}
        aria-label={etiqueta} onChange={(e) => onChange?.(e.target.checked)} />
      <span />
    </span>
  );
}

export type Opcion = { valor: string; texto: string; detalle?: string; icono?: React.ReactNode };

/** Lista desplegable propia (no la del navegador). */
export function Selector({ name, opciones, valor, inicial, onChange, etiqueta, className }: {
  name?: string; opciones: Opcion[]; valor?: string; inicial?: string; onChange?: (v: string) => void; etiqueta: string; className?: string;
}) {
  const [interno, setInterno] = useState(inicial ?? opciones[0]?.valor ?? "");
  const actual = valor ?? interno;
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const elegido = opciones.find((o) => o.valor === actual);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const elegir = (v: string) => { setInterno(v); onChange?.(v); setAbierto(false); };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) { setAbierto(true); setActivo(Math.max(0, opciones.findIndex((o) => o.valor === actual))); return; }
      setActivo((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
    } else if ((e.key === "Enter" || e.key === " ") && abierto) {
      e.preventDefault(); elegir(opciones[activo].valor);
    } else if (e.key === "Escape" && abierto) {
      e.stopPropagation(); setAbierto(false);
    }
  };

  return (
    <div className={`selector ${className ?? ""}`} ref={caja}>
      {name && <input type="hidden" name={name} value={actual} />}
      <button type="button" className="input" aria-haspopup="listbox" aria-expanded={abierto} aria-label={etiqueta} aria-controls={id}
        onClick={() => { setAbierto((a) => !a); setActivo(Math.max(0, opciones.findIndex((o) => o.valor === actual))); }} onKeyDown={tecla}>
        <span className="fila" style={{ gap: 10 }}>{elegido?.icono}{elegido?.texto ?? "Elegir"}</span>
        <Icono n="abajo" />
      </button>
      {abierto && (
        <div className="lista" role="listbox" id={id} aria-label={etiqueta}>
          {opciones.map((o, i) => (
            <button type="button" key={o.valor} role="option" aria-selected={o.valor === actual} className={`op ${i === activo ? "activo" : ""}`}
              onMouseEnter={() => setActivo(i)} onClick={() => elegir(o.valor)}>
              <span className="fila" style={{ gap: 10 }}>{o.icono}<span><b style={{ fontWeight: 500 }}>{o.texto}</b>{o.detalle && <small style={{ display: "block" }}>{o.detalle}</small>}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Número que sube desde cero al aparecer. */
export function Cuenta({ valor, formato = "dinero", duracion = 1100 }: { valor: number; formato?: "dinero" | "entero"; duracion?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(valor); return; }
    let raf = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min((t - inicio) / duracion, 1);
      setV(valor * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracion]);
  if (formato === "entero") return <>{Math.round(v)}</>;
  const pesos = v / 100;
  return <><small>$</small>{pesos.toLocaleString("en-US", { maximumFractionDigits: valor % 100 ? 2 : 0, minimumFractionDigits: 0 })}</>;
}

/** Paso a paso para números (más y menos). */
export function Pasos({ name, inicial, min = 0, max = 100000, paso = 1, sufijo, prefijo, etiqueta }: {
  name: string; inicial: number; min?: number; max?: number; paso?: number; sufijo?: string; prefijo?: string; etiqueta: string;
}) {
  const [v, setV] = useState(inicial);
  const fijar = (n: number) => setV(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));
  return (
    <div className="paso-n">
      <button type="button" onClick={() => fijar(v - paso)} aria-label={`Menos ${etiqueta}`}>−</button>
      <span className="fila" style={{ gap: 2, flexWrap: "nowrap" }}>
        {prefijo && <span className="muted">{prefijo}</span>}
        <input name={name} inputMode="numeric" value={v} aria-label={etiqueta} onChange={(e) => fijar(Number(e.target.value.replace(/\D/g, "")))} />
        {sufijo && <span className="muted">{sufijo}</span>}
      </span>
      <button type="button" onClick={() => fijar(v + paso)} aria-label={`Más ${etiqueta}`}>+</button>
    </div>
  );
}
