"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { formatoDinero, leerPesos } from "@/lib/money";
import { registrarVenta, type EstadoCobro } from "./actions";

type Servicio = { id: string; nombre: string; duracionMin: number; precio: number };
type Persona = { id: string; nombre: string };
type Metodo = { id: string; nombre: string; esEfectivo: boolean };

const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const primerNombre = (n: string) => n.split(" ")[0];

export function FormCobro(p: { servicios: Servicio[]; equipo: Persona[]; metodos: Metodo[]; yo: string; puedeOtros: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoCobro, FormData>(registrarVenta, {});
  const [clave, setClave] = useState(nuevaClave);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [barbero, setBarbero] = useState(p.equipo.some((e) => e.id === p.yo) ? p.yo : p.equipo[0]?.id ?? "");
  const [porLinea, setPorLinea] = useState<Record<string, string>>({});
  const [metodo, setMetodo] = useState(p.metodos[0]?.id ?? "");
  const [dividir, setDividir] = useState(false);
  const [metodo2, setMetodo2] = useState(p.metodos[1]?.id ?? "");
  const [monto1, setMonto1] = useState("");
  const [conDescuento, setConDescuento] = useState(false);
  const [descuento, setDescuento] = useState("");
  const [motivo, setMotivo] = useState("");
  const [propina, setPropina] = useState("");
  const [propinaEfectivo, setPropinaEfectivo] = useState(true);
  const [notas, setNotas] = useState("");
  const [ultima, setUltima] = useState<{ folio: string; total: number } | null>(null);

  // Después de cobrar: limpiar todo y preparar una venta nueva.
  useEffect(() => {
    if (estado.ok && estado.folio && estado.folio !== ultima?.folio) {
      setUltima({ folio: estado.folio, total: estado.total ?? 0 });
      setClave(nuevaClave()); setElegidos([]); setPorLinea({}); setDividir(false); setMonto1("");
      setConDescuento(false); setDescuento(""); setMotivo(""); setPropina(""); setNotas("");
    }
  }, [estado, ultima?.folio]);

  const lineas = elegidos.map((id, i) => ({ key: `${id}-${i}`, s: p.servicios.find((x) => x.id === id)!, barberoId: porLinea[`${id}-${i}`] ?? barbero }));
  const subtotal = lineas.reduce((a, l) => a + l.s.precio, 0);
  const desc = conDescuento ? leerPesos(descuento) ?? 0 : 0;
  const total = Math.max(subtotal - desc, 0);
  const prop = leerPesos(propina) ?? 0;
  const m1 = dividir ? Math.min(leerPesos(monto1) ?? 0, total) : total;
  const metodoActual = p.metodos.find((m) => m.id === metodo);

  const datos = useMemo(() => JSON.stringify({
    clave,
    lineas: lineas.map((l) => ({ servicioId: l.s.id, barberoId: l.barberoId })),
    descuento: desc,
    motivoDescuento: motivo,
    pagos: dividir ? [{ metodoId: metodo, monto: m1 }, { metodoId: metodo2, monto: total - m1 }] : [{ metodoId: metodo, monto: total }],
    propina: { monto: prop, barberoId: lineas[0]?.barberoId ?? barbero, efectivo: propinaEfectivo },
    observaciones: notas,
  }), [clave, lineas, desc, motivo, dividir, metodo, m1, metodo2, total, prop, barbero, propinaEfectivo, notas]);

  const alternar = (id: string) => setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const nombreDe = (id: string) => primerNombre(p.equipo.find((e) => e.id === id)?.nombre ?? "");

  return (
    <form action={accion} className="dos">
      <input type="hidden" name="datos" value={datos} />
      <div className="pila" style={{ gap: 26 }}>
        {ultima && (
          <p className="aviso ok" role="status">
            Venta <b>{ultima.folio}</b> cobrada por <b>{formatoDinero(ultima.total)}</b>.
          </p>
        )}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pila-chica">
          <legend className="lab" style={{ marginBottom: 12 }}>1. Qué se hizo</legend>
          <div className="tarjetas">
            {p.servicios.map((s) => (
              <label className="tarjeta" key={s.id}>
                <input type="checkbox" checked={elegidos.includes(s.id)} onChange={() => alternar(s.id)} />
                <div>
                  <b>{s.nombre}</b>
                  <small>{s.duracionMin} min</small>
                  <span className="precio">{formatoDinero(s.precio)}</span>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lab" style={{ marginBottom: 12 }}>2. Quién atendió</legend>
          <div className="opciones">
            {p.equipo.filter((e) => p.puedeOtros || e.id === p.yo).map((e) => (
              <label className="opcion" key={e.id}>
                <input type="radio" name="_barbero" checked={barbero === e.id} onChange={() => { setBarbero(e.id); setPorLinea({}); }} />
                <span>{primerNombre(e.nombre)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lab" style={{ marginBottom: 12 }}>3. Cómo pagó</legend>
          <div className="opciones">
            {p.metodos.map((m) => (
              <label className="opcion" key={m.id}>
                <input type="radio" name="_metodo" checked={metodo === m.id} onChange={() => { setMetodo(m.id); setPropinaEfectivo(m.esEfectivo); }} />
                <span>{m.nombre}</span>
              </label>
            ))}
          </div>
          {p.metodos.length > 1 && (
            <button type="button" className="enlace" style={{ marginTop: 12 }} onClick={() => setDividir((d) => !d)}>
              {dividir ? "Pagar con un solo método" : "Dividir el pago entre dos métodos"}
            </button>
          )}
          {dividir && (
            <div className="fila" style={{ marginTop: 12, alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: "1 1 140px" }}>
                <span>Con {metodoActual?.nombre.toLowerCase()}</span>
                <input className="input" inputMode="decimal" value={monto1} onChange={(e) => setMonto1(e.target.value)} placeholder="0" />
              </label>
              <label className="campo" style={{ flex: "1 1 160px" }}>
                <span>El resto, {formatoDinero(total - m1)}, con</span>
                <select className="input" value={metodo2} onChange={(e) => setMetodo2(e.target.value)}>
                  {p.metodos.filter((m) => m.id !== metodo).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>
            </div>
          )}
        </fieldset>
      </div>

      <aside className="glass panel" aria-label="Resumen de la venta">
        <span className="lab">Esta venta</span>
        {lineas.length === 0 ? (
          <p className="muted">Toca un servicio para empezar.</p>
        ) : (
          <div className="lista">
            {lineas.map((l) => (
              <div key={l.key}>
                <span>
                  <b>{l.s.nombre}</b>
                  {p.puedeOtros && p.equipo.length > 1 ? (
                    <select aria-label={`Quién hizo ${l.s.nombre}`} className="enlace" style={{ textDecoration: "none", display: "block", marginTop: 4 }}
                      value={l.barberoId} onChange={(e) => setPorLinea((x) => ({ ...x, [l.key]: e.target.value }))}>
                      {p.equipo.map((e) => <option key={e.id} value={e.id}>Atendió {primerNombre(e.nombre)}</option>)}
                    </select>
                  ) : (
                    <small>Atendió {nombreDe(l.barberoId)}</small>
                  )}
                </span>
                <span className="num">{formatoDinero(l.s.precio)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="separador" />
        {!conDescuento ? (
          <div className="renglon"><span>Descuento</span><button type="button" className="enlace" onClick={() => setConDescuento(true)}>Agregar</button></div>
        ) : (
          <div className="pila-chica">
            <div className="fila">
              <label className="campo" style={{ flex: "1 1 100px" }}><span>Descuento</span><input className="input" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" /></label>
              <label className="campo" style={{ flex: "2 1 160px" }}><span>Motivo</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: cliente frecuente" /></label>
            </div>
            <button type="button" className="enlace" onClick={() => { setConDescuento(false); setDescuento(""); setMotivo(""); }}>Quitar descuento</button>
          </div>
        )}
        <div className="fila" style={{ alignItems: "flex-end" }}>
          <label className="campo" style={{ flex: "1 1 120px" }}>
            <span>Propina para {nombreDe(lineas[0]?.barberoId ?? barbero) || "la barbera"}</span>
            <input className="input" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" />
          </label>
          <label className="fila" style={{ gap: 6, fontSize: 13, paddingBottom: 12 }}>
            <input type="checkbox" checked={propinaEfectivo} onChange={(e) => setPropinaEfectivo(e.target.checked)} /> En efectivo
          </label>
        </div>
        <p className="ayuda" style={{ marginTop: -6 }}>Va aparte. No cuenta como venta.</p>
        <label className="campo"><span>Notas (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
        <div className="separador" />
        <div className="renglon" style={{ alignItems: "center" }}>
          <span className="lab">Total</span>
          <span style={{ font: "800 40px/1 var(--f-display)" }}>{formatoDinero(total)}</span>
        </div>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        <button className="btn pri grande" disabled={enviando || lineas.length === 0}>
          {enviando ? "Guardando…" : `Cobrar ${formatoDinero(total)}`}
        </button>
      </aside>
    </form>
  );
}
