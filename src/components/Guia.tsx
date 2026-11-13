"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marcarConsejos } from "@/app/(app)/acciones-usuario";
import { salir } from "@/app/salir";
import { PUNTOS, type Paso } from "./guia-pasos";

type Caja = { x: number; y: number; w: number; h: number; r: number };
const PAD = 8;

/** Busca el primer elemento visible. "selector|texto" exige que el elemento contenga ese texto. */
function buscar(sel: string): HTMLElement | null {
  for (const parte of sel.split(/,\s*(?![^\[]*\])/)) {
    const [css, texto] = parte.split("|");
    let lista: HTMLElement[] = [];
    try { lista = [...document.querySelectorAll<HTMLElement>(css.trim())]; } catch { continue; }
    const el = lista.find((e) => {
      if (e.closest(".gu")) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      // Un menú fijo que se escondió arriba no cuenta como visible.
      if (getComputedStyle(e.closest("header, nav") ?? e).position === "fixed" && (r.bottom <= 0 || r.top >= window.innerHeight)) return false;
      const st = getComputedStyle(e);
      if (st.visibility === "hidden" || st.display === "none" || st.pointerEvents === "none") return false;
      // Un submenú escondido con transparencia tampoco cuenta.
      for (let a: HTMLElement | null = e; a && a !== document.body; a = a.parentElement) if (Number(getComputedStyle(a).opacity) < 0.2) return false;
      return !texto || (e.innerText || e.getAttribute("aria-label") || "").toLowerCase().includes(texto.toLowerCase());
    });
    if (el) return el;
  }
  return null;
}

// El resaltado sigue la forma del elemento: si es una píldora, el resaltado también.
const medir = (e: HTMLElement): Caja => { const r = e.getBoundingClientRect(); const radio = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 12; return { x: r.left, y: r.top, w: r.width, h: r.height, r: Math.min(radio + PAD, (r.height + PAD * 2) / 2) }; };
const esEscritorio = () => typeof window !== "undefined" && window.matchMedia("(min-width: 821px)").matches;

/**
 * Guía de primer uso. Aparece hasta que la persona termina su lista (se guarda en su usuario).
 * Recorre la app real señalando dónde tocar. Lo que se envía durante la guía se detiene: nada se registra.
 */
