"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { alternarCategoria, crearCategoria, type EstadoGasto } from "@/app/(app)/analitica/gastos/actions";
import { Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { agregarConcepto, cambiarModeloCaja, type EstadoAjuste, quitarConcepto } from "./actions";

/** Caja compartida o una caja por trabajador. */
export function ModeloCaja({ actual }: { actual: string }) {
  const [valor, setValor] = useState(actual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const elegir = (v: string) => iniciar(async () => {
    const r = await cambiarModeloCaja(v);
    setError(r.error ?? null);
    if (!r.error) setValor(v);
  });
  const opciones: [string, string, string][] = [
    ["compartida", "Caja compartida", "Una sola caja para todo el equipo. Quien esté en turno abre y hace el corte."],
    ["individual", "Caja individual por trabajador", "Cada trabajador abre su caja, cobra en ella y hace su propio corte."],
  ];
  return (
    <div className="ajuste">
      <span><b>Modelo de caja</b><small>Cómo se administra el efectivo del negocio.</small></span>
      <div className="modelos-c" role="radiogroup" aria-label="Modelo de caja">
        {opciones.map(([k, t, d]) => (
          <button key={k} type="button" role="radio" aria-checked={valor === k} className={`opcion-mc ${valor === k ? "on" : ""}`} disabled={pendiente} onClick={() => elegir(k)}>
            <b>{t}</b><small>{d}</small>
          </button>
        ))}
      </div>
      {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}

type Categoria = { id: string; nombre: string; activo: boolean };

export function CategoriasEgresos({ categorias }: { categorias: Categoria[] }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(crearCategoria, {});
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  useEffect(() => { if (e.ok) setNombre(""); }, [e.ok, e.n]);
  return (
    <div className="ajuste">
      <span><b>Categorías de egresos</b><small>Crea las tuyas o apaga las que no uses. Apagar una no cambia los egresos que ya la usan.</small></span>
      <div className="chips-cat">
        {categorias.map((c) => (
          <button key={c.id} type="button" className={`chip-cat ${c.activo ? "on" : ""}`} disabled={pendiente} aria-pressed={c.activo}
            onClick={() => iniciar(async () => { const r = await alternarCategoria(c.id); setAviso(r.error ?? null); })}>
            <Icono n={c.activo ? "palomita" : "cerrar"} />{c.nombre}
          </button>
        ))}
      </div>
      <form action={accion} className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
        <input className="input" name="nombre" value={nombre} onChange={(x) => setNombre(x.target.value)} placeholder="Nueva categoría, por ejemplo: Productos de limpieza" maxLength={40} style={{ flex: 1 }} />
        <button className="bt sec solo" disabled={guardando || nombre.trim().length < 2}><Icono n="mas" />Agregar</button>
      </form>
      {(e.error || aviso) && <p className="aviso error" style={{ margin: 0 }}>{e.error ?? aviso}</p>}
    </div>
  );
}

type Concepto = { id: string; concepto: string; categoria: string; monto: number; metodo: string; periodicidad: string };
const METODOS: [string, string][] = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]];
const PERIODOS: [string, string][] = [["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]];

/** Gastos que se repiten: al registrar un egreso se eligen con un toque. */
export function ConceptosFrecuentes({ conceptos, categorias }: { conceptos: Concepto[]; categorias: string[] }) {
  const [e, accion, guardando] = useActionState<EstadoAjuste, FormData>(agregarConcepto, {});
  const [categoria, setCategoria] = useState(categorias[0] ?? "");
  const [metodo, setMetodo] = useState("transferencia");
  const [periodo, setPeriodo] = useState("mensual");
  const [vez, setVez] = useState(0);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => { if (e.ok) setVez((v) => v + 1); }, [e.ok, e.n]);
  return (
    <div className="ajuste">
      <span><b>Conceptos frecuentes</b><small>Gastos que se repiten, como la renta o la luz. Al registrar un egreso aparecen listos para elegir.</small></span>
      {conceptos.length > 0 && (
        <div className="lista-cf">
          {conceptos.map((c) => (
            <div key={c.id}>
              <span><b>{c.concepto}</b><small>{c.categoria}, {PERIODOS.find(([k]) => k === c.periodicidad)?.[1].toLowerCase()}, {METODOS.find(([k]) => k === c.metodo)?.[1].toLowerCase()}</small></span>
              <b className="num">{c.monto ? formatoDinero(c.monto) : ""}</b>
              <button type="button" className="icb" disabled={pendiente} onClick={() => iniciar(async () => { await quitarConcepto(c.id); })} aria-label={`Quitar ${c.concepto}`} title="Quitar"><Icono n="basura" /></button>
            </div>
          ))}
        </div>
      )}
      <form key={vez} action={accion} className="nuevo-cf">
        <input type="hidden" name="categoria" value={categoria} />
        <input type="hidden" name="metodo" value={metodo} />
        <input type="hidden" name="periodicidad" value={periodo} />
        <input className="input" name="concepto" placeholder="Concepto, por ejemplo: Renta del local" maxLength={120} required />
        <input className="input" name="monto" inputMode="decimal" placeholder="$ Cantidad" />
        <Selector etiqueta="Categoría" valor={categoria} onChange={setCategoria} opciones={categorias.map((c) => ({ valor: c, texto: c }))} />
        <Selector etiqueta="Método" valor={metodo} onChange={setMetodo} opciones={METODOS.map(([k, t]) => ({ valor: k, texto: t }))} />
        <Selector etiqueta="Cada cuándo" valor={periodo} onChange={setPeriodo} opciones={PERIODOS.map(([k, t]) => ({ valor: k, texto: t }))} />
        <button className="bt sec solo" disabled={guardando}><Icono n="mas" />Guardar</button>
      </form>
      {e.error && <p className="aviso error" style={{ margin: 0 }}>{e.error}</p>}
    </div>
  );
}
