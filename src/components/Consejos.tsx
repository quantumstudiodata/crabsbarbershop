"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { marcarConsejos } from "@/app/(app)/acciones-usuario";
import { Icono } from "./Icono";

type Paso = { sel: string; t: string; x: string; icono: string };

/**
 * Recorridos por pantalla: cada paso resalta una sección y la explica. Se ven una vez por persona
 * (se guarda en su usuario, así no se repiten en otro dispositivo). Se cierran con Listo, Omitir o Esc.
 */
const RECORRIDOS: Record<string, { id: string; pasos: Paso[] }> = {
  "/": { id: "inicio", pasos: [
    { sel: ".pnd", icono: "reloj", t: "Pendientes por registrar", x: "Lo que falta hacer hoy: clientes por llegar, cobros y transferencias por revisar. Se quita solo cuando lo registras." },
    { sel: ".ini-lista, .ini-cab > :last-child", icono: "chispa", t: "Tus acciones rápidas", x: "Lo que más usas, a un toque. Con Personalizar las ordenas y ocultas las que no necesites." },
  ] },
  "/cobrar": { id: "cobrar", pasos: [
    { sel: ".cm-grupo, .categoria, .pila-chica", icono: "lista", t: "Elige los servicios", x: "Toca un servicio para agregarlo y usa + para repetirlo. El total se calcula solo." },
    { sel: ".metodos", icono: "cobro", t: "Forma de pago", x: "Efectivo, tarjeta o transferencia. Con transferencia aparecen los datos de la cuenta para compartirlos." },
  ] },
  "/citas": { id: "citas", pasos: [
    { sel: ".cal-dia, .cal-semana, .ln-linea, main section.glass", icono: "calendario", t: "Tu agenda", x: "Toca una hora libre para agendar. La línea azul marca la hora actual." },
    { sel: "button[aria-label='Nueva cita'], .ag-bt.pri", icono: "mas", t: "Nueva cita", x: "Agenda en tres pasos: servicios, cuándo y para quién. Al final mandas la confirmación por WhatsApp." },
    { sel: "button[aria-label='Compartir reservaciones'], .ag-pop-w .ag-bt", icono: "enviar", t: "Que reserven solos", x: "Comparte tu enlace o tu QR y tus clientes agendan a cualquier hora." },
  ] },
  "/analitica/finanzas": { id: "finanzas", pasos: [
    { sel: ".mov-cab .bt, button.bt.chico", icono: "archivo", t: "Registra tus gastos", x: "Cada egreso se resta en Resumen para que veas la utilidad real del día y del mes." },
  ] },
};

const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0) ?? null;

export function Consejos({ vistos }: { vistos: string[] }) {
  const ruta = usePathname();
  const rec = RECORRIDOS[ruta];
  const [hechos, setHechos] = useState(vistos);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const activo = !!rec && !hechos.includes(rec.id) && pasos.length > 0;

  // Espera a que la pantalla cargue y se quede con los pasos cuya sección sí existe.
  useEffect(() => {
    setPasos([]); setI(0); setCaja(null);
    if (!rec || hechos.includes(rec.id)) return;
    const t = setTimeout(() => setPasos(rec.pasos.filter((p) => visible(p.sel))), 1300);
    return () => clearTimeout(t);
  }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  const medir = useCallback(() => {
    const el = pasos[i] && visible(pasos[i].sel);
    if (!el) { setCaja(null); return; }
    const r = el.getBoundingClientRect();
    setCaja({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 });
  }, [pasos, i]);

  useLayoutEffect(() => {
    if (!activo) return;
    const el = visible(pasos[i].sel);
    // Deja la sección arriba, con espacio abajo para el globo.
    if (el) { const r = el.getBoundingClientRect(); const destino = window.scrollY + r.top - (r.height + 230 < window.innerHeight ? 90 : Math.max(16, window.innerHeight - r.height - 250)); window.scrollTo({ top: Math.max(destino, 0), behavior: "smooth" }); }
    const t = setTimeout(medir, 380);
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); };
  }, [activo, i, medir]); // eslint-disable-line react-hooks/exhaustive-deps

  const terminar = useCallback(() => {
    if (!rec) return;
    setSaliendo(true);
    marcarConsejos([rec.id]).catch(() => {});
    setTimeout(() => { setHechos((h) => [...h, rec.id]); setSaliendo(false); }, 260);
  }, [rec]);
  const ir = useCallback((n: number) => { if (n >= pasos.length) terminar(); else if (n >= 0) setI(n); }, [pasos.length, terminar]);

  useEffect(() => {
    if (!activo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminar();
      if (e.key === "ArrowRight" || e.key === "Enter") ir(i + 1);
      if (e.key === "ArrowLeft") ir(i - 1);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [activo, i, ir, terminar]);

  if (!activo || !caja) return null;
  const p = pasos[i];
  const alto = typeof window === "undefined" ? 800 : window.innerHeight;
  const ancho = typeof window === "undefined" ? 400 : window.innerWidth;
  const abajo = caja.y + caja.h + 200 < alto || caja.y < 220;
  const anchoG = ancho < 560 ? ancho - 24 : 340;
  const globoX = ancho < 560 ? 12 : Math.min(Math.max(caja.x, 12), ancho - anchoG - 12);
  const flechaX = Math.min(Math.max(caja.x + Math.min(caja.w / 2, 60) - globoX, 22), anchoG - 30);
  const ultimo = i === pasos.length - 1;
  return (
    <div className={`tour ${saliendo ? "sale" : ""}`} role="dialog" aria-modal="true" aria-label={`Consejo: ${p.t}`}>
      <div className="tour-fondo" onClick={terminar} />
      <div className="tour-hueco" style={{ left: caja.x, top: caja.y, width: caja.w, height: caja.h }} aria-hidden="true"><i /></div>
      <div key={i} className={`tour-globo ${abajo ? "abajo" : "arriba"}`} style={{ left: globoX, width: anchoG, top: abajo ? caja.y + caja.h + 14 : undefined, bottom: abajo ? undefined : alto - caja.y + 14, ["--fx" as string]: `${flechaX}px` }}>
        <div className="tour-cab">
          <span className="tour-i" aria-hidden="true"><Icono n={p.icono} /></span>
          <span className="tour-t"><small>Paso {i + 1} de {pasos.length}</small><b>{p.t}</b></span>
          <button type="button" className="tour-x" onClick={terminar} aria-label="Cerrar consejos"><Icono n="cerrar" /></button>
        </div>
        <p>{p.x}</p>
        <div className="tour-pie">
          <span className="tour-puntos" aria-hidden="true">{pasos.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "ya" : ""} onClick={() => setI(k)} />)}</span>
          {i > 0 && <button type="button" className="tour-atras" onClick={() => ir(i - 1)}>Atrás</button>}
          {!ultimo && <button type="button" className="tour-omitir" onClick={terminar}>Omitir</button>}
          <button type="button" className="tour-sig" onClick={() => ir(i + 1)}>{ultimo ? "Listo" : "Siguiente"}<Icono n={ultimo ? "palomita" : "derecha"} /></button>
        </div>
      </div>
    </div>
  );
}
