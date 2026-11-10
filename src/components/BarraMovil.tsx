"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "./Icono";
import type { ItemNav, SubNav } from "./Nav";

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

const activo = (ruta: string, href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

/** Parte izquierda de la barra superior en el teléfono: saludo en Inicio, nombre de la sección en lo demás. */
export function TituloMovil({ nombre, fecha, items, sub }: { nombre: string; fecha: string; items: ItemNav[]; sub?: SubNav }) {
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
  const seccion = enCobro ? "Cobro" : items.find((i) => i.href !== "/" && activo(ruta, i.href))?.texto
    ?? (ruta.startsWith("/historial") ? "Historial" : ruta.startsWith("/ajustes") ? "Ajustes" : ruta.startsWith("/soporte") ? "Soporte" : ruta === "/" ? null : "");
  const dentro = !!sub && sub.items.length > 1 && ruta.startsWith(sub.base);
  return (
    <div className="titulo-m">
      <div className="fila-tm">
        {enCobro && <button type="button" className="icb cerrar-m" aria-label="Salir de Cobro" onClick={() => (history.length > 1 ? router.back() : router.push("/"))}><Icono n="cerrar" /></button>}
        {seccion === null && !compacta
          ? <span className="saludo-m"><small>{fecha}</small><b><em>Hola,</em> {nombre}</b></span>
          : <span className="saludo-m"><b>{seccion || "Inicio"}</b></span>}
      </div>
      {dentro && (
        <nav className="sub-m" aria-label="Secciones de Analítica">
          {sub!.items.map(([h, t]) => (
            <Link key={h} href={h} aria-current={(h === sub!.base ? ruta === h : ruta.startsWith(h)) ? "page" : undefined}>{t}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}

type Mas = { historial: boolean; ajustes: boolean; ideas: boolean; ayuda: boolean; soporte: boolean };

/** Barra de secciones abajo, en el teléfono. Cobrar va al centro cuando el puesto puede cobrar. */
export function BarraInferior({ items, mas, masEnAvatar }: { items: ItemNav[]; mas: Mas; masEnAvatar?: boolean }) {
  const ruta = usePathname();
  const [hoja, setHoja] = useState(false);
  useEffect(() => setHoja(false), [ruta]);
  useEffect(() => {
    if (!hoja) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setHoja(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [hoja]);

  const cobro = items.find((i) => i.href === "/cobrar");
  const resto = items.filter((i) => i.href !== "/cobrar");
  // Con cuatro secciones y Cobrar no cabe "Más": sus opciones van en el menú del avatar.
  const visibles = resto.slice(0, masEnAvatar ? 4 : cobro ? 3 : 4);
  const extra = resto.slice(visibles.length);
  const izq = cobro ? visibles.slice(0, 2) : visibles;
  const der = cobro ? visibles.slice(2) : [];
  const conMas = !masEnAvatar;
  const tab = (i: ItemNav) => (
    <Link key={i.href} href={i.href} className="tab-m" aria-current={activo(ruta, i.href) ? "page" : undefined}>
      <span className="ic-m"><Icono n={i.icono} /></span>{i.texto === "Cobro" ? "Cobrar" : i.texto}
    </Link>
  );
  const enMas = [
    ...extra.map((i) => ({ k: i.href, href: i.href, icono: i.icono, texto: i.texto })),
    ...(mas.historial ? [{ k: "h", href: "/historial", icono: "historial", texto: "Historial" }] : []),
    ...(mas.ajustes ? [{ k: "a", href: "/ajustes", icono: "ajustes", texto: "Ajustes" }] : []),
    ...(mas.soporte ? [{ k: "s", href: "/soporte", icono: "llave", texto: "Soporte" }] : []),
  ];
  const masActivo = enMas.some((x) => activo(ruta, x.href));

  return (
    <>
      <nav className={`barra-inf ${cobro ? "con-cobro" : ""}`} aria-label="Secciones" style={{ ["--cols" as string]: izq.length + der.length + (conMas ? 1 : 0) }}>
        {izq.map(tab)}
        {cobro && (
          <Link href="/cobrar" className="tab-m cobrar-m" aria-current={activo(ruta, "/cobrar") ? "page" : undefined}>
            <span className="fab-m"><Icono n="cobro" /></span>Cobrar
          </Link>
        )}
        {der.map(tab)}
        {conMas && <button type="button" className="tab-m" aria-haspopup="dialog" aria-expanded={hoja} aria-current={masActivo ? "page" : undefined} onClick={() => setHoja(true)}>
          <span className="ic-m"><Icono n="puntos" /></span>Más
        </button>}
      </nav>
      {hoja && (
        <>
          <div className="velo-hoja-m" aria-hidden="true" />
          <div className="hoja-m" role="dialog" aria-modal="true" aria-label="Más opciones">
            <span className="asa-m" aria-hidden="true" />
            <div className="cab-hoja-m"><b>Más</b><button type="button" className="icb" aria-label="Cerrar" onClick={() => setHoja(false)}><Icono n="cerrar" /></button></div>
            <div className="mosaico-m">
              {enMas.map((x) => <Link key={x.k} href={x.href} aria-current={activo(ruta, x.href) ? "page" : undefined}><Icono n={x.icono} />{x.texto}</Link>)}
              {mas.ideas && <button type="button" onClick={() => { setHoja(false); abrirPanel("ideas"); }}><Icono n="chispa" />Ideas</button>}
              {mas.ayuda && <button type="button" onClick={() => { setHoja(false); abrirPanel("ayuda"); }}><Icono n="ayuda" />Ayuda</button>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
