"use client";

import { EncuestaQR } from "@/components/EncuestaQR";
import { DatosTransferencia, type CuentaTransferencia } from "@/components/DatosTransferencia";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl, Icono } from "@/components/Icono";
import { Selector } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { registrarVenta, type CobroQrAbierto, type EstadoCobro } from "./actions";
import { CobroQR, TarjetasQr } from "./CobroQR";
import { aplicarPromos, descuentoDe, momentoEn, participa, vigente, type Promo } from "@/lib/promociones";

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
  usa: { propinas: boolean; descuentos: boolean; dividir: boolean }; promos?: Promo[]; zona?: string;
  desdeCita?: { id: string; folio: string; cliente: string; barberoId: string; servicioIds: string[]; pagado?: number } | null;
  /** El negocio puede cobrar con QR (Stripe conectado). */
  qr?: boolean;
  /** Cuenta propia para transferencias: se muestra al elegir Transferencia. */
  cuenta?: CuentaTransferencia | null;
}) {
  const promos = p.promos ?? [];
  const [estado, accion, enviando] = useActionState<EstadoCobro, FormData>(registrarVenta, {});
  const [clave, setClave] = useState(nuevaClave);
  const [cita, setCita] = useState(p.desdeCita ?? null);
  const [lineas, setLineas] = useState<Linea[]>(() => (p.desdeCita ? p.desdeCita.servicioIds.filter((id) => p.servicios.some((x) => x.id === id)).map((id) => ({ key: nuevaClave(), servicioId: id, barberoId: p.desdeCita!.barberoId, cantidad: 1 })) : []));
  // Quien inició sesión atiende por defecto; se puede cambiar porque la computadora es compartida.
  const [barbero, setBarbero] = useState(p.equipo.some((e) => e.id === p.yo) ? p.yo : p.equipo[0]?.id ?? "");
  const [buscar, setBuscar] = useState("");
  const [metodo, setMetodo] = useState(p.metodos[0]?.id ?? "");
  const [dividir, setDividir] = useState(false);
  const [metodo2, setMetodo2] = useState(p.metodos[1]?.id ?? "");
  const [monto1, setMonto1] = useState("");
  const [recibido, setRecibido] = useState("");
  const [panel, setPanel] = useState<"descuento" | "propina" | "codigo" | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigoTxt, setCodigoTxt] = useState("");
  const [descuento, setDescuento] = useState<{ tipo: "pct" | "fijo"; valor: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [propina, setPropina] = useState<{ tipo: "pct" | "fijo"; valor: string } | null>(null);
  const [ultima, setUltima] = useState<{ folio: string; total: number; encuesta?: string | null } | null>(null);
  const [cobroQr, setCobroQr] = useState<CobroQrAbierto | null>(null);
  // Cobro con QR que se dejó en espera al cerrar su ventana: pasa a la lista de cobros en espera.
  const [enEspera, setEnEspera] = useState<CobroQrAbierto | null>(null);
  const abrirQr = useCallback((c: CobroQrAbierto) => setCobroQr(c), []);
  // Cobros con QR que ya se vieron resueltos en su ventana: no repiten tarjeta flotante.
  const [vistos, setVistos] = useState<string[]>([]);
  const qrVisto = useRef<string | null>(null);
  // "Pago con QR" aparece junto a las formas de pago del negocio, pero no es una de ellas: no entra al efectivo de la caja.
  const metodosVista = p.qr ? [...p.metodos, { id: "qr", nombre: "Pago con QR", esEfectivo: false }] : p.metodos;
  const conQr = metodo === "qr";
  // En el teléfono: una sola categoría abierta a la vez y el resumen de la venta en un panel inferior.
  const [catAbierta, setCatAbierta] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  // En el teléfono la hoja se cierra al cobrar: el aviso de venta cobrada (con la encuesta) se muestra aparte, hasta cerrarlo.
  const [okCerrado, setOkCerrado] = useState<string | null>(null);
  const raiz = useRef<HTMLFormElement>(null);

  const limpiar = () => {
    setClave(nuevaClave()); setLineas([]); setDividir(false); setMonto1(""); setRecibido(""); setBuscar("");
    setPanel(null); setDescuento(null); setMotivo(""); setPropina(null); setCodigo(""); setCodigoTxt(""); setCita(null);
  };

  // Después de cobrar: limpiar todo y preparar una venta nueva (una sola vez por folio).
  const atendido = useRef<string | null>(null);
  useEffect(() => {
    if (estado.ok && estado.folio && estado.folio !== atendido.current) {
      atendido.current = estado.folio;
      setUltima({ folio: estado.folio, total: estado.total ?? 0, encuesta: estado.encuesta });
      setHoja(false);
      limpiar();
    }
    if (estado.qr && estado.qr.id !== qrVisto.current) { qrVisto.current = estado.qr.id; setCobroQr({ ...estado.qr, detalle: detalleVenta }); }
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

  // Atajos: Enter y flechas avanzan (también por descuento, propina y dividir pago), Espacio elige, Esc limpia, D descuento, P propina, 2 dividir pago.
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
      if (k === "d" && p.usa.descuentos) { e.preventDefault(); setPanel((x) => (x === "descuento" ? null : "descuento")); }
      if (k === "p" && p.usa.propinas) { e.preventDefault(); setPanel((x) => (x === "propina" ? null : "propina")); }
      if (k === "2" && p.usa.dividir && p.metodos.length > 1) { e.preventDefault(); setDividir((d) => !d); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const conServicio = lineas.map((l) => ({ ...l, s: p.servicios.find((x) => x.id === l.servicioId)! })).filter((l) => l.s);
  const detalleVenta = `${conServicio.map((l) => l.s.nombre).join(", ")}${conServicio[0] ? ` con ${(p.equipo.find((e) => e.id === conServicio[0].barberoId)?.nombre ?? "").split(" ")[0]}` : ""}`;
  const lista = conServicio.reduce((a, l) => a + l.s.precio * l.cantidad, 0);
  // Promociones: cada unidad cuenta como un servicio; el servidor vuelve a calcular todo al cobrar.
  const momento = momentoEn(p.zona ?? "America/Monterrey");
  const unidades = conServicio.flatMap((l) => Array.from({ length: l.cantidad }, () => ({ key: l.key, servicioId: l.servicioId, categoria: l.s.categoria, precio: l.s.precio })));
  const ap = aplicarPromos(promos, unidades, momento, codigo);
  const promoPorKey = (key: string) => unidades.reduce((a, u, i) => a + (u.key === key ? ap.porLinea[i]?.descuento ?? 0 : 0), 0);
  const nombrePromoKey = (key: string) => { const i = unidades.findIndex((u, k) => u.key === key && ap.porLinea[k]); return i < 0 ? "" : promos.find((x) => x.id === ap.porLinea[i]!.promocionId)?.nombre ?? ""; };
  const descPromo = ap.porLinea.reduce((a, r) => a + (r?.descuento ?? 0), 0);
  const subtotal = lista - descPromo;
  const hayCodigos = promos.some((x) => x.aplicacion === "codigo" && vigente(x, momento));
  const precioPromo = (sv: Servicio) => {
    const ds = promos.filter((x) => x.aplicacion === "auto" && x.tipo !== "paquete" && vigente(x, momento) && participa(x, { servicioId: sv.id, categoria: sv.categoria })).map((x) => descuentoDe(x, sv.precio));
    const d = ds.length ? Math.max(...ds) : 0;
    return d > 0 ? sv.precio - d : null;
  };
  const calc = (x: { tipo: "pct" | "fijo"; valor: string } | null, base: number) =>
    !x ? 0 : x.tipo === "pct" ? Math.round((base * (Number(x.valor) || 0)) / 100) : leerPesos(x.valor) ?? 0;
  const desc = Math.min(calc(descuento, subtotal), subtotal);
  const totalVenta = Math.max(subtotal - desc, 0);
  // Si la cita ya tiene un anticipo pagado en línea, solo se cobra el resto.
  const anticipo = Math.min(cita?.pagado ?? 0, totalVenta);
  const total = totalVenta - anticipo;
  const prop = calc(propina, totalVenta);
  const m1 = dividir ? Math.min(leerPesos(monto1) ?? 0, total) : total;
  const metodoActual = p.metodos.find((m) => m.id === metodo);
  const pasaLimite = desc > Math.floor((subtotal * p.limiteDescuento) / 100);
  const efectivoSolo = !dividir && metodoActual?.esEfectivo;
  const pagaCon = leerPesos(recibido);
  // La propina se paga igual que la venta.
  const propinaEfectivo = !!metodoActual?.esEfectivo;
  const aCobrarEfectivo = total + (propinaEfectivo ? prop : 0);
  const aCobrarTransferencia = total + prop;
  const cambioC = pagaCon !== null ? pagaCon - aCobrarEfectivo : null;

  const datos = useMemo(() => JSON.stringify({
    clave,
    lineas: conServicio.flatMap((l) => Array.from({ length: l.cantidad }, () => ({ servicioId: l.servicioId, barberoId: l.barberoId }))),
    descuento: desc,
    motivoDescuento: desc > 0 ? motivo || "Sin motivo" : "",
    pagos: dividir && !conQr ? [{ metodoId: metodo, monto: m1 }, { metodoId: metodo2, monto: total - m1 }] : [{ metodoId: metodo, monto: total }],
    propina: { monto: prop, barberoId: conServicio[0]?.barberoId ?? barbero, efectivo: propinaEfectivo },
    observaciones: "",
    codigo,
    citaId: cita?.id ?? "",
  }), [clave, conServicio, desc, motivo, dividir, metodo, m1, metodo2, total, prop, barbero, propinaEfectivo, codigo, cita]);

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
  const abierta = buscar.trim() ? null : catAbierta ?? categorias[0] ?? null;
  const nServ = lineas.reduce((a, l) => a + l.cantidad, 0);
  const personas = p.equipo.filter((e) => p.puedeOtros || e.id === p.yo);

  return (
    <form action={accion} className="cobro" ref={raiz}>
      <input type="hidden" name="datos" value={datos} />
      <div className="pila" style={{ gap: 22 }}>
        <label className="con-icono buscador buscador-d">
          <Icono n="buscar" />
          <input className="input" data-paso="" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar servicio" aria-label="Buscar servicio" autoComplete="off" />
        </label>
        {p.qr && <TarjetasQr nuevo={enEspera} abrir={abrirQr} vistos={vistos} />}

        {/* Teléfono: quién atiende arriba y una lista rápida por categoría, con + o contador. */}
        <div className="cob-m">
          {personas.length > 1 && (
            <section className="pila-chica">
              <span className="lab">¿Quién atiende?</span>
              <div className="cm-per" role="radiogroup" aria-label="Quién atiende">
                {personas.map((e) => (
                  <button type="button" key={e.id} role="radio" aria-checked={barbero === e.id} className={barbero === e.id ? "on" : ""} onClick={() => elegirBarbero(e.id)}>
                    <Avatar avatar={e.avatar} nombre={e.nombre} t={44} /><span>{primerNombre(e.nombre)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="cm-lista">
            {[...new Set(p.servicios.map((x) => x.categoria))].map((c) => (
              <div key={c} className="cm-grupo">
                <span className="cm-cat">{c}</span>
                {p.servicios.filter((x) => x.categoria === c).map((sv) => {
                  const l = lineas.find((x) => x.servicioId === sv.id);
                  const promo = precioPromo(sv);
                  return (
                    <div key={sv.id} className={`cm-fila ${l ? "on" : ""}`}>
                      <button type="button" className="cm-n" onClick={() => (l ? cantidad(l.key, 1) : alternar(sv.id))}>
                        <b>{sv.nombre}</b><small>{sv.duracionMin} min</small>
                      </button>
                      <span className="cm-p num">{promo !== null ? <><s>{formatoDinero(sv.precio)}</s>{formatoDinero(promo)}</> : formatoDinero(sv.precio)}</span>
                      {l ? (
                        <span className="cm-step">
                          <button type="button" aria-label={`Quitar uno de ${sv.nombre}`} onClick={() => cantidad(l.key, -1)}><Icono n="minimizar" /></button>
                          <b>{l.cantidad}</b>
                          <button type="button" aria-label={`Agregar otro ${sv.nombre}`} onClick={() => cantidad(l.key, 1)}><Icono n="mas" /></button>
                        </span>
                      ) : <button type="button" className="cm-add" aria-label={`Agregar ${sv.nombre}`} onClick={() => alternar(sv.id)}><Icono n="mas" /></button>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {categorias.length === 0 && <p className="muted">No hay servicios con ese nombre.</p>}
        {categorias.map((c) => (
          <section key={c} className={`pila-chica cat-cobro ${!buscar.trim() && abierta !== c ? "cerrada" : ""}`}>
            <span className="lab solo-escritorio-b">{c}</span>
            <button type="button" className="cat-btn" aria-expanded={!buscar.trim() ? abierta === c : true} onClick={() => setCatAbierta(abierta === c ? "" : c)}>
              <span>{c}</span><small>{visibles.filter((s) => s.categoria === c).length}</small>
              {lineas.some((l) => visibles.find((s) => s.id === l.servicioId)?.categoria === c) && <i className="punto-cat" aria-label="Con servicios elegidos" />}
              <Icono n="abajo" />
            </button>
            <div className="servicios-g">
              {visibles.filter((s) => s.categoria === c).map((s) => {
                const l = lineas.find((x) => x.servicioId === s.id);
                return (
                  <button type="button" key={s.id} data-paso="" className="svc" aria-pressed={!!l} onClick={() => alternar(s.id)}>
                    <span><b style={{ fontWeight: 600 }}>{s.nombre}</b><small>{s.duracionMin} min</small></span>
                    {l ? <span className="q">{l.cantidad > 1 ? `x${l.cantidad}` : <Icono n="palomita" className="ic" />}</span>
                      : precioPromo(s) !== null ? <span className="num precio-promo"><s>{formatoDinero(s.precio)}</s>{formatoDinero(precioPromo(s)!)}</span>
                      : <span className="num">{formatoDinero(s.precio)}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="pila-chica atendio-d">
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

      {/* Teléfono: barra fija con lo elegido; al tocarla se abre la venta como panel inferior. */}
      <div className={`barra-cobro ${nServ ? "con" : ""}`}>
        <button type="button" className="bc-info" onClick={() => setHoja(true)} disabled={!nServ}>
          <b>{nServ ? `${nServ} ${nServ === 1 ? "servicio seleccionado" : "servicios seleccionados"}` : "Elige un servicio"}</b>
          <small>{nServ ? "Ver detalle de la venta" : ultima ? `Venta ${ultima.folio} cobrada` : "Toca un servicio para agregarlo"}</small>
        </button>
        <span className="bc-total num">{formatoDinero(total)}</span>
        <button type="button" className="bt" disabled={!nServ} onClick={() => setHoja(true)}>Cobrar</button>
      </div>
      {ultima && lineas.length === 0 && !hoja && okCerrado !== ultima.folio && (
        <div className="cobro-ok cobro-ok-flota" role="status">
          <span className="cobro-ok-i" aria-hidden="true"><Icono n="palomita" /></span>
          <span className="cobro-ok-t"><b>Venta cobrada</b><small>{ultima.folio}, {formatoDinero(ultima.total)}</small></span>
          {ultima.encuesta && <EncuestaQR token={ultima.encuesta} />}
          <button type="button" className="icb cobro-ok-x" onClick={() => setOkCerrado(ultima.folio)} aria-label="Cerrar aviso"><Icono n="cerrar" /></button>
        </div>
      )}
      {hoja && <div className="velo-hoja" onClick={() => setHoja(false)} aria-hidden="true" />}

      <aside className={`glass ticket ${hoja ? "hoja-abierta" : ""}`} aria-label="Esta venta">
        {cita && <p className="aviso-cita"><Icono n="calendario" />Cita {cita.folio} de <b>{cita.cliente}</b></p>}
        <div className="entre cab-hoja"><h2 className="titulo">Esta venta</h2><button type="button" className="icb cerrar-hoja" onClick={() => setHoja(false)} aria-label="Cerrar"><Icono n="cerrar" /></button></div>
        {ultima && lineas.length === 0 && (
          <div className="cobro-ok" role="status"><span className="cobro-ok-i" aria-hidden="true"><Icono n="palomita" /></span><span className="cobro-ok-t"><b>Venta cobrada</b><small>{ultima.folio}, {formatoDinero(ultima.total)}</small></span>{ultima.encuesta && <EncuestaQR token={ultima.encuesta} />}</div>
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
                  {promoPorKey(l.key) > 0 && <small className="promo-l"><Icono n="etiqueta" />{nombrePromoKey(l.key)} −{formatoDinero(promoPorKey(l.key))}</small>}
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
          {hayCodigos && <button type="button" data-paso="" className={`chipf ${panel === "codigo" || codigo ? "on" : ""}`} aria-expanded={panel === "codigo"} onClick={() => setPanel((x) => (x === "codigo" ? null : "codigo"))}>
            <Icono n="etiqueta" />{codigo ? `Código ${codigo}` : "Código promocional"}
          </button>}
          {p.usa.descuentos && <button type="button" data-paso="" className={`chipf ${panel === "descuento" || desc ? "on" : ""}`} aria-expanded={panel === "descuento"} onClick={() => setPanel((x) => (x === "descuento" ? null : "descuento"))}>
            <Icono n="etiqueta" />{desc ? `Descuento −${formatoDinero(desc)}` : "Descuento"}
          </button>}
          {p.usa.propinas && <button type="button" data-paso="" className={`chipf ${panel === "propina" || prop ? "on" : ""}`} aria-expanded={panel === "propina"} onClick={() => setPanel((x) => (x === "propina" ? null : "propina"))}>
            <Icono n="mas" />{prop ? `Propina ${formatoDinero(prop)}` : "Propina"}
          </button>}
          {p.usa.dividir && p.metodos.length > 1 && (
            <button type="button" data-paso="" className={`chipf ${dividir ? "on" : ""}`} aria-pressed={dividir} onClick={() => { if (conQr) setMetodo(p.metodos[0]?.id ?? ""); setDividir((d) => !d); }}><Icono n="cobro" />Dividir pago</button>
          )}
        </div>

        {panel === "descuento" && (
          <div className="panel-rapido subir">
            <div className="billetes">
              {[5, 10, 20].map((v) => (
                <button type="button" data-paso="" key={v} className={descuento?.tipo === "pct" && descuento.valor === String(v) ? "on" : ""} onClick={() => setDescuento({ tipo: "pct", valor: String(v) })}>
                  {v}% <small>{formatoDinero(Math.round((subtotal * v) / 100))}</small>
                </button>
              ))}
              {descuento?.tipo === "fijo"
                ? <span className="otra"><span>$</span><input data-paso="" inputMode="decimal" autoFocus value={descuento.valor} onChange={(e) => setDescuento({ tipo: "fijo", valor: e.target.value })} aria-label="Otro descuento" /></span>
                : <button type="button" data-paso="" onClick={() => setDescuento({ tipo: "fijo", valor: "" })}>Otro</button>}
              {descuento && <button type="button" data-paso="" className="quitar" onClick={() => { setDescuento(null); setMotivo(""); }}>Quitar</button>}
            </div>
            {desc > 0 && (
              <div className="billetes motivo-r">
                <span className="muted" style={{ fontSize: 12 }}>Motivo</span>
                {["Cliente frecuente", "Promoción", "Cortesía"].map((x) => <button type="button" data-paso="" key={x} className={motivo === x ? "on" : ""} onClick={() => setMotivo(x)}>{x}</button>)}
                <span className="otra"><input data-paso="" placeholder="Otro" value={["Cliente frecuente", "Promoción", "Cortesía"].includes(motivo) ? "" : motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Otro motivo" style={{ width: 90 }} /></span>
              </div>
            )}
            {pasaLimite && <small className="muted">Pasa del {p.limiteDescuento}% permitido. Solo el titular o el administrador pueden registrarlo.</small>}
          </div>
        )}
        {panel === "codigo" && (
          <div className="panel-rapido subir">
            <div className="billetes">
              <span className="otra"><input data-paso="" autoFocus value={codigoTxt} onChange={(e) => setCodigoTxt(e.target.value.toUpperCase())} placeholder="Escribe el código" aria-label="Código promocional" style={{ width: 150 }} /></span>
              <button type="button" data-paso="" onClick={() => setCodigo(codigoTxt.trim())}>Aplicar</button>
              {codigo && <button type="button" data-paso="" className="quitar" onClick={() => { setCodigo(""); setCodigoTxt(""); }}>Quitar</button>}
            </div>
            {codigo && !ap.codigoValido && <small className="muted">Ese código no es válido o no aplica en este horario.</small>}
            {codigo && ap.codigoValido && descPromo === 0 && <small className="muted">El código es válido, pero no aplica a los servicios elegidos.</small>}
          </div>
        )}
        {panel === "propina" && (
          <div className="panel-rapido subir">
            <div className="billetes">
              {[5, 10, 15].map((v) => (
                <button type="button" data-paso="" key={v} className={propina?.tipo === "pct" && propina.valor === String(v) ? "on" : ""} onClick={() => setPropina({ tipo: "pct", valor: String(v) })}>
                  {v}% <small>{formatoDinero(Math.round((total * v) / 100))}</small>
                </button>
              ))}
              <span className="otra"><span>Otra</span><input data-paso="" inputMode="decimal" placeholder="$0" value={propina?.tipo === "fijo" ? propina.valor : ""} onChange={(e) => setPropina(e.target.value ? { tipo: "fijo", valor: e.target.value } : null)} aria-label="Otra cantidad de propina" /></span>
              {propina && <button type="button" data-paso="" className="quitar" onClick={() => setPropina(null)}>Quitar</button>}
            </div>
          </div>
        )}

        <div className="metodos" role="radiogroup" aria-label="Forma de pago">
          {metodosVista.map((m) => (
            <button type="button" key={m.id} data-paso="" role="radio" aria-checked={metodo === m.id} className="metodo" onClick={() => {
              setMetodo(m.id);
              if (m.id === "qr") setDividir(false);
              if (metodo2 === m.id) setMetodo2(p.metodos.find((x) => x.id !== m.id)?.id ?? "");
            }}>
              <Icono n={m.id === "qr" ? "cuadros" : iconoMetodo(m)} />{m.nombre}
            </button>
          ))}
        </div>
        {dividir && (
          <div className="panel-rapido subir division">
            <div className="fila-div">
              <Selector className="mini-sel" etiqueta="Primera forma de pago" valor={metodo} onChange={(v) => { setMetodo(v); if (v === metodo2) setMetodo2(p.metodos.find((x) => x.id !== v)?.id ?? ""); }} opciones={p.metodos.map((m) => ({ valor: m.id, texto: m.nombre }))} />
              <span className="otra ancho"><span>$</span><input data-paso="" inputMode="decimal" placeholder="0" value={monto1} onChange={(e) => setMonto1(e.target.value)} aria-label="Primer importe" autoFocus /></span>
            </div>
            <div className="fila-div">
              <Selector className="mini-sel" etiqueta="Segunda forma de pago" valor={metodo2} onChange={setMetodo2} opciones={p.metodos.filter((m) => m.id !== metodo).map((m) => ({ valor: m.id, texto: m.nombre }))} />
              <span className="resto"><b>{formatoDinero(Math.max(total - m1, 0))}</b><small>el resto</small></span>
            </div>
            <span className={`conteo-l ${m1 > 0 && m1 < total ? "ok" : "dif"}`}><Icono n={m1 > 0 && m1 < total ? "palomita" : "reloj"} />{m1 > 0 && m1 < total ? `${metodoActual?.nombre} ${formatoDinero(m1)} y ${p.metodos.find((x) => x.id === metodo2)?.nombre} ${formatoDinero(total - m1)}` : "Escribe cuánto se paga con la primera forma"}</span>
          </div>
        )}
        {p.cuenta && !dividir && !conQr && total > 0 && /transfer/i.test(metodoActual?.nombre ?? "") && (
          <DatosTransferencia cuenta={p.cuenta} monto={aCobrarTransferencia} compartir />
        )}
        {conQr && total > 0 && (
          <div className="paga-con qr-nota"><Icono n="cuadros" /><span>El cliente escanea el código y paga en su teléfono. No entra al efectivo de la caja.</span></div>
        )}
        {efectivoSolo && total > 0 && (
          <div className="paga-con">
            <span className="otra"><span>Paga con</span><input data-paso="" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={formatoDinero(aCobrarEfectivo)} aria-label="Con cuánto paga" /></span>
            {[20000, 50000].filter((b) => b >= aCobrarEfectivo).slice(0, 2).map((b) => <button type="button" data-paso="" key={b} className="mini-b" onClick={() => setRecibido(String(b / 100))}>{formatoDinero(b)}</button>)}
            <span className="cambio-c" aria-live="polite">Cambio <b className={cambioC !== null && cambioC < 0 ? "falta" : ""}>{cambioC === null ? "$0" : cambioC < 0 ? `faltan ${formatoDinero(-cambioC)}` : formatoDinero(cambioC)}</b></span>
          </div>
        )}

        <div className="separador" />
        {descPromo > 0 && <div className="renglon promo-t"><span className="muted">Ahorro por promociones</span><b className="num">−{formatoDinero(descPromo)}</b></div>}
        {anticipo > 0 && <div className="renglon promo-t"><span className="muted">Anticipo pagado en línea</span><b className="num">−{formatoDinero(anticipo)}</b></div>}
        <div className="renglon" style={{ alignItems: "center" }}>
          <span className="lab">{anticipo > 0 ? "Por cobrar" : "Total"}{prop > 0 ? ` más ${formatoDinero(prop)} de propina` : ""}</span>
          <span className="big">{formatoDinero(total)}</span>
        </div>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        <button className="bt grande" data-paso="cobrar" disabled={enviando || lineas.length === 0}>{enviando ? (conQr ? "Preparando el QR…" : "Guardando…") : conQr ? `Mostrar QR para cobrar ${formatoDinero(total + prop)}` : `Cobrar ${formatoDinero(total)}`}<Fl /></button>
        <div className="atajos" aria-label="Atajos de teclado">
          <span><span className="k">Enter</span> o <span className="k">flechas</span> Moverse</span>
          <span><span className="k">Espacio</span> Elegir</span>
          {p.usa.descuentos && <span><span className="k">D</span> Descuento</span>}
          {p.usa.propinas && <span><span className="k">P</span> Propina</span>}
          {p.usa.dividir && p.metodos.length > 1 && <span><span className="k">2</span> Dividir pago</span>}
          <span><span className="k">Esc</span> Limpiar</span>
        </div>
      </aside>
      {cobroQr && (
        <CobroQR key={cobroQr.id} cobro={cobroQr} detalle={cobroQr.detalle ?? ""}
          listo={(r) => { const propio = cobroQr.id === qrVisto.current; setVistos((v) => [...v, cobroQr.id]); setCobroQr(null); setUltima({ folio: r.folio, total: r.total }); setHoja(false); if (propio) limpiar(); }}
          cerrar={() => { const propio = cobroQr.id === qrVisto.current; setEnEspera(cobroQr); setCobroQr(null); if (propio) { setHoja(false); limpiar(); } }}
          cancelado={() => { setVistos((v) => [...v, cobroQr.id]); setCobroQr(null); setClave(nuevaClave()); }} />
      )}
    </form>
  );
}
