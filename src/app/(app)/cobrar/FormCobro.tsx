"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Selector } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { registrarVenta, type EstadoCobro } from "./actions";

type Servicio = { id: string; nombre: string; duracionMin: number; precio: number; categoria: string };
type Persona = { id: string; nombre: string; avatar: string };
type Metodo = { id: string; nombre: string; esEfectivo: boolean };

const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const primerNombre = (n: string) => n.split(" ")[0];
export const mostrarCaja = (pestana = "resumen") => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: pestana }));

export function FormCobro(p: {
  servicios: Servicio[]; equipo: Persona[]; metodos: Metodo[]; yo: string; puedeOtros: boolean; limiteDescuento: number;
  caja: { desde: string; deOtroDia: boolean } | null; siguienteFolio: string; opera: boolean;
}) {
  const [estado, accion, enviando] = useActionState<EstadoCobro, FormData>(registrarVenta, {});
  const [clave, setClave] = useState(nuevaClave);
  const [elegidos, setElegidos] = useState<string[]>([]);
  // Quien inició sesión atiende por defecto; se puede cambiar porque la computadora es compartida.
  const yoAtiendo = p.equipo.some((e) => e.id === p.yo);
  const [barbero, setBarbero] = useState(yoAtiendo ? p.yo : p.equipo[0]?.id ?? "");
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
  const refDescuento = useRef<HTMLInputElement>(null);
  const refPropina = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setClave(nuevaClave()); setElegidos([]); setPorLinea({}); setDividir(false); setMonto1("");
    setConDescuento(false); setDescuento(""); setMotivo(""); setPropina(""); setNotas("");
  };

  // Después de cobrar: limpiar todo y preparar una venta nueva (una sola vez por folio).
  const atendido = useRef<string | null>(null);
  useEffect(() => {
    if (estado.ok && estado.folio && estado.folio !== atendido.current) {
      atendido.current = estado.folio;
      setUltima({ folio: estado.folio, total: estado.total ?? 0 });
      limpiar();
    }
  }, [estado]);

  // Atajos: Esc limpia, D descuento, P propina.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (document.querySelector(".capa")) return;
      const t = e.target as HTMLElement;
      const escribiendo = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      if (e.key === "Escape") { if (escribiendo) t.blur(); else limpiar(); return; }
      if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "d") { e.preventDefault(); setConDescuento(true); setTimeout(() => refDescuento.current?.focus(), 0); }
      if (k === "p") { e.preventDefault(); refPropina.current?.focus(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const lineas = elegidos.map((id, i) => ({ key: `${id}-${i}`, s: p.servicios.find((x) => x.id === id)!, barberoId: porLinea[`${id}-${i}`] ?? barbero })).filter((l) => l.s);
  const subtotal = lineas.reduce((a, l) => a + l.s.precio, 0);
  const desc = conDescuento ? Math.min(leerPesos(descuento) ?? 0, subtotal) : 0;
  const total = Math.max(subtotal - desc, 0);
  const prop = leerPesos(propina) ?? 0;
  const m1 = dividir ? Math.min(leerPesos(monto1) ?? 0, total) : total;
  const metodoActual = p.metodos.find((m) => m.id === metodo);
  const pasaLimite = desc > Math.floor((subtotal * p.limiteDescuento) / 100);

  const datos = useMemo(() => JSON.stringify({
    clave,
    lineas: lineas.map((l) => ({ servicioId: l.s.id, barberoId: l.barberoId })),
    descuento: desc,
    motivoDescuento: motivo,
    pagos: dividir ? [{ metodoId: metodo, monto: m1 }, { metodoId: metodo2, monto: total - m1 }] : [{ metodoId: metodo, monto: total }],
    propina: { monto: prop, barberoId: lineas[0]?.barberoId ?? barbero, efectivo: propinaEfectivo },
    observaciones: notas,
  }), [clave, lineas, desc, motivo, dividir, metodo, m1, metodo2, total, prop, barbero, propinaEfectivo, notas]);

  const alternar = (id: string) => { setUltima(null); setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])); };
  const nombreDe = (id: string) => primerNombre(p.equipo.find((e) => e.id === id)?.nombre ?? "");
  const categorias = [...new Set(p.servicios.map((s) => s.categoria))];
  const personas = p.equipo.filter((e) => p.puedeOtros || e.id === p.yo);

  return (
    <form action={accion} className="cobro">
      <input type="hidden" name="datos" value={datos} />
      <div className="pila" style={{ gap: 28 }}>
        <div className="entre">
          {p.caja ? (
            <span className="estado-caja">
              <span className="vivo" style={{ color: p.caja.deOtroDia ? "var(--warn)" : undefined }}>{p.caja.deOtroDia ? "Caja abierta desde ayer" : `Caja abierta desde las ${p.caja.desde}`}</span>
              <span className="folio">Folio {p.siguienteFolio}</span>
            </span>
          ) : (
            <span className="estado-caja"><span className="vivo apagado">Caja cerrada</span></span>
          )}
          {p.opera && <button type="button" className="icb" onClick={() => mostrarCaja()} aria-label="Abrir la caja" title="Caja"><Icono n="caja" /></button>}
        </div>

        {categorias.map((c) => (
          <section key={c} className="pila-chica">
            <span className="lab">{c}</span>
            <div className="servicios-g">
              {p.servicios.filter((s) => s.categoria === c).map((s) => {
                const n = elegidos.filter((x) => x === s.id).length;
                return (
                  <button type="button" key={s.id} className="svc" aria-pressed={n > 0} onClick={() => alternar(s.id)}>
                    <span><b style={{ fontWeight: 600 }}>{s.nombre}</b><small>{s.duracionMin} min</small></span>
                    {n > 0 ? <span className="q"><Icono n="palomita" className="ic" /></span> : <span className="num">{formatoDinero(s.precio)}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="pila-chica">
          <span className="lab">Atendió</span>
          <div className="personas-s" role="radiogroup" aria-label="Quién atendió">
            {personas.map((e) => (
              <button type="button" key={e.id} role="radio" aria-checked={barbero === e.id} aria-pressed={barbero === e.id} className="per" onClick={() => { setBarbero(e.id); setPorLinea({}); }}>
                <Avatar avatar={e.avatar} nombre={e.nombre} t={30} />{primerNombre(e.nombre)}
              </button>
            ))}
          </div>
        </section>

        <section className="pila-chica">
          <span className="lab">Cómo pagó</span>
          <div className="seg" role="radiogroup" aria-label="Forma de pago">
            {p.metodos.map((m) => (
              <label key={m.id}>
                <input type="radio" name="_metodo" checked={metodo === m.id} onChange={() => { setMetodo(m.id); setPropinaEfectivo(m.esEfectivo); if (metodo2 === m.id) setMetodo2(p.metodos.find((x) => x.id !== m.id)?.id ?? ""); }} />
                {m.nombre}
              </label>
            ))}
          </div>
          {p.metodos.length > 1 && (
            <button type="button" className="enlace" style={{ justifySelf: "start", marginTop: 4 }} onClick={() => setDividir((d) => !d)}>
              {dividir ? "Pagar con una sola forma" : "Dividir el pago entre dos formas"}
            </button>
          )}
          {dividir && (
            <div className="fila" style={{ alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: "1 1 140px" }}>
                <span>Con {metodoActual?.nombre.toLowerCase()}</span>
                <input className="input" inputMode="decimal" value={monto1} onChange={(e) => setMonto1(e.target.value)} placeholder="0" />
              </label>
              <div className="campo" style={{ flex: "1 1 180px" }}>
                <span>El resto, {formatoDinero(total - m1)}, con</span>
                <Selector etiqueta="Segunda forma de pago" valor={metodo2} onChange={setMetodo2} opciones={p.metodos.filter((m) => m.id !== metodo).map((m) => ({ valor: m.id, texto: m.nombre }))} />
              </div>
            </div>
          )}
        </section>
      </div>

      <aside className="glass ticket" aria-label="Esta venta">
        <h2 className="titulo">Esta venta</h2>
        {ultima && lineas.length === 0 && (
          <p className="aviso ok" role="status">Venta <b>{ultima.folio}</b> cobrada por <b>{formatoDinero(ultima.total)}</b>.</p>
        )}
        {lineas.length === 0 ? (
          <p className="muted">Toca los servicios que se hicieron.<br />Si fueron varios, tócalos todos.</p>
        ) : (
          <div className="lista">
            {lineas.map((l) => (
              <div key={l.key}>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{l.s.nombre}</b>
                  {p.puedeOtros && personas.length > 1 ? (
                    <span style={{ display: "block", marginTop: 6, maxWidth: 220 }}>
                      <Selector etiqueta={`Quién hizo ${l.s.nombre}`} valor={l.barberoId} onChange={(v) => setPorLinea((x) => ({ ...x, [l.key]: v }))}
                        opciones={personas.map((e) => ({ valor: e.id, texto: `Atendió ${primerNombre(e.nombre)}`, icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={22} /> }))} />
                    </span>
                  ) : <small>Atendió {nombreDe(l.barberoId)}</small>}
                </span>
                <span className="num">{formatoDinero(l.s.precio)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="separador" />
        {!conDescuento ? (
          <div className="renglon"><span className="muted">Descuento</span><button type="button" className="enlace" onClick={() => { setConDescuento(true); setTimeout(() => refDescuento.current?.focus(), 0); }}>Agregar</button></div>
        ) : (
          <div className="pila-chica">
            <div className="fila">
              <label className="campo" style={{ flex: "1 1 100px" }}><span>Descuento</span><input ref={refDescuento} className="input" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" /></label>
              <label className="campo" style={{ flex: "2 1 160px" }}><span>Motivo</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: cliente frecuente" /></label>
            </div>
            {pasaLimite && <small className="muted">Pasa del {p.limiteDescuento}% permitido. Solo el encargado o el propietario pueden registrarlo.</small>}
            <button type="button" className="enlace" style={{ justifySelf: "start" }} onClick={() => { setConDescuento(false); setDescuento(""); setMotivo(""); }}>Quitar descuento</button>
          </div>
        )}
        <div className="fila" style={{ alignItems: "flex-end" }}>
          <label className="campo" style={{ flex: "1 1 130px" }}>
            <span>Propina<Ayuda titulo="Propina">Es de {nombreDe(lineas[0]?.barberoId ?? barbero) || "quien atendió"}. No cuenta como venta ni entra en la comisión.</Ayuda></span>
            <input ref={refPropina} className="input" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" />
          </label>
          <label className="fila" style={{ gap: 8, fontSize: 13, paddingBottom: 12 }}>
            <Interruptor etiqueta="Propina en efectivo" checked={propinaEfectivo} onChange={setPropinaEfectivo} /> En efectivo
          </label>
        </div>
        <label className="campo"><span>Notas</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" /></label>
        <div className="separador" />
        <div className="renglon" style={{ alignItems: "center" }}>
          <span className="lab">Total</span>
          <span className="big">{formatoDinero(total)}</span>
        </div>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        {p.caja ? (
          <button className="bt grande" disabled={enviando || lineas.length === 0}>{enviando ? "Guardando…" : `Cobrar ${formatoDinero(total)}`}<Fl /></button>
        ) : p.opera ? (
          <button type="button" className="bt grande" onClick={() => mostrarCaja()}>Abrir la caja para cobrar<Fl /></button>
        ) : (
          <p className="aviso">La caja está cerrada.<br />Pide al encargado que la abra.</p>
        )}
        <div className="atajos" aria-label="Atajos de teclado">
          <span><span className="k">Esc</span> Limpiar</span>
          <span><span className="k">D</span> Descuento</span>
          <span><span className="k">P</span> Propina</span>
        </div>
      </aside>
    </form>
  );
}
