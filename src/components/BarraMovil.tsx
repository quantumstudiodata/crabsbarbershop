"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icono } from "./Icono";
import { grupoDe, pestanaActiva } from "@/lib/menu";
import { enSeccion, type ItemNav, type SubNav } from "./Nav";

/** Abre un panel que vive en la barra de escritorio (Ayuda, Ideas) desde el teléfono. */
export const abrirPanel = (cual: "ayuda" | "ideas") => window.dispatchEvent(new Event(`crabs:${cual}`));

/** Escucha la orden de abrir un panel desde el teléfono. */
export function useAbrirPanel(cual: "ayuda" | "ideas", abrir: () => void) {
  useEffect(() => {
    const f = () => abrir();
    window.addEventListener(`crabs:${cual}`, f);
    return () => window.removeEventListener(`crabs:${cual}`, f);
  }, [cual, abrir]);
}


/** Parte izquierda de la barra superior en el teléfono: saludo en Inicio, nombre de la sección en lo demás. */
export function TituloMovil({ negocio, nombre, fecha, items, grupos }: { negocio: string; nombre: string; fecha: string; items: ItemNav[]; grupos: SubNav[] }) {
  const ruta = usePathname();
  const router = useRouter();
  const [compacta, setCompacta] = useState(false);
  useEffect(() => {
    const f = () => setCompacta(window.scrollY > 40);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => { document.querySelector(".barra")?.classList.toggle("compacta-m", compacta); }, [compacta]);
  const enCobro = ruta.startsWith("/cobrar");
  const seccion = enCobro ? "Cobro" : items.find((i) => i.href !== "/" && enSeccion(ruta, i))?.texto
    ?? (ruta.startsWith("/historial") ? "Historial" : ruta.startsWith("/ajustes") ? "Ajustes" : ruta.startsWith("/soporte") ? "Soporte" : ruta === "/" ? null : "");
  const grupo = grupoDe(ruta, grupos);
  // Al llegar a una pestaña que está fuera de la vista (por ejemplo Finanzas, al final), el menú se desliza hasta ella.
  const sub = useRef<HTMLElement>(null);
  useEffect(() => {
    const a = sub.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!a || !sub.current) return;
    const n = sub.current;
    const destino = a.offsetLeft - (n.clientWidth - a.offsetWidth) / 2;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    n.scrollTo({ left: Math.max(0, destino), behavior: reducir ? "auto" : "smooth" });
  }, [ruta]);
  return (
    <div className="titulo-m">
      <div className="fila-tm">
        {enCobro && <button type="button" className="icb cerrar-m" aria-label="Salir de Cobro" onClick={() => (history.length > 1 ? router.back() : router.push("/"))}><Icono n="cerrar" /></button>}
        {seccion === null && !compacta
          ? <span className="saludo-m"><small>{fecha}</small><b><em>Hola,</em> {nombre}</b></span>
          : <span className="saludo-m"><small>{negocio}</small><b key={seccion || "Inicio"} className="entra-m">{seccion || "Inicio"}</b></span>}
      </div>
      {grupo && (
        <nav ref={sub} className="sub-m" aria-label="Pestañas de la sección">
          {grupo.items.map(([h, t]) => (
            <Link key={h} href={h} aria-current={pestanaActiva(ruta, h, grupo.items) ? "page" : undefined}>{t}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}

type Mas = { historial: boolean; ajustes: boolean; ideas: boolean; ayuda: boolean; soporte: boolean };

/**
 * Barra de secciones abajo, en el teléfono: hasta cuatro secciones en una píldora, con un fondo oscuro que se desliza
 * a la elegida, y Cobrar aparte a la derecha. Lo demás (Ajustes, Historial, Ideas, Ayuda) está en el menú de la cuenta.
 */
export function BarraInferior({ items }: { items: ItemNav[]; mas?: Mas }) {
  const ruta = usePathname();
  const cobro = items.find((i) => i.href === "/cobrar");
  const secciones = items.filter((i) => i.href !== "/cobrar").slice(0, 4);
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<React.CSSProperties>({ opacity: 0 });
  const [lista, setLista] = useState(false);
  useLayoutEffect(() => {
    const f = () => {
      const a = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
      setPill(a ? { transform: `translateX(${a.offsetLeft}px)`, width: a.offsetWidth, opacity: 1 } : { opacity: 0 });
    };
    f();
    const t = setTimeout(() => setLista(true), 50);
    window.addEventListener("resize", f);
    // Si la barra estaba oculta (por ejemplo al salir de Cobro), se vuelve a medir cuando aparece y cambia de tamaño.
    const obs = typeof ResizeObserver !== "undefined" && nav.current ? new ResizeObserver(f) : null;
    if (obs && nav.current) obs.observe(nav.current);
    const r = requestAnimationFrame(() => requestAnimationFrame(f));
    return () => { clearTimeout(t); cancelAnimationFrame(r); obs?.disconnect(); window.removeEventListener("resize", f); };
  }, [ruta]);
  return (
    <div className={`barra-inf ${lista ? "lista" : ""}`}>
      <nav ref={nav} className="secc-m" aria-label="Secciones">
        <span className="burbuja-m" style={pill} aria-hidden="true" />
        {secciones.map((i) => (
          <Link key={i.href} href={i.href} className="tab-m" aria-current={enSeccion(ruta, i) ? "page" : undefined}>
            <Icono n={i.icono} />{i.texto}
          </Link>
        ))}
      </nav>
      {cobro && (
        <Link href="/cobrar" className="cobrar-m" aria-current={ruta.startsWith("/cobrar") ? "page" : undefined}>
          <Icono n="cobro" />Cobrar
        </Link>
      )}
    </div>
  );
}
