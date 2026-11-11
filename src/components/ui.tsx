"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { Icono } from "./Icono";

/** Ventana emergente. Se cierra con Esc o tocando fuera. */
// Cuándo se cerró la última ventana: si otra se abre enseguida, el fondo no vuelve a aparecer y la ventana entra con un cambio suave.
let ultimoCierre = 0;

export function Modal({ abierto, cerrar, etiqueta, titulo, ancho, sinX, children }: {
  abierto: boolean; cerrar: () => void; etiqueta?: string; titulo: React.ReactNode; ancho?: boolean; sinX?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const alCerrar = useRef(cerrar);
  alCerrar.current = cerrar;
  const id = useId();
  // El portal solo existe en el navegador; esperar a montar evita diferencias con lo que manda el servidor.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!abierto || !montado) return;
    const previo = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); alCerrar.current(); } };
    document.addEventListener("keydown", tecla);
    // En el teléfono no se enfoca un campo de texto al abrir: así no aparece el teclado hasta que la persona toca el campo.
    const tactil = window.matchMedia("(pointer: coarse)").matches;
    const foco = ref.current?.querySelector<HTMLElement>(tactil ? "button:not(.cerrar-x), [role=radio], a" : "[autofocus], input:not([type=hidden]), button:not(.cerrar-x)");
    if (tactil) {
      const a = document.activeElement as HTMLElement | null;
      if (a && ref.current?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
      ref.current?.focus({ preventScroll: true });
    } else foco?.focus();
    return () => { document.removeEventListener("keydown", tecla); previo?.focus?.(); };
  }, [abierto, montado]);
  const [encadenada, setEncadenada] = useState(false);
  useLayoutEffect(() => {
    if (!abierto) return;
    setEncadenada(Date.now() - ultimoCierre < 350);
    return () => { ultimoCierre = Date.now(); };
  }, [abierto]);
  if (!abierto || !montado) return null;
  return createPortal(
    <div className={`capa ${encadenada ? "encadenada" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={ref} tabIndex={-1} className={`modal ${ancho ? "ancho" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-h">
          <div>
            {etiqueta && <span className="lab">{etiqueta}</span>}
            <h2 className="titulo" id={id}>{titulo}</h2>
          </div>
          {!sinX && <button type="button" className="icb cerrar-x" onClick={cerrar} aria-label="Cerrar"><Icono n="cerrar" /></button>}
        </div>
        <div className="modal-c">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Envía un formulario a su acción sin el reinicio automático de React: los interruptores y lo escrito
 * se quedan como el usuario los dejó (por ejemplo, si el servidor responde con un error).
 */
export const sinReinicio = (accion: (d: FormData) => void) => (x: React.FormEvent<HTMLFormElement>) => {
  x.preventDefault();
  const datos = new FormData(x.currentTarget, (x.nativeEvent as SubmitEvent).submitter);
  startTransition(() => accion(datos));
};

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

/** Lista desplegable propia (no la del navegador). La lista flota para que ninguna ventana la corte. */
export function Selector({ name, opciones, valor, inicial, onChange, etiqueta, className }: {
  name?: string; opciones: Opcion[]; valor?: string; inicial?: string; onChange?: (v: string) => void; etiqueta: string; className?: string;
}) {
  const [interno, setInterno] = useState(inicial ?? opciones[0]?.valor ?? "");
  const actual = valor ?? interno;
  const [pos, setPos] = useState<{ x: number; y: number; w: number; arriba: boolean } | null>(null);
  const [activo, setActivo] = useState(0);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const elegido = opciones.find((o) => o.valor === actual);
  const id = useId();
  const abierto = pos !== null;

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    // En el teléfono se descuenta la barra de abajo para que la lista no quede debajo de ella.
    const alto = window.innerHeight - (window.matchMedia("(max-width: 760px)").matches && !document.querySelector(".capa") ? 100 : 0);
    const arriba = alto - r.bottom < Math.min(300, opciones.length * 44 + 20) && r.top > alto - r.bottom;
    // La lista nunca se sale de la pantalla: si no cabe a la derecha, se recorre hacia la izquierda.
    const ancho = Math.min(Math.max(r.width, 200), window.innerWidth - 16);
    const x = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    setPos({ x, y: arriba ? r.top - 6 : r.bottom + 6, w: ancho, arriba });
    setActivo(Math.max(0, opciones.findIndex((o) => o.valor === actual)));
  };
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!lista.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setPos(null); };
    const cerrar = () => setPos(null);
    // Desplazarse dentro de la lista no la cierra; desplazar la página sí, porque la lista se quedaría flotando.
    const alDesplazar = (e: Event) => { if (!lista.current?.contains(e.target as Node)) setPos(null); };
    document.addEventListener("mousedown", fuera);
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", alDesplazar, true);
    return () => { document.removeEventListener("mousedown", fuera); window.removeEventListener("resize", cerrar); window.removeEventListener("scroll", alDesplazar, true); };
  }, [abierto]);

  const elegir = (v: string) => { setInterno(v); onChange?.(v); setPos(null); boton.current?.focus(); };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) { abrir(); return; }
      setActivo((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
    } else if ((e.key === "Enter" || e.key === " ") && abierto) {
      e.preventDefault(); e.stopPropagation(); elegir(opciones[activo].valor);
    } else if (e.key === "Escape" && abierto) {
      e.stopPropagation(); setPos(null);
    }
  };

  return (
    <div className={`selector ${className ?? ""}`}>
      {name && <input type="hidden" name={name} value={actual} />}
      <button ref={boton} type="button" className="input" aria-haspopup="listbox" aria-expanded={abierto} aria-label={etiqueta} aria-controls={id}
        onClick={() => (abierto ? setPos(null) : abrir())} onKeyDown={tecla}>
        <span className="fila" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>{elegido?.icono}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{elegido?.texto ?? "Elegir"}</span></span>
        <Icono n="abajo" />
      </button>
      {pos && createPortal(
        <div ref={lista} className="desplegable" role="listbox" id={id} aria-label={etiqueta}
          style={{ left: pos.x, top: pos.y, width: pos.w, transform: pos.arriba ? "translateY(-100%)" : undefined }}>
          {opciones.map((o, i) => (
            <button type="button" key={o.valor} role="option" aria-selected={o.valor === actual} className={`op ${i === activo ? "activo" : ""}`}
              onMouseEnter={() => setActivo(i)} onClick={() => elegir(o.valor)}>
              <span className="fila" style={{ gap: 10 }}>{o.icono}<span><b style={{ fontWeight: 500 }}>{o.texto}</b>{o.detalle && <small style={{ display: "block" }}>{o.detalle}</small>}</span></span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Número que sube desde cero al aparecer y, si cambia (por ejemplo, entra una venta), pasa suave del valor anterior al nuevo. */
export function Cuenta({ valor, formato = "dinero", duracion = 1100 }: { valor: number; formato?: "dinero" | "entero"; duracion?: number }) {
  const [v, setV] = useState(0);
  const previo = useRef(0);
  useEffect(() => {
    const desde = previo.current;
    previo.current = valor;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(valor); return; }
    let raf = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min((t - inicio) / duracion, 1);
      setV(desde + (valor - desde) * (1 - Math.pow(1 - p, 3)));
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