export function Guia({ vistos, puntos, nombre }: { vistos: string[]; puntos: string[]; nombre: string }) {
  const ruta = usePathname();
  const router = useRouter();
  const [hechos, setHechos] = useState(() => new Set(vistos.filter((v) => v.startsWith("guia-")).map((v) => v.slice(5))));
  const [esc, setEsc] = useState<boolean | null>(null);
  useEffect(() => { const f = () => setEsc(esEscritorio()); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const lista = useMemo(() => (esc === null ? [] : puntos.filter((p) => PUNTOS[p] && (esc || p !== "atajos"))), [puntos, esc]);
  const fin = hechos.has("fin");
  const actual = lista.find((p) => !hechos.has(p));
  const [fase, setFase] = useState<"bienvenida" | "guia" | "festejo" | "cierre" | null>(null);
  useEffect(() => { if (esc === null || fin) return; setFase((f) => f ?? (hechos.has("inicio") ? "guia" : "bienvenida")); }, [esc, fin, hechos]);

  // Mientras dura la guía, ningún formulario se envía: se aprende sin registrar nada.
  const activa = !!fase && !fin;
  useEffect(() => {
    if (!activa) return;
    // Abrir la caja sí se permite: es la operación normal del inicio del día y sin ella no se puede seguir.
    const alto = (e: Event) => { if ((e.target as HTMLElement)?.querySelector?.('input[name="fondo"]')) return; e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("submit", alto, true);
    document.body.classList.add("con-guia");
    return () => { document.removeEventListener("submit", alto, true); document.body.classList.remove("con-guia"); };
  }, [activa]);

  const guardar = useCallback((ids: string[]) => {
    setHechos((h) => { const n = new Set(h); ids.forEach((i) => n.add(i)); return n; });
    marcarConsejos(ids.map((i) => `guia-${i}`)).catch(() => {});
  }, []);

  if (!fase || fin || esc === null) return null;
  if (fase === "bienvenida") return <Bienvenida nombre={nombre} empezar={() => { guardar(["inicio"]); setFase("guia"); }} />;
  if (fase === "cierre" || !actual) return <Cierre nombre={nombre} terminar={() => { guardar(["fin"]); router.push("/"); }} />;
  return (
    <Recorrido
      key={actual}
      punto={actual}
      lista={lista}
      hechos={hechos}
      esc={esc}
      ruta={ruta}
      ir={(r) => router.push(r)}
      listo={() => {
        const quedan = lista.filter((p) => p !== actual && !hechos.has(p)).length;
        guardar([actual]);
        if (!quedan) setFase("cierre");
      }}
    />
  );
}

function Recorrido({ punto, lista, hechos, esc, ruta, ir, listo }: {
  punto: string; lista: string[]; hechos: Set<string>; esc: boolean; ruta: string; ir: (r: string) => void; listo: () => void;
}) {
  const P = PUNTOS[punto];
  const pasos = useMemo(() => P.pasos.filter((p) => !p.solo || (p.solo === "esc") === esc), [P, esc]);
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [perdido, setPerdido] = useState(false);
  const [festejo, setFestejo] = useState(false);
  // Mientras pasa de un paso a otro no se muestra el sombreado viejo.
  const [pasando, setPasando] = useState(false);
  const [usaAlt, setUsaAlt] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const iRef = useRef(0);
  iRef.current = i;
  const elRef = useRef<HTMLElement | null>(null);
  const enRuta = ruta === P.ruta;
  // Antes de los pasos: llegar a la pantalla tocando el menú (o con el botón Llévame si no está a la vista).
  const paso: Paso | null = enRuta ? pasos[i] ?? null : null;
  const selIr = useMemo(() => P.ir.join(", "), [P]);

  const terminar = useCallback((p?: Paso) => {
    if (p?.despues === "cerrar") document.querySelector<HTMLElement>("[role=dialog] .cerrar-x")?.click();
    if (p?.despues === "limpiar") (document.querySelector<HTMLElement>("button.svc, button.cm-n") ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    setCaja(null); setFestejo(true);
    setTimeout(() => { setFestejo(false); listo(); }, 1100);
  }, [listo]);

  const avanzar = useCallback(() => {
    setCaja(null); elRef.current = null; setPasando(true);
    const n = iRef.current;
    if (n + 1 >= pasos.length) terminar(pasos[n]); else setI(n + 1);
  }, [pasos, terminar]);

  // Busca lo que hay que señalar; si un paso opcional no está, se salta. Si no existe y hay alternativa (pantalla vacía), se señala esa.
  useEffect(() => {
    if (festejo) return;
    setPerdido(false); setCaja(null); setUsaAlt(false); elRef.current = null;
    let vivo = true, intentos = 0;
    if (paso?.siFalta && buscar(paso.siFalta)) { setTimeout(avanzar, 0); return; }
    const sel = paso ? paso.sel : selIr;
    if (!paso) window.scrollTo({ top: 0, behavior: "smooth" });
    const limite = paso ? 18 : 30;
    const t = setInterval(() => {
      if (!vivo) return;
      intentos++;
      let el = buscar(sel);
      let alt = false;
      if (!el && paso?.alt && intentos > 6) { el = buscar(paso.alt.sel); alt = !!el; }
      if (el) {
        clearInterval(t);
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
        elRef.current = el;
        setUsaAlt(alt); setCaja(medir(el)); setPasando(false);
      } else if (intentos > limite) {
        clearInterval(t);
        if (paso?.opcional) avanzar(); else { setPerdido(true); setPasando(false); }
      }
    }, 120);
    return () => { vivo = false; clearInterval(t); };
  }, [paso, selIr, i, enRuta, festejo, ruta, vuelta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sigue al elemento si la pantalla se mueve.
  useEffect(() => {
    if (!caja) return;
    let raf = 0;
    const loop = () => { const el = elRef.current; if (el && el.isConnected) { const c = medir(el); setCaja((v) => (v && Math.abs(v.x - c.x) + Math.abs(v.y - c.y) + Math.abs(v.w - c.w) + Math.abs(v.h - c.h) > 1 ? c : v)); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [caja !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pasos que terminan cuando aparece algo (por ejemplo, la caja abierta).
  useEffect(() => {
    if (!paso?.hasta) return;
    const t = setInterval(() => { if (buscar(paso.hasta!)) { clearInterval(t); avanzar(); } }, 400);
    return () => clearInterval(t);
  }, [paso, avanzar]);

  // Un toque en lo señalado: en "pasa" llega al botón real y luego seguimos.
  useEffect(() => {
    if (!caja || !elRef.current) return;
    const el = elRef.current;
    const toque = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) return;
      // Los enlaces del menú cambian de pantalla solos; si fue un botón (abrir el menú), se busca de nuevo.
      if (!paso) { setPasando(true); setCaja(null); setTimeout(() => setVuelta((v) => v + 1), 300); return; }
      if (paso.modo === "pasa" && !paso.hasta) { setPasando(true); setTimeout(avanzar, 260); }
    };
    document.addEventListener("click", toque, true);
    return () => document.removeEventListener("click", toque, true);
  }, [caja, paso, avanzar]);

  const n = lista.indexOf(punto) + 1;
  const tactil = !esc;
  const titulo = !paso ? `Vamos a ${P.nombre}` : usaAlt && paso.alt ? paso.alt.t : paso.t;
  const texto = !paso ? (enRuta ? "" : `Toca aquí para entrar. ${P.ejemplo}`) : usaAlt && paso.alt ? paso.alt.x : paso.x;
  const accion = !paso ? "Toca aquí" : paso.h;
  const intercepta = !!paso && paso.modo !== "pasa";

  // Globo: abajo del elemento si cabe; si no, arriba; en teléfono centrado.
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const gw = Math.min(esc ? 360 : 340, vw - 24);
  let gx = 12, gy = 80;
  if (caja) {
    gx = esc ? Math.min(Math.max(caja.x + caja.w / 2 - gw / 2, 16), vw - gw - 16) : (vw - gw) / 2;
    const abajo = caja.y + caja.h + PAD + 18;
    gy = abajo + 230 < vh ? abajo : Math.max(caja.y - PAD - 18 - 230, 70);
    if (!esc && gy < 120 && abajo + 200 > vh) gy = 120;
    // Si lo señalado es muy grande (una agenda, una lista), el globo va abajo, sobre el mismo elemento, sin tapar su encabezado.
    // La lista está a la izquierda salvo que lo señalado empiece muy a la izquierda; el globo va del lado contrario.
    if (caja.h > vh * 0.45) { gy = vh - 250; if (esc) gx = caja.x < 330 ? Math.max(caja.x + 24, 16) : Math.min(caja.x + caja.w - gw - 24, vw - gw - 16); }
  }
  const cx = caja ? caja.x + Math.min(caja.w / 2, esc ? 140 : caja.w / 2) : vw / 2;
  const cy = caja ? caja.y + caja.h / 2 : vh / 2;

  return (
    <div className={`gu ${esc ? "esc" : "mov"}`} role="dialog" aria-modal="true" aria-label={`Guía: ${titulo}`}>
      {/* Cuatro paneles bloquean todo menos lo señalado. */}
      {caja ? (
        <>
          <div className="gu-b" style={{ left: 0, top: 0, right: 0, height: Math.max(caja.y - PAD, 0) }} />
          <div className="gu-b" style={{ left: 0, top: caja.y + caja.h + PAD, right: 0, bottom: 0 }} />
          <div className="gu-b" style={{ left: 0, top: caja.y - PAD, width: Math.max(caja.x - PAD, 0), height: caja.h + PAD * 2 }} />
          <div className="gu-b" style={{ left: caja.x + caja.w + PAD, top: caja.y - PAD, right: 0, height: caja.h + PAD * 2 }} />
          <div className="gu-hueco" style={{ left: caja.x - PAD, top: caja.y - PAD, width: caja.w + PAD * 2, height: caja.h + PAD * 2, borderRadius: caja.r }} />
          {intercepta && <button type="button" className="gu-tapa" aria-label={accion} style={{ left: caja.x - PAD, top: caja.y - PAD, width: caja.w + PAD * 2, height: caja.h + PAD * 2, borderRadius: caja.r }} onClick={() => (paso!.modo === "final" ? terminar(paso!) : avanzar())} />}
          <span key={`p${i}${punto}${enRuta}`} className={`gu-puntero ${tactil ? "dedo" : "cursor"}`} style={{ left: cx, top: cy }} aria-hidden="true">
            {tactil
              ? <svg viewBox="0 0 24 24" width="44" height="44"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" fill="none" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
              : <svg viewBox="0 0 22 28" width="26" height="33"><path d="M2 1.5v21.5l5.6-5.2 3.7 8.6 4-1.8-3.7-8.4 7.9-.5z" /></svg>}
            <i />
          </span>
        </>
      ) : <div className={`gu-b ${pasando || festejo ? "suave" : ""}`} style={{ inset: 0 }} />}

      {!festejo && (caja || perdido) && (
        <div key={`g${i}${punto}${enRuta}`} className="gu-globo" style={caja ? { left: gx, top: gy, width: gw } : { left: (vw - gw) / 2, top: Math.max(vh / 2 - 140, 70), width: gw }}>
          <span className="gu-num">{String(n).padStart(2, "0")}<small>/{String(lista.length).padStart(2, "0")}</small><em>{P.nombre}</em></span>
          <h3>{titulo}</h3>
          {paso?.teclas ? (
            <div className="gu-teclas">{paso.teclas.map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}</div>
          ) : texto ? <p>{perdido && !paso ? `${P.ejemplo}` : texto}</p> : null}
          <div className="gu-pie">
            {perdido && !paso ? <button type="button" className="gu-sig" onClick={() => ir(P.ruta)}>Llévame<span>→</span></button>
              : perdido || paso?.modo === "leer" ? <button type="button" className="gu-sig" onClick={() => (perdido && paso?.modo === "final" ? terminar(paso) : avanzar())}>{perdido && paso?.modo === "final" ? "Entendido" : "Siguiente"}<span>→</span></button>
              : <><span className="gu-haz"><i />{accion}</span>{paso && <button type="button" className="gu-saltar" onClick={avanzar}>Saltar paso</button>}</>}
          </div>
        </div>
      )}

      {festejo && (
        <div className="gu-ok" role="status">
          <span className="gu-ok-s"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" pathLength={1} /><path d="M15 27l7 7 15-16" pathLength={1} /></svg>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ rotate: `${k * 45}deg` }} />)}</span>
          <b>{P.nombre}</b><small>Listo</small>
        </div>
      )}

      <aside className={`gu-lista ${abierta ? "abierta" : ""} ${caja && (esc ? caja.x < 330 : caja.y + caja.h > vh * 0.55) ? "otro-lado" : ""}`}>
        <header onClick={() => setAbierta((a) => !a)}>
          <div><b>Tu primera vez</b><span>{lista.filter((x) => hechos.has(x)).length} de {lista.length}</span></div>
          <span className="gu-prog"><i style={{ width: `${(lista.filter((x) => hechos.has(x)).length / lista.length) * 100}%` }} /></span>
        </header>
        <ol>
          {lista.map((x) => (
            <li key={x} className={hechos.has(x) ? "hecho" : x === punto ? "actual" : ""}>
              <span className="gu-ck" aria-hidden="true" />
              <span><b>{PUNTOS[x].nombre}</b><small>{PUNTOS[x].ejemplo}</small></span>
            </li>
          ))}
        </ol>
        <button type="button" className="gu-salir" onClick={() => salir()}>Salir de mi cuenta</button>
      </aside>
    </div>
  );
}

/** El cangrejo del logo, pequeño, asomado detrás del botón: tenazas y ojos que parpadean; tamborilea con las tenazas como esperando. */
function Asoma() {
  return (
    <i className="gu-sobre" aria-hidden="true">
      <b className="gu-cang">
        <i className="cu" /><i className="t1" /><i className="t2" /><i className="oj" />
      </b>
    </i>
  );
}

function Bienvenida({ nombre, empezar }: { nombre: string; empezar: () => void }) {
  const [sale, setSale] = useState(false);
  useLayoutEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  return (
    <div className={`gu-bien gu-calma ${sale ? "sale" : ""}`} role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div className="gu-aura" aria-hidden="true" />
      <div className="gu-grano" aria-hidden="true" />
      <div className="gu-bien-c">
        <h1 className="gu-saludo" aria-label={`Hola, ${nombre}`}><span><i>Hola,</i></span> <span><b>{nombre}</b></span></h1>
        <p className="gu-frase">Te llevo por toda la app. Te señalo dónde tocar y para qué sirve cada botón.</p>
        <button type="button" className="gu-empezar" onClick={() => { setSale(true); setTimeout(empezar, 800); }}><Asoma />Empezar<span>→</span></button>
        <small className="gu-dura">Unos 5 minutos</small>
      </div>
    </div>
  );
}

function Cierre({ nombre, terminar }: { nombre: string; terminar: () => void }) {
  return (
    <div className="gu-bien gu-calma gu-cierre" role="dialog" aria-modal="true" aria-label="Guía terminada">
      <div className="gu-aura" aria-hidden="true" />
      <div className="gu-grano" aria-hidden="true" />
      <div className="gu-bien-c">
        <h1 className="gu-saludo" aria-label={`Listo, ${nombre}`}><span><i>Listo,</i></span> <span><b>{nombre}</b></span></h1>
        <p className="gu-frase">Ya conoces tu app. Todo lo que viste está a un toque cuando lo necesites.</p>
        <button type="button" className="gu-empezar" onClick={terminar}><Asoma />Empezar a trabajar<span>→</span></button>
      </div>
    </div>
  );
}
