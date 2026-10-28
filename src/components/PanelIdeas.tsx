"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { decidirIdea } from "@/app/(app)/acciones-ideas";
import type { Propuesta } from "@/lib/propuestas";
import { Ayuda } from "./Ayuda";
import { Icono } from "./Icono";

type Datos = {
  aprendiendo: { semanas: number; faltan: number } | null;
  destacada: Propuesta | null;
  resto: Propuesta[];
  decididas: { id: string; titulo: string; estado: "aprobada" | "descartada" }[];
};

const CHISPAS = [[12, 18], [78, 9], [88, 30], [30, 6], [60, 22], [8, 40]];

/** Orbe que abre el panel de ideas comerciales. */
export function PanelIdeas() {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError(false);
    fetch("/api/ideas", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setError(true));
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto]);

  const decidir = (p: Propuesta, si: boolean) => {
    setD((x) => x && {
      ...x,
      destacada: x.destacada?.clave === p.clave ? x.resto[0] ?? null : x.destacada,
      resto: x.destacada?.clave === p.clave ? x.resto.slice(1) : x.resto.filter((r) => r.clave !== p.clave),
      decididas: [{ id: p.clave, titulo: p.titulo, estado: si ? ("aprobada" as const) : ("descartada" as const) }, ...x.decididas].slice(0, 6),
    });
    decidirIdea(p.clave, p.titulo, si).catch(() => setError(true));
  };

  const Botones = ({ p }: { p: Propuesta }) => (
    <div className="fila" style={{ gap: 8 }}>
      <button type="button" className="bt" style={{ fontSize: 13 }} onClick={() => decidir(p, true)}>Me interesa<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button>
      <button type="button" className="bt sec solo" style={{ fontSize: 13 }} onClick={() => decidir(p, false)}>Ahora no</button>
    </div>
  );

  return (
    <>
      <button type="button" className="orbe" aria-label="Ideas para vender más" title="Ideas" onClick={() => setAbierto(true)}>
        <Icono n="chispa" />
      </button>
      {abierto && createPortal(
        <div className="capa" style={{ background: "rgba(30,42,54,.18)", placeItems: "stretch", padding: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <aside className="panel-ideas" role="dialog" aria-modal="true" aria-label="Ideas">
            <div className="aurora" aria-hidden="true" />
            {CHISPAS.map(([x, y], i) => <i key={i} className="chispa" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.5}s` }} aria-hidden="true" />)}
            <div className="entre">
              <span className="fila" style={{ gap: 8 }}>
                <span className="lab" style={{ color: "var(--fg)" }}>Ideas para vender más</span>
                <Ayuda titulo="¿De dónde salen?">
                  Se arman con dos cosas: los horarios en que llegan menos clientes, según las ventas registradas, y las fechas del año que mueven a una barbería.
                  <br /><br />Son solo sugerencias. Nada se publica ni cambia de precio por sí solo.
                </Ayuda>
              </span>
              <button type="button" className="icb" onClick={() => setAbierto(false)} aria-label="Cerrar"><Icono n="cerrar" /></button>
            </div>
            {error && <p className="aviso error">No se pudieron cargar las ideas. Intenta de nuevo.</p>}
            {!d && !error && <div className="progreso" aria-label="Cargando"><i /></div>}
            {d && (
              <>
                {d.destacada && (
                  <div className="idea-dia subir">
                    <div>
                      <span className="lab" style={{ color: "var(--accent)" }}>Idea del día</span>
                      <h3 style={{ font: "600 22px/1.25 var(--f-body)" }}>{d.destacada.titulo}</h3>
                      <span className="etiqueta" style={{ width: "max-content" }}>{d.destacada.etiqueta}</span>
                      <p className="muted" style={{ fontSize: 14 }}>{d.destacada.detalle}</p>
                      {d.destacada.pasos.map((x) => <p key={x} className="sugerencia">{x}</p>)}
                      <Botones p={d.destacada} />
                    </div>
                  </div>
                )}
                {d.aprendiendo && (
                  <p className="sugerencia">
                    Con {d.aprendiendo.semanas} {d.aprendiendo.semanas === 1 ? "semana" : "semanas"} de ventas todavía no se sabe qué horarios están tranquilos.
                    <br />Faltan {d.aprendiendo.faltan} para empezar a sugerirlos.
                  </p>
                )}
                {d.resto.map((p, i) => (
                  <article key={p.clave} className="glass idea-t" style={{ animationDelay: `${0.12 * (i + 1)}s` }}>
                    <span className="lab">{p.etiqueta}</span>
                    <b style={{ fontSize: 16 }}>{p.titulo}</b>
                    <p className="muted" style={{ fontSize: 13.5 }}>{p.detalle}</p>
                    <Botones p={p} />
                  </article>
                ))}
                {!d.destacada && d.resto.length === 0 && <p className="muted">No hay ideas nuevas por ahora.</p>}
                {d.decididas.length > 0 && (
                  <div className="pila-chica" style={{ marginTop: 8 }}>
                    <span className="lab">Lo que ya decidiste</span>
                    {d.decididas.map((x) => (
                      <div key={x.id} className="entre" style={{ fontSize: 13 }}>
                        <span>{x.titulo}</span>
                        <span className={`est ${x.estado === "aprobada" ? "" : "off"}`}><span className="d" />{x.estado === "aprobada" ? "Me interesa" : "Ahora no"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
