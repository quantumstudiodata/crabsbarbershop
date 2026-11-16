"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Grafica } from "@/components/Grafica";
import { zoomPagina } from "@/lib/zoom";

type Reparto = { eq: boolean; gan: boolean };
// Altura mínima de la gráfica de hoy: menos que esto ya no se leen la línea ni sus marcas.
const GRAF_MIN = 130;
const GAP = 20;

/**
 * Inicio en escritorio y tablet: dos columnas que terminan a la misma altura sin dejar huecos.
 * Mide las tarjetas reales y decide en qué columna van Equipo hoy y Llevas ganado; lo que sobre lo absorbe la gráfica de hoy,
 * que crece o se encoge sin deformarse. En el teléfono no se usa (allá todo va en una columna).
 */
export function RejillaInicio({ hoyCon, hoySin, equipo, ganado, der, inicial }: {
  /** La tarjeta de hoy con Llevas ganado dentro, y sin él. */
  hoyCon: React.ReactNode; hoySin: React.ReactNode;
  equipo: React.ReactNode; ganado: React.ReactNode | null; der: React.ReactNode; inicial: Reparto;
}) {
  const [rep, setRep] = useState<Reparto>(inicial);
  const raiz = useRef<HTMLDivElement>(null);
  // Alturas medidas de lo que se puede mover, para comparar repartos aunque hoy no esté a la vista de cierta forma.
  const alturas = useRef<{ eq?: number; ganDentro?: number; ganTarjeta?: number }>({});

  const decidir = useCallback(() => {
    const r = raiz.current;
    if (!r || r.offsetParent === null) return;
    const z = zoomPagina() || 1;
    const alto = (e: Element | null) => (e ? (e as HTMLElement).getBoundingClientRect().height / z : 0);
    const hoy = r.querySelector("[data-r=hoy]"), graf = r.querySelector("[data-r=hoy] .ini-graf");
    const eq = r.querySelector("[data-r=equipo]"), ganT = r.querySelector("[data-r=ganado]"), ganD = r.querySelector("[data-r=hoy] .ini-ganado");
    const a = alturas.current;
    // Se mide el tamaño natural de cada tarjeta, sin el estirado que las iguala (si no, la medida incluye el hueco).
    r.classList.add("midiendo");
    if (eq) a.eq = alto(eq);
    if (ganT) a.ganTarjeta = alto(ganT);
    if (ganD) a.ganDentro = alto(ganD) + 12;
    if (ganado && a.ganTarjeta === undefined && a.ganDentro !== undefined) a.ganTarjeta = a.ganDentro + 30;
    if (ganado && a.ganDentro === undefined && a.ganTarjeta !== undefined) a.ganDentro = a.ganTarjeta - 30;
    // La tarjeta de hoy sin lo que se mueve y con la gráfica en su mínimo.
    const hoyBase = alto(hoy) - alto(graf) + GRAF_MIN - (ganD ? a.ganDentro ?? 0 : 0);
    const fijosDer = [...r.querySelectorAll("[data-r=der] > [data-fijo]")].map(alto).filter((x) => x > 0);
    const derBase = fijosDer.reduce((s, x) => s + x, 0) + Math.max(fijosDer.length - 1, 0) * GAP;
    r.classList.remove("midiendo");
    const opciones: Reparto[] = [{ eq: true, gan: true }, { eq: true, gan: false }, { eq: false, gan: true }, { eq: false, gan: false }].filter((o) => ganado || o.gan);
    const costo = (o: Reparto) => {
      const izq = hoyBase + (o.gan && ganado ? a.ganDentro ?? 0 : 0) + (o.eq ? GAP + (a.eq ?? 0) : 0);
      const extras = [...(o.eq ? [] : [a.eq ?? 0]), ...(o.gan || !ganado ? [] : [a.ganTarjeta ?? 0])];
      const derecha = derBase + extras.reduce((s, x) => s + x, 0) + (fijosDer.length ? extras.length : Math.max(extras.length - 1, 0)) * GAP;
      // Si la derecha es más alta, la gráfica crece: hasta 160 px se ve normal, más que eso ya parece vacía.
      // Si la derecha es más baja, su última tarjeta se estira: se permite poco.
      return derecha >= izq ? Math.max(0, derecha - izq - 160) * 1.5 : (izq - derecha) * 3;
    };
    const mejor = opciones.reduce((m, o) => (costo(o) < costo(m) - 4 ? o : m), opciones.find((o) => o.eq === rep.eq && o.gan === rep.gan) ?? opciones[0]);
    if (mejor.eq !== rep.eq || mejor.gan !== rep.gan) setRep(mejor);
  }, [ganado, rep]);

  useEffect(() => {
    decidir();
    const r = raiz.current;
    if (!r) return;
    let ancho = r.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => { const w = r.getBoundingClientRect().width; if (Math.abs(w - ancho) > 2) { ancho = w; decidir(); } });
    ro.observe(r);
    document.fonts?.ready.then(decidir).catch(() => {});
    // Las tarjetas terminan de acomodarse (animaciones de entrada, avisos que se cargan): se revisa otra vez al poco.
    const t1 = setTimeout(decidir, 400), t2 = setTimeout(decidir, 1200);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __rejilla?: () => void }).__rejilla = decidir;
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [decidir]);

  return (
    <div ref={raiz} className="ini-rejilla solo-escritorio">
      <div className="ini-izq">
        <div data-r="hoy" className="ini-hoy-w">{rep.gan && ganado ? hoyCon : hoySin}</div>
        {rep.eq && <div data-r="equipo">{equipo}</div>}
      </div>
      <div className="ini-der" data-r="der">
        {der}
        {!rep.gan && ganado && <div data-r="ganado">{ganado}</div>}
        {!rep.eq && <div data-r="equipo">{equipo}</div>}
      </div>
    </div>
  );
}

/** La gráfica de hoy ocupa todo el espacio que le dejan y se redibuja a esa altura, sin estirarse. */
export function GraficaAjustable(props: React.ComponentProps<typeof Grafica>) {
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ ancho: props.ancho ?? 640, alto: props.alto ?? 150 });
  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    const medir = () => {
      const z = zoomPagina() || 1;
      const r = c.getBoundingClientRect();
      const width = r.width / z, height = r.height / z;
      if (width < 50 || height < 50) return;
      // 22 px son los ejes de abajo. El dibujo usa el tamaño real (un punto por pixel): así las letras y los puntos no se agrandan ni se achican.
      setTam({ ancho: Math.round(width), alto: Math.max(80, Math.round(height - 22)) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return <div ref={caja} className="graf-ajustable"><div><Grafica {...props} ancho={tam.ancho} alto={tam.alto} /></div></div>;
}
