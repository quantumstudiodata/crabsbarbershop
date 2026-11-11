"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal } from "@/components/ui";
import { guardarAccionesRapidas } from "./acciones-usuario";

export type AccionInicio = { k: string; href: string; texto: string; corto: string; icono: string; dato?: string; principal?: boolean; aviso?: boolean };
export type Acciones = { visibles: AccionInicio[]; todas: { k: string; texto: string; icono: string; oculta: boolean; fija: boolean }[]; sugerido: string[] };

/** Cada persona elige el orden de sus acciones rápidas y cuáles no quiere ver. Cobrar siempre está. */
function Personalizar({ datos, cerrar }: { datos: Acciones; cerrar: () => void }) {
  const router = useRouter();
  const [lista, setLista] = useState(datos.todas);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const mover = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= lista.length) return; const n = [...lista]; [n[i], n[j]] = [n[j], n[i]]; setLista(n); };
  const guardar = (orden: string[], ocultas: string[]) => iniciar(async () => { const r = await guardarAccionesRapidas(orden, ocultas); if (r.error) setError(r.error); else { router.refresh(); cerrar(); } });
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Inicio" titulo="Acciones rápidas">
      <div className="pila" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ordénalas como más te sirva y apaga las que no uses. Las primeras se ven directo; las demás, en Más acciones.</p>
        <div className="ar-lista">
          {lista.map((a, i) => (
            <div key={a.k} className={`ar-fila ${a.oculta ? "apagada" : ""}`}>
              <span className="ar-ic"><Icono n={a.icono} /></span>
              <span className="ar-t">{a.texto}</span>
              <span className="ar-mov">
                <button type="button" className="icb" aria-label={`Subir ${a.texto}`} disabled={i === 0} onClick={() => mover(i, -1)}><Icono n="arriba" /></button>
                <button type="button" className="icb" aria-label={`Bajar ${a.texto}`} disabled={i === lista.length - 1} onClick={() => mover(i, 1)}><Icono n="abajo" /></button>
              </span>
              {a.fija ? <span className="ar-fija">Siempre</span> : <Interruptor etiqueta={`Mostrar ${a.texto}`} checked={!a.oculta} onChange={(v) => setLista(lista.map((x) => (x.k === a.k ? { ...x, oculta: !v } : x)))} />}
            </div>
          ))}
        </div>
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="entre">
          <button type="button" className="link-c" disabled={pend} onClick={() => guardar([], [])}>Usar el orden sugerido</button>
          <button type="button" className="bt" disabled={pend} onClick={() => guardar(lista.map((x) => x.k), lista.filter((x) => x.oculta).map((x) => x.k))}>{pend ? "Guardando…" : "Guardar"}<Fl /></button>
        </div>
      </div>
    </Modal>
  );
}

/** Escritorio: grupo compacto a la derecha del saludo. Cobrar primero; lo que no cabe va en el botón de tres puntos. */
export function AccionesEscritorio({ acciones, personalizar }: { acciones: AccionInicio[]; personalizar?: Acciones }) {
  const [editar, setEditar] = useState(false);
  const visibles = acciones.slice(0, 4);
  const mas = acciones.slice(4);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  if (!acciones.length) return null;
  return (
    <nav className="ini-acc glass" aria-label="Acciones rápidas">
      {visibles.map((a) => (
        <Link key={a.k} href={a.href} className={`${a.principal ? "pri" : ""} ${a.aviso ? "pend" : ""}`} title={a.dato}><Icono n={a.icono} />{a.corto}</Link>
      ))}
      {mas.length > 0 && (
        <div ref={caja} className="ini-mas">
          <button type="button" className="ini-pts" aria-label={`Más acciones: ${mas.map((a) => a.texto.toLowerCase()).join(" y ")}`} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}><Icono n="puntos" /></button>
          {abierto && (
            <div className="menu ini-menu" role="menu">
              {mas.map((a) => <Link key={a.k} href={a.href} role="menuitem" className="it" onClick={() => setAbierto(false)}><Icono n={a.icono} />{a.texto}</Link>)}
              {personalizar && <button type="button" role="menuitem" className="it" onClick={() => { setAbierto(false); setEditar(true); }}><Icono n="ajustes" />Personalizar acciones</button>}
            </div>
          )}
        </div>
      )}
      {mas.length === 0 && personalizar && <button type="button" className="ini-pts" aria-label="Personalizar acciones rápidas" onClick={() => setEditar(true)}><Icono n="ajustes" /></button>}
      {editar && personalizar && <Personalizar datos={personalizar} cerrar={() => setEditar(false)} />}
    </nav>
  );
}

/** Teléfono: lista de acciones en una tarjeta. Cobrar vive en la barra de abajo. Si son más de cuatro, el resto se despliega. */
export function AccionesMovil({ acciones, personalizar }: { acciones: AccionInicio[]; personalizar?: Acciones }) {
  const sinCobrar = acciones.filter((a) => a.k !== "cobrar");
  const [abierto, setAbierto] = useState(false);
  const [editar, setEditar] = useState(false);
  if (!sinCobrar.length && !personalizar) return null;
  const directas = sinCobrar.length > 4 ? sinCobrar.slice(0, 3) : sinCobrar;
  const resto = sinCobrar.length > 4 ? sinCobrar.slice(3) : [];
  const fila = (a: AccionInicio) => (
    <Link key={a.k} href={a.href} className="ini-fila"><Icono n={a.icono} /><span>{a.texto}</span>{a.dato && <small className={a.aviso ? "pend" : undefined}>{a.dato}</small>}<Icono n="derecha" /></Link>
  );
  return (
    <section className="glass ini-lista solo-movil" aria-label="Acciones rápidas">
      {directas.map(fila)}
      {resto.length > 0 && (
        <>
          <button type="button" className="ini-fila" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
            <Icono n="puntos" /><span>Más acciones</span><small>{resto.map((a) => a.corto.toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase())}</small><Icono n={abierto ? "arriba" : "abajo"} />
          </button>
          {abierto && resto.map(fila)}
        </>
      )}
      {personalizar && <button type="button" className="ini-pers" onClick={() => setEditar(true)}><Icono n="ajustes" />Personalizar</button>}
      {editar && personalizar && <Personalizar datos={personalizar} cerrar={() => setEditar(false)} />}
    </section>
  );
}
