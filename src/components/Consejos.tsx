"use client";

import { usePathname, useRouter } from "next/navigation";
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

// Tutorial completo: recorre estas pantallas en orden. Se abre desde el menú con Ver tutorial.
const RUTA_TUTORIAL = [["/", "Inicio"], ["/cobrar", "Cobrar"], ["/citas", "Citas"], ["/analitica/finanzas", "Finanzas"]] as const;
const CLAVE_TUT = "crabs-tutorial";
const enTutorial = () => { try { return sessionStorage.getItem(CLAVE_TUT) === "1"; } catch { return false; } };
const salirTutorial = () => { try { sessionStorage.removeItem(CLAVE_TUT); } catch { /* sin almacenamiento */ } };
/** Abre el tutorial completo desde el principio (lo usa el menú de la cuenta). */
export function abrirTutorial() { try { sessionStorage.setItem(CLAVE_TUT, "1"); } catch { /* sin almacenamiento */ } window.dispatchEvent(new Event(CLAVE_TUT)); }

const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0) ?? null;

export function Consejos({ vistos }: { vistos: string[] }) {
  const ruta = usePathname();
  const router = useRouter();
  const [tut, setTut] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    setTut(enTutorial());
    const abrir = () => { setTut(true); setVuelta((v) => v + 1); if (ruta !== "/") router.push("/"); };
    window.addEventListener(CLAVE_TUT, abrir);
    return () => window.removeEventListener(CLAVE_TUT, abrir);
  }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps
  const iTut = RUTA_TUTORIAL.findIndex(([r]) => r === ruta);
  const siguienteTut = tut && iTut >= 0 ? RUTA_TUTORIAL[iTut + 1] : undefined;
  const rec = RECORRIDOS[ruta];
  const [hechos, setHechos] = useState(vistos);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const toca = !!rec && (tut || !hechos.includes(rec.id));
  const activo = toca && pasos.length > 0;

  // Espera a que la pantalla cargue y se quede con los pasos cuya sección sí existe.
  useEffect(() => {
    setPasos([]); setI(0); setCaja(null);
    const tutorial = enTutorial();
    if (!rec || (!tutorial && hechos.includes(rec.id))) return;
    const t = setTimeout(() => {
      const ps = rec.pasos.filter((p) => visible(p.sel));
      // En el tutorial, si esta pantalla no tiene qué mostrar (por ejemplo, la caja cerrada), pasa a la siguiente.
      if (!ps.length && tutorial) { const k = RUTA_TUTORIAL.findIndex(([r]) => r === ruta); const sig = RUTA_TUTORIAL[k + 1]; if (sig) router.push(sig[0]); else salirTutorial(); return; }
      setPasos(ps);
    }, tutorial ? 900 : 1300);
    return () => clearTimeout(t);
  }, [ruta, vuelta]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const terminar = useCallback((seguir = false) => {
    if (!rec) return;
    if (seguir && siguienteTut) { marcarConsejos([rec.id]).catch(() => {}); setPasos([]); router.push(siguienteTut[0]); return; }
    salirTutorial(); setTut(false);
    setSaliendo(true);
    marcarConsejos([rec.id]).catch(() => {});
    setTimeout(() => { setHechos((h) => [...h, rec.id]); setSaliendo(false); }, 260);
  }, [rec, siguienteTut]); // eslint-disable-line react-hooks/exhaustive-deps
  const ir = useCallback((n: number) => { if (n >= pasos.length) terminar(true); else if (n >= 0) setI(n); }, [pasos.length, terminar]);

  useEffect(() => {
    if (!activo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminar(false);
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
  const abajo = caja.y + caja.h + 230 < alto || caja.y < 250;
  const GAP = 34;
  const anchoG = ancho < 560 ? Math.min(290, ancho - 32) : 300;
  const globoX = Math.min(Math.max(caja.x + (ancho < 560 ? 4 : 0), 16), ancho - anchoG - 16);
  const flechaX = Math.min(Math.max(caja.x + Math.min(caja.w / 2, 60) - globoX, 22), anchoG - 30);
  const ultimo = i === pasos.length - 1;
  return (
    <div className={`tour ${saliendo ? "sale" : ""}`} role="dialog" aria-modal="true" aria-label={`Consejo: ${p.t}`}>
      <div className="tour-fondo" onClick={() => terminar(false)} />
      <div className="tour-hueco" style={{ left: caja.x, top: caja.y, width: caja.w, height: caja.h }} aria-hidden="true"><i /></div>
      <svg className="tour-linea" aria-hidden="true" key={`l${i}`}>
        <path d={abajo ? `M ${globoX + flechaX} ${caja.y + caja.h} C ${globoX + flechaX} ${caja.y + caja.h + GAP / 2}, ${globoX + flechaX} ${caja.y + caja.h + GAP / 2}, ${globoX + flechaX} ${caja.y + caja.h + GAP}` : `M ${globoX + flechaX} ${caja.y} L ${globoX + flechaX} ${caja.y - GAP}`} />
        <circle cx={globoX + flechaX} cy={abajo ? caja.y + caja.h : caja.y} r="4.5" />
      </svg>
      <div key={i} className={`tour-globo ${abajo ? "abajo" : "arriba"}`} style={{ left: globoX, width: anchoG, top: abajo ? caja.y + caja.h + GAP : undefined, bottom: abajo ? undefined : alto - caja.y + GAP, ["--fx" as string]: `${flechaX}px` }}>
        <span className="tour-prog" aria-hidden="true"><i style={{ width: `${((i + 1) / pasos.length) * 100}%` }} /></span>
        <span className="tour-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
        <div className="tour-cab">
          <span className="tour-i" aria-hidden="true"><Icono n={p.icono} /></span>
          <span className="tour-t"><small>{tut && iTut >= 0 ? `Tutorial ${iTut + 1}/${RUTA_TUTORIAL.length}, ` : ""}Paso {i + 1} de {pasos.length}</small><b>{p.t}</b></span>
          <button type="button" className="tour-x" onClick={() => terminar(false)} aria-label="Cerrar consejos"><Icono n="cerrar" /></button>
        </div>
        <p>{p.x}</p>
        <div className="tour-pie">
          <span className="tour-puntos" aria-hidden="true">{pasos.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "ya" : ""} onClick={() => setI(k)} />)}</span>
          {i > 0 && <button type="button" className="tour-atras" onClick={() => ir(i - 1)}>Atrás</button>}
          {!ultimo && <button type="button" className="tour-omitir" onClick={() => terminar(false)}>{tut ? "Salir" : "Omitir"}</button>}
          <button type="button" className="tour-sig" onClick={() => ir(i + 1)}><span>{ultimo ? (siguienteTut ? siguienteTut[1] : tut ? "Terminar" : "Listo") : "Siguiente"}</span><span className="tour-sig-c"><Icono n={ultimo && !siguienteTut ? "palomita" : "derecha"} /></span></button>
        </div>
      </div>
    </div>
  );
}
