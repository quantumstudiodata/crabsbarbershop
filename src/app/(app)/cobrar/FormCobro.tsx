"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { registrarVenta, type EstadoCobro } from "./actions";

type Servicio = { id: string; nombre: string; duracionMin: number; precio: number; categoria: string };
type Persona = { id: string; nombre: string; avatar: string };
type Metodo = { id: string; nombre: string; esEfectivo: boolean };
type Linea = { key: string; servicioId: string; barberoId: string; cantidad: number };

const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const primerNombre = (n: string) => n.split(" ")[0];
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const iconoMetodo = (m: Metodo) => (m.esEfectivo ? "efectivo" : /tarjeta/i.test(m.nombre) ? "tarjeta" : /transfer/i.test(m.nombre) ? "cobro" : "etiqueta");

export function FormCobro(p: {
  servicios: Servicio[]; equipo: Persona[]; metodos: Metodo[]; yo: string; puedeOtros: boolean; limiteDescuento: number;
}) {
  const [estado, accion, enviando] = useActionState<EstadoCobro, FormData>(registrarVenta, {});
  const [clave, setClave] = useState(nuevaClave);
  const [lineas, setLineas] = useState<Linea[]>([]);
  // Quien inició sesión atiende por defecto; se puede cambiar porque la computadora es compartida.
  const [barbero, setBarbero] = useState(p.equipo.some((e) => e.id === p.yo) ? p.yo : p.equipo[0]?.id ?? "");
  const [buscar, setBuscar] = useState("");
  const [metodo, setMetodo] = useState(p.metodos[0]?.id ?? "");
  const [dividir, setDividir] = useState(false);
  const [metodo2, setMetodo2] = useState(p.metodos[1]?.id ?? "");
  const [monto1, setMonto1] = useState("");
  const [recibido, setRecibido] = useState("");
  const [panel, setPanel] = useState<"descuento" | "propina" | null>(null);
  const [descuento, setDescuento] = useState<{ tipo: "pct" | "fijo"; valor: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [propina, setPropina] = useState<{ tipo: "pct" | "fijo"; valor: string } | null>(null);
  const [ultima, setUltima] = useState<{ folio: string; total: number } | null>(null);
  const raiz = useRef<HTMLFormElement>(null);

  const limpiar = () => {
    setClave(nuevaClave()); setLineas([]); setDividir(false); setMonto1(""); setRecibido(""); setBuscar("");
    setPanel(null); setDescuento(null); setMotivo(""); setPropina(null);
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

  /** Mueve el foco al paso más cercano en una dirección (flechas) o al siguiente en orden (Enter). */
  const mover = (desde: HTMLElement, dir: "sig" | "ant" | "arriba" | "abajo" | "izq" | "der") => {
    const pasos = [...(raiz.current?.querySelectorAll<HTMLElement>("[data-paso]") ?? [])].filter((x) => x.offsetParent !== null && !(x as HTMLButtonElement).disabled);
    const i = pasos.indexOf(desde);
    if (dir === "sig" || dir === "ant") { pasos[dir === "sig" ? Math.min(i + 1, pasos.length - 1) : Math.max(i - 1, 0)]?.focus(); return; }
    const a = desde.getBoundingClientRect();
    const ca = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    let mejor: HTMLElement | null = null, distancia = Infinity;
    for (const p of pasos) {
      if (p === desde) continue;
      const b = p.getBoundingClientRect();
      const cb = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      const dx = cb.x - ca.x, dy = cb.y - ca.y;
      const ok = dir === "abajo" ? dy > 4 : dir === "arriba" ? dy < -4 : dir === "der" ? dx > 4 && Math.abs(dy) < a.height : dx < -4 && Math.abs(dy) < a.height;
      if (!ok) continue;
      const d = dir === "abajo" || dir === "arriba" ? Math.abs(dy) * 2 + Math.abs(dx) : Math.abs(dx) + Math.abs(dy) * 3;
      if (d < distancia) { distancia = d; mejor = p; }
    }
    mejor?.focus();
  };

  // Atajos: Enter y flechas avanzan, Esc limpia, D descuento, P propina.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (document.querySelector(".capa")) return;
      const t = e.target as HTMLElement;
      const escribiendo = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      const enPaso = t.dataset.paso !== undefined;
      if (e.key === "Escape") { if (escribiendo) t.blur(); else limpiar(); return; }
      if (e.key === "Enter") {
        if (t.dataset.paso === "cobrar") return;
        if (enPaso) { e.preventDefault(); mover(t, e.shiftKey ? "ant" : "sig"); return; }
        if (!escribiendo && t.tagName !== "BUTTON" && t.tagName !== "A") { e.preventDefault(); raiz.current?.querySelector<HTMLElement>("[data-paso]")?.focus(); }
        return;
      }
      const flechas: Record<string, "arriba" | "abajo" | "izq" | "der"> = { ArrowUp: "arriba", ArrowDown: "abajo", ArrowLeft: "izq", ArrowRight: "der" };
      if (flechas[e.key]) {
        // En un campo de texto, izquierda y derecha mueven el cursor del texto.
        if (escribiendo && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
        if (enPaso) { e.preventDefault(); mover(t, flechas[e.key]); return; }
        if (!escribiendo && t.tagName !== "BUTTON") { e.preventDefault(); raiz.current?.querySelector<HTMLElement>("[data-paso]")?.focus(); }
        return;
      }
      if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "d") { e.preventDefault(); setPanel((x) => (x === "descuento" ? null : "descuento")); }
      if (k === "p") { e.preventDefault(); setPanel((x) => (x === "propina" ? null : "propina")); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const conServicio = lineas.map((l) => ({ ...l, s: p.servicios.find((x) => x.id === l.servicioId)! })).filter((l) => l.s);
  const subtotal = conServicio.reduce((a, l) => a + l.s.precio * l.cantidad, 0);
  const calc = (x: { tipo: "pct" | "fijo"; valor: string } | null, base: number) =>
    !x ? 0 : x.tipo === "pct" ? Math.round((base * (Number(x.valor) || 0)) / 100) : leerPesos(x.valor) ?? 0;
  const desc = Math.min(calc(descuento, subtotal), subtotal);
  const total = Math.max(subtotal - desc, 0);
  const prop = calc(propina, total);
  const m1 = dividir ? Math.min(leerPesos(monto1) ?? 0, total) : total;
  const metodoActual = p.metodos.find((m) => m.id === metodo);
  const pasaLimite = desc > Math.floor((subtotal * p.limiteDescuento) / 100);
  const efectivoSolo = !dividir && metodoActual?.esEfectivo;
  const pagaCon = leerPesos(recibido);
  // La propina se paga igual que la venta.
  const propinaEfectivo = !!metodoActual?.esEfectivo;
  const aCobrarEfectivo = total + (propinaEfectivo ? prop : 0);
  const cambioC = pagaCon !== null ? pagaCon - aCobrarEfectivo : null;

  const datos = useMemo(() => JSON.stringify({
    clave,
    lineas: conServicio.flatMap((l) => Array.from({ length: l.cantidad }, () => ({ servicioId: l.servicioId, barberoId: l.barberoId }))),
    descuento: desc,
    motivoDescuento: desc > 0 ? motivo || "Sin motivo" : "",
    pagos: dividir ? [{ metodoId: metodo, monto: m1 }, { metodoId: metodo2, monto: total - m1 }] : [{ metodoId: metodo, monto: total }],
    propina: { monto: prop, barberoId: conServicio[0]?.barberoId ?? barbero, efectivo: propinaEfectivo },
    observaciones: "",
  }), [clave, conServicio, desc, motivo, dividir, metodo, m1, metodo2, total, prop, barbero, propinaEfectivo]);

  const alternar = (id: string) => {
    setUltima(null);
    setLineas((xs) => (xs.some((l) => l.servicioId === id) ? xs.filter((l) => l.servicioId !== id) : [...xs, { key: nuevaClave(), servicioId: id, barberoId: barbero, cantidad: 1 }]));
  };
  const cantidad = (key: string, d: number) => setLineas((xs) => xs.flatMap((l) => (l.key !== key ? [l] : l.cantidad + d <= 0 ? [] : [{ ...l, cantidad: Math.min(l.cantidad + d, 9) }])));
  const quien = (key: string, id: string) => setLineas((xs) => xs.map((l) => (l.key === key ? { ...l, barberoId: id } : l)));
  const elegirBarbero = (id: string) => { setBarbero(id); setLineas((xs) => xs.map((l) => ({ ...l, barberoId: id }))); };
  const nombreDe = (id: string) => primerNombre(p.equipo.find((e) => e.id === id)?.nombre ?? "");
  const filtro = sinAcentos(buscar.trim());
  const visibles = p.servicios.filter((s) => !filtro || sinAcentos(`${s.nombre} ${s.categoria}`).includes(filtro));
  const categorias = [...new Set(visibles.map((s) => s.categoria))];
  const personas = p.equipo.filter((e) => p.puedeOtros || e.id === p.yo);

  return (
    <form action={accion} className="cobro" ref={raiz}>
      <input type="hidden" name="datos" value={datos} />
      <div className="pila" style={{ gap: 22 }}>
        <label className="con-icono buscador">
          <Icono n="buscar" />
          <input className="input" data-paso="" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar servicio" aria-label="Buscar servicio" autoComplete="off" />
        </label>

        {categorias.length === 0 && <p className="muted">No hay servicios con ese nombre.</p>}
        {categorias.map((c) => (
          <section key={c} className="pila-chica">
            <span className="lab">{c}</span>
            <div className="servicios-g">
              {visibles.filter((s) => s.categoria === c).map((s) => {
                const l = lineas.find((x) => x.servicioId === s.id);
                return (
                  <button type="button" key={s.id} data-paso="" className="svc" aria-pressed={!!l} onClick={() => alternar(s.id)}>
                    <span><b style={{ fontWeight: 600 }}>{s.nombre}</b><small>{s.duracionMin} min</small></span>
                    {l ? <span className="q">{l.cantidad > 1 ? `x${l.cantidad}` : <Icono n="palomita" className="ic" />}</span> : <span className="num">{formatoDinero(s.precio)}</span>}
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
              <button type="button" key={e.id} data-paso="" role="radio" aria-checked={barbero === e.id} aria-pressed={barbero === e.id} className="per" onClick={() => elegirBarbero(e.id)}>
                <Avatar avatar={e.avatar} nombre={e.nombre} t={30} />{primerNombre(e.nombre)}
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="glass ticket" aria-label="Esta venta">
        <h2 className="titulo">Esta venta</h2>
        {ultima && lineas.length === 0 && (
          <p className="aviso ok" role="status">Venta <b>{ultima.folio}</b> cobrada por <b>{formatoDinero(ultima.total)}</b>.</p>
        )}
        {conServicio.length > 0 && (
          <div className="lineas">
            {conServicio.map((l) => (
              <div key={l.key} className="linea-t">
                <span style={{ minWidth: 0 }}>
                  <b>{l.s.nombre}</b>
                  {p.puedeOtros && personas.length > 1 ? (
                    <Selector className="mini" etiqueta={`Quién hizo ${l.s.nombre}`} valor={l.barberoId} onChange={(v) => quien(l.key, v)}
                      opciones={personas.map((e) => ({ valor: e.id, texto: primerNombre(e.nombre), icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={18} /> }))} />
                  ) : <small>{nombreDe(l.barberoId)}</small>}
                </span>
                <span className="cant" aria-label={`Cantidad de ${l.s.nombre}`}>
                  <button type="button" onClick={() => cantidad(l.key, -1)} aria-label="Uno menos">−</button>
                  <b>{l.cantidad}</b>
                  <button type="button" onClick={() => cantidad(l.key, 1)} aria-label="Uno más">+</button>
                </span>
                <span className="num">{formatoDinero(l.s.precio * l.cantidad)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="extras">
          <button type="button" className={`chipf ${panel === "descuento" || desc ? "on" : ""}`} aria-expanded={panel === "descuento"} onClick={() => setPanel((x) => (x === "descuento" ? null : "descuento"))}>
            <Icono n="etiqueta" />{desc ? `Descuento −${formatoDinero(desc)}` : "Descuento"}
          </button>
          <button type="button" className={`chipf ${panel === "propina" || prop ? "on" : ""}`} aria-expanded={panel === "propina"} onClick={() => setPanel((x) => (x === "propina" ? null : "propina"))}>
            <Icono n="mas" />{prop ? `Propina ${formatoDinero(prop)}` : "Propina"}
          </button>
          {p.metodos.length > 1 && (
            <button type="button" className={`chipf ${dividir ? "on" : ""}`} aria-pressed={dividir} onClick={() => setDividir((d) => !d)}><Icono n="cobro" />Dividir pago</button>
          )}
        </div>

        {panel === "descuento" && (
          <div className="panel-rapido subir">
            <div className="billetes">
              {[5, 10, 20].map((v) => (
                <button type="button" key={v} className={descuento?.tipo === "pct" && descuento.valor === String(v) ? "on" : ""} onClick={() => setDescuento({ tipo: "pct", valor: String(v) })}>
                  {v}% <small>{formatoDinero(Math.round((subtotal * v) / 100))}</small>
                </button>
              ))}
              <span className="otra"><span>Fijo</span><input inputMode="decimal" placeholder="$0" value={descuento?.tipo === "fijo" ? descuento.valor : ""} onChange={(e) => setDescuento(e.target.value ? { tipo: "fijo", valor: e.target.value } : null)} aria-label="Descuento fijo" /></span>
              {descuento && <button type="button" className="quitar" onClick={() => { setDescuento(null); setMotivo(""); }}>Quitar</button>}
            </div>
            <div className="billetes">
              {["Cliente frecuente", "Promoción", "Cortesía"].map((x) => <button type="button" key={x} className={motivo === x ? "on" : ""} onClick={() => setMotivo(x)}>{x}</button>)}
              <span className="otra ancho"><input placeholder="Otro motivo" value={["Cliente frecuente", "Promoción", "Cortesía"].includes(motivo) ? "" : motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo del descuento" /></span>
            </div>
            {pasaLimite && <small className="muted">Pasa del {p.limiteDescuento}% permitido. Solo el encargado o el propietario pueden registrarlo.</small>}
          </div>
        )}
        {panel === "propina" && (
          <div className="panel-rapido subir">
            <div className="billetes">
              {[5, 10, 15].map((v) => (
                <button type="button" key={v} className={propina?.tipo === "pct" && propina.valor === String(v) ? "on" : ""} onClick={() => setPropina({ tipo: "pct", valor: String(v) })}>
                  {v}% <small>{formatoDinero(Math.round((total * v) / 100))}</small>
                </button>
              ))}
              <span className="otra"><span>Otra</span><input inputMode="decimal" placeholder="$0" value={propina?.tipo === "fijo" ? propina.valor : ""} onChange={(e) => setPropina(e.target.value ? { tipo: "fijo", valor: e.target.value } : null)} aria-label="Otra cantidad de propina" /></span>
              {propina && <button type="button" className="quitar" onClick={() => setPropina(null)}>Quitar</button>}
            </div>
            <small className="muted">Es para {nombreDe(conServicio[0]?.barberoId ?? barbero) || "quien atendió"}. No suma a las ventas.</small>
          </div>
        )}

        <div className="metodos" role="radiogroup" aria-label="Forma de pago">
          {p.metodos.map((m) => (
            <button type="button" key={m.id} data-paso="" role="radio" aria-checked={metodo === m.id} className="metodo" onClick={() => {
              setMetodo(m.id);
              if (metodo2 === m.id) setMetodo2(p.metodos.find((x) => x.id !== m.id)?.id ?? "");
            }}>
              <Icono n={iconoMetodo(m)} />{m.nombre}
            </button>
          ))}
        </div>
        {dividir && (
          <div className="panel-rapido subir">
            <div className="fila" style={{ gap: 10, flexWrap: "nowrap" }}>
              <span className="otra ancho"><span>{metodoActual?.nombre}</span><input inputMode="decimal" placeholder="$0" value={monto1} onChange={(e) => setMonto1(e.target.value)} aria-label={`Monto con ${metodoActual?.nombre}`} autoFocus /></span>
              <span className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>Faltan <b style={{ color: "var(--fg)" }}>{formatoDinero(total - m1)}</b></span>
            </div>
            <div className="billetes">
              {p.metodos.filter((m) => m.id !== metodo).map((m) => <button type="button" key={m.id} className={metodo2 === m.id ? "on" : ""} onClick={() => setMetodo2(m.id)}>con {m.nombre.toLowerCase()}</button>)}
            </div>
          </div>
        )}
        {efectivoSolo && total > 0 && (
          <div className="pago-con">
            <span className="otra ancho"><span>Paga con</span><input data-paso="" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={formatoDinero(aCobrarEfectivo)} aria-label="Con cuánto paga" /></span>
            <div className="cambio" aria-live="polite">
              <span className="lab">Cambio</span>
              <b className={cambioC !== null && cambioC < 0 ? "falta" : ""}>{cambioC === null ? "$0" : cambioC < 0 ? `Faltan ${formatoDinero(-cambioC)}` : formatoDinero(cambioC)}</b>
            </div>
            <div className="billetes">
              {[20000, 50000, 100000].filter((b) => b >= aCobrarEfectivo).slice(0, 2).map((b) => <button type="button" key={b} onClick={() => setRecibido(String(b / 100))}>{formatoDinero(b)}</button>)}
              <button type="button" onClick={() => setRecibido(String(aCobrarEfectivo / 100))}>Exacto</button>
            </div>
          </div>
        )}

        <div className="separador" />
        <div className="renglon" style={{ alignItems: "center" }}>
          <span className="lab">Total{prop > 0 ? ` más ${formatoDinero(prop)} de propina` : ""}</span>
          <span className="big">{formatoDinero(total)}</span>
        </div>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        <button className="bt grande" data-paso="cobrar" disabled={enviando || lineas.length === 0}>{enviando ? "Guardando…" : `Cobrar ${formatoDinero(total)}`}<Fl /></button>
        <div className="atajos" aria-label="Atajos de teclado">
          <span><span className="k">Enter</span> o <span className="k">flechas</span> Moverse</span>
          <span><span className="k">D</span> Descuento</span>
          <span><span className="k">P</span> Propina</span>
          <span><span className="k">Esc</span> Limpiar</span>
        </div>
      </aside>
    </form>
  );
}
