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
type Linea = { key: string; servicioId: string; barberoId: string; cantidad: number };

const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const primerNombre = (n: string) => n.split(" ")[0];
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const iconoMetodo = (m: Metodo) => (m.esEfectivo ? "efectivo" : /tarjeta/i.test(m.nombre) ? "tarjeta" : /transfer/i.test(m.nombre) ? "cobro" : "etiqueta");

export function FormCobro(p: {
  servicios: Servicio[]; equipo: Persona[]; metodos: Metodo[]; yo: string; puedeOtros: boolean; limiteDescuento: number; cajaAbierta: boolean;
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
  const [conDescuento, setConDescuento] = useState(false);
  const [descuento, setDescuento] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conPropina, setConPropina] = useState(false);
  const [propina, setPropina] = useState("");
  const [propinaEfectivo, setPropinaEfectivo] = useState(true);
  const [ultima, setUltima] = useState<{ folio: string; total: number } | null>(null);
  const refDescuento = useRef<HTMLInputElement>(null);
  const refPropina = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLFormElement>(null);

  const limpiar = () => {
    setClave(nuevaClave()); setLineas([]); setDividir(false); setMonto1(""); setRecibido(""); setBuscar("");
    setConDescuento(false); setDescuento(""); setMotivo(""); setConPropina(false); setPropina("");
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

  /** Enter avanza al siguiente paso, como en una caja registradora. Shift + Enter regresa. */
  const avanzar = (desde: HTMLElement, atras = false) => {
    const pasos = [...(raiz.current?.querySelectorAll<HTMLElement>("[data-paso]") ?? [])].filter((x) => x.offsetParent !== null && !(x as HTMLButtonElement).disabled);
    const i = pasos.indexOf(desde);
    const sig = pasos[atras ? Math.max(i - 1, 0) : Math.min(i + 1, pasos.length - 1)];
    sig?.focus();
  };

  // Atajos: Esc limpia, D descuento, P propina, Enter avanza.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (document.querySelector(".capa")) return;
      const t = e.target as HTMLElement;
      const escribiendo = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      if (e.key === "Escape") { if (escribiendo) t.blur(); else limpiar(); return; }
      if (e.key === "Enter") {
        if (t.dataset.paso === "cobrar") return;
        if (t.dataset.paso !== undefined) { e.preventDefault(); avanzar(t, e.shiftKey); return; }
        if (!escribiendo && t.tagName !== "BUTTON" && t.tagName !== "A") { e.preventDefault(); raiz.current?.querySelector<HTMLElement>("[data-paso]")?.focus(); }
        return;
      }
      if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "d") { e.preventDefault(); setConDescuento(true); setTimeout(() => refDescuento.current?.focus(), 0); }
      if (k === "p") { e.preventDefault(); setConPropina(true); setTimeout(() => refPropina.current?.focus(), 0); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const conServicio = lineas.map((l) => ({ ...l, s: p.servicios.find((x) => x.id === l.servicioId)! })).filter((l) => l.s);
  const subtotal = conServicio.reduce((a, l) => a + l.s.precio * l.cantidad, 0);
  const desc = conDescuento ? Math.min(leerPesos(descuento) ?? 0, subtotal) : 0;
  const total = Math.max(subtotal - desc, 0);
  const prop = conPropina ? leerPesos(propina) ?? 0 : 0;
  const m1 = dividir ? Math.min(leerPesos(monto1) ?? 0, total) : total;
  const metodoActual = p.metodos.find((m) => m.id === metodo);
  const pasaLimite = desc > Math.floor((subtotal * p.limiteDescuento) / 100);
  const efectivoSolo = !dividir && metodoActual?.esEfectivo;
  const pagaCon = leerPesos(recibido);
  const aCobrarEfectivo = total + (propinaEfectivo ? prop : 0);
  const cambioC = pagaCon !== null ? pagaCon - aCobrarEfectivo : null;

  const datos = useMemo(() => JSON.stringify({
    clave,
    lineas: conServicio.flatMap((l) => Array.from({ length: l.cantidad }, () => ({ servicioId: l.servicioId, barberoId: l.barberoId }))),
    descuento: desc,
    motivoDescuento: motivo,
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
        {conServicio.length === 0 ? (
          <p className="muted">Toca los servicios que se hicieron.<br />Si fueron varios, tócalos todos.</p>
        ) : (
          <div className="lineas">
            {conServicio.map((l) => (
              <div key={l.key} className="linea-t">
                <span style={{ minWidth: 0 }}>
                  <b>{l.s.nombre}</b>
                  {p.puedeOtros && personas.length > 1 ? (
                    <span style={{ display: "block", marginTop: 6, maxWidth: 210 }}>
                      <Selector etiqueta={`Quién hizo ${l.s.nombre}`} valor={l.barberoId} onChange={(v) => quien(l.key, v)}
                        opciones={personas.map((e) => ({ valor: e.id, texto: `Atendió ${primerNombre(e.nombre)}`, icono: <Avatar avatar={e.avatar} nombre={e.nombre} t={22} /> }))} />
                    </span>
                  ) : <small>Atendió {nombreDe(l.barberoId)}</small>}
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

        <div className="fila" style={{ gap: 8 }}>
          <button type="button" className={`chipf ${conDescuento ? "on" : ""}`} aria-pressed={conDescuento} onClick={() => { const v = !conDescuento; setConDescuento(v); if (v) setTimeout(() => refDescuento.current?.focus(), 0); else { setDescuento(""); setMotivo(""); } }}>
            <Icono n="etiqueta" />Descuento
          </button>
          <button type="button" className={`chipf ${conPropina ? "on" : ""}`} aria-pressed={conPropina} onClick={() => { const v = !conPropina; setConPropina(v); if (v) setTimeout(() => refPropina.current?.focus(), 0); else setPropina(""); }}>
            <Icono n="mas" />Propina
          </button>
          <Ayuda titulo="Descuento y propina">El descuento se resta de la venta y pide un motivo.<br /><br />La propina es de quien atendió. Se guarda aparte: no suma a las ventas ni a la comisión.</Ayuda>
        </div>
        {conDescuento && (
          <div className="caja-campos subir">
            <div className="fila">
              <label className="campo" style={{ flex: "1 1 100px" }}><span>Descuento</span><input ref={refDescuento} className="input" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="$0" /></label>
              <label className="campo" style={{ flex: "2 1 160px" }}><span>Motivo</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: cliente frecuente" /></label>
            </div>
            {pasaLimite && <small className="muted">Pasa del {p.limiteDescuento}% permitido. Solo el encargado o el propietario pueden registrarlo.</small>}
          </div>
        )}
        {conPropina && (
          <div className="caja-campos subir">
            <div className="fila" style={{ alignItems: "flex-end" }}>
              <label className="campo" style={{ flex: "1 1 120px" }}><span>Propina para {nombreDe(conServicio[0]?.barberoId ?? barbero) || "quien atendió"}</span><input ref={refPropina} className="input" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="$0" /></label>
              <label className="fila" style={{ gap: 8, fontSize: 13, paddingBottom: 12 }}><Interruptor etiqueta="Propina en efectivo" checked={propinaEfectivo} onChange={setPropinaEfectivo} />En efectivo</label>
            </div>
          </div>
        )}

        <div className="pila-chica">
          <div className="entre">
            <span className="lab">Forma de pago</span>
            {p.metodos.length > 1 && <button type="button" className={`chipf mini ${dividir ? "on" : ""}`} aria-pressed={dividir} onClick={() => setDividir((d) => !d)}>Dividir entre dos</button>}
          </div>
          <div className="metodos" role="radiogroup" aria-label="Forma de pago">
            {p.metodos.map((m) => (
              <button type="button" key={m.id} data-paso="" role="radio" aria-checked={metodo === m.id} className="metodo" onClick={() => {
                setMetodo(m.id); setPropinaEfectivo(m.esEfectivo);
                if (metodo2 === m.id) setMetodo2(p.metodos.find((x) => x.id !== m.id)?.id ?? "");
              }}>
                <Icono n={iconoMetodo(m)} />{m.nombre}
              </button>
            ))}
          </div>
          {dividir && (
            <div className="caja-campos subir">
              <div className="fila" style={{ alignItems: "flex-end" }}>
                <label className="campo" style={{ flex: "1 1 130px" }}><span>Con {metodoActual?.nombre.toLowerCase()}</span><input className="input" inputMode="decimal" value={monto1} onChange={(e) => setMonto1(e.target.value)} placeholder="$0" /></label>
                <div className="campo" style={{ flex: "1 1 170px" }}>
                  <span>El resto, {formatoDinero(total - m1)}, con</span>
                  <Selector etiqueta="Segunda forma de pago" valor={metodo2} onChange={setMetodo2} opciones={p.metodos.filter((m) => m.id !== metodo).map((m) => ({ valor: m.id, texto: m.nombre }))} />
                </div>
              </div>
            </div>
          )}
          {efectivoSolo && total > 0 && (
            <div className="pago-con">
              <label className="campo" style={{ flex: "1 1 140px" }}>
                <span>Con cuánto paga</span>
                <input className="input" data-paso="" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={formatoDinero(aCobrarEfectivo)} />
              </label>
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
        </div>

        <div className="separador" />
        <div className="renglon" style={{ alignItems: "center" }}>
          <span className="lab">Total{prop > 0 ? ` más ${formatoDinero(prop)} de propina` : ""}</span>
          <span className="big">{formatoDinero(total)}</span>
        </div>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        {p.cajaAbierta ? (
          <button className="bt grande" data-paso="cobrar" disabled={enviando || lineas.length === 0}>{enviando ? "Guardando…" : `Cobrar ${formatoDinero(total)}`}<Fl /></button>
        ) : (
          <button type="button" className="bt grande" onClick={() => window.dispatchEvent(new CustomEvent("crabs:caja", { detail: "abrir" }))}>Abrir la caja para cobrar<Fl /></button>
        )}
        <div className="atajos" aria-label="Atajos de teclado">
          <span><span className="k">Enter</span> Siguiente</span>
          <span><span className="k">Espacio</span> Elegir</span>
          <span><span className="k">D</span> Descuento</span>
          <span><span className="k">P</span> Propina</span>
          <span><span className="k">Esc</span> Limpiar</span>
        </div>
      </aside>
    </form>
  );
}
