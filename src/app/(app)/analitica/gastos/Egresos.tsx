"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Calendario } from "@/components/Calendario";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { cancelarEgreso, type EstadoGasto, registrarEgreso } from "./actions";

export type FilaEgreso = { id: string; concepto: string; categoria: string; metodo: string; monto: number; cancelado: boolean; puedeCancelar: boolean; detalle: [string, string][]; comprobante?: { id: string; nombre: string } };
export type DiaEgresos = { fecha: string; titulo: string; total: number; filas: FilaEgreso[] };
type Categoria = { id: string; nombre: string; activo: boolean };

export function Egresos({ dias, hoy, cajaAbierta, puede, categorias, resumen, etiqueta, opciones, ajustes }: {
  dias: DiaEgresos[]; hoy: string; cajaAbierta: boolean; puede: boolean; categorias: Categoria[];
  resumen: { total: number; efectivo: number; transferencia: number; tarjeta: number; movimientos: number; comprobantes: number };
  etiqueta: string; opciones: OpcionesEgreso; ajustes: boolean;
}) {
  const [nuevo, setNuevo] = useState(0);
  const [cancelar, setCancelar] = useState<FilaEgreso | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const metodos: [string, string, number][] = [["Efectivo", "cm-e", resumen.efectivo], ["Transferencia", "cm-t", resumen.transferencia], ["Tarjeta", "cm-k", resumen.tarjeta]];
  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <h1 className="titulo">Egresos</h1>
        {puede && (
          <div className="fila" style={{ gap: 8 }}>
            {ajustes && <Link className="bt sec solo" href="/ajustes/cobro">Conceptos frecuentes</Link>}
            <button type="button" className="bt" onClick={() => setNuevo((n) => n + 1)}>Registrar egreso<span className="fl"><Icono n="mas" /></span></button>
          </div>
        )}
      </div>

      <section className="glass cab-egr subir">
        <div>
          <span className="lab">Egresos, {etiqueta.toLowerCase()}</span>
          <b className="big-mv num">{formatoDinero(resumen.total)}</b>
          <small className="muted">{resumen.movimientos} {resumen.movimientos === 1 ? "registro" : "registros"}{resumen.comprobantes ? `, ${resumen.comprobantes} con comprobante` : ""}</small>
        </div>
        <div className="tiles-egr">
          {metodos.map(([n, c, m], i) => (
            <div key={n} style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
              <span className={`chip-m ${c}`}>{n}</span>
              <b className="num">{formatoDinero(m)}</b>
              <small className="muted">{pct(m, resumen.total)} del total</small>
            </div>
          ))}
        </div>
      </section>

      <section className="subir d1">
        <div className="glass historial">
          {dias.length === 0 ? <p className="muted" style={{ padding: 16 }}>No hay egresos en estas fechas.</p> : (
            <div className="hist-scroll">
              {dias.map((d) => (
                <div key={d.fecha}>
                  <div className="hist-dia"><span>{d.titulo}</span><b className="num">{formatoDinero(d.total)}</b></div>
                  {d.filas.map((f) => (
                    <div key={f.id} className={`hist-fila ${f.cancelado ? "cancelada" : ""} ${abierta === f.id ? "abierta" : ""}`}>
                      <button type="button" className="hist-linea egreso-l" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                        <span className="srv">{f.concepto}<small>{f.categoria}{f.comprobante ? " · con comprobante" : ""}</small></span>
                        <span className={`met-tag ${f.metodo}`}>{f.metodo === "transferencia" ? "Transferencia" : f.metodo === "tarjeta" ? "Tarjeta" : "Efectivo"}</span>
                        <span className="num">{formatoDinero(f.monto)}</span>
                        <Icono n="abajo" />
                      </button>
                      {abierta === f.id && (
                        <div className="hist-det" style={{ paddingLeft: 14 }}>
                          {f.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
                          {f.comprobante && <span><small>Comprobante</small><a className="enlace" href={`/api/comprobante/${f.comprobante.id}`} target="_blank" rel="noreferrer">{f.comprobante.nombre}</a></span>}
                          {f.puedeCancelar && (
                            <span className="anular"><span className="fila" style={{ gap: 8 }}>
                              <span className="muted">Si se registró por error, cancélalo. No se borra: queda tachado con su motivo.</span>
                              <button type="button" className="icb peligro" onClick={() => setCancelar(f)} aria-label={`Cancelar ${f.concepto}`} title="Cancelar"><Icono n="basura" /></button>
                            </span></span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {nuevo > 0 && <Nuevo key={nuevo} hoy={hoy} cajaAbierta={cajaAbierta} categorias={categorias.filter((c) => c.activo)} cerrar={() => setNuevo(0)} otro={() => setNuevo((n) => n + 1)} opciones={opciones} />}
      {cancelar && <Cancelar f={cancelar} cerrar={() => setCancelar(null)} />}
    </>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

export type Frecuente = { id: string; concepto: string; categoria: string; monto: number; metodo: string; periodicidad: string };
export type OpcionesEgreso = { periodicidad: boolean; comprobantes: boolean; frecuentes: Frecuente[]; metodos: string[] };
const PERIODOS: [string, string][] = [["unica", "Una vez"], ["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]];

/** Reduce una foto a 1600 px de lado y la convierte a JPEG, para que pese poco. Los PDF pasan tal cual. */
async function prepararArchivo(f: File): Promise<string> {
  const leer = (b: Blob) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(b); });
  if (f.type === "application/pdf") return leer(f);
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export function Nuevo({ hoy, cajaAbierta, categorias, cerrar, otro, opciones }: { hoy: string; cajaAbierta: boolean; categorias: Categoria[]; cerrar: () => void; otro: () => void; opciones: OpcionesEgreso }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(registrarEgreso, {});
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia" | "tarjeta">((opciones.metodos[0] ?? "efectivo") as "efectivo");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [periodo, setPeriodo] = useState("unica");
  const [archivo, setArchivo] = useState<{ datos: string; nombre: string } | null>(null);
  const [errArchivo, setErrArchivo] = useState<string | null>(null);
  const usar = (f: Frecuente) => {
    setConcepto(f.concepto); setMonto(f.monto ? String(f.monto / 100) : ""); setCategoria(f.categoria);
    if (opciones.metodos.includes(f.metodo)) setMetodo(f.metodo as "efectivo");
    setPeriodo(f.periodicidad || "unica");
  };
  const [fecha, setFecha] = useState(hoy);
  const [categoria, setCategoria] = useState(categorias[0]?.nombre ?? "");
  const [deCaja, setDeCaja] = useState(cajaAbierta);
  const [seguir, setSeguir] = useState(false);
  useEffect(() => { if (e.ok) { if (seguir) otro(); else cerrar(); } }, [e.ok, e.n, seguir, otro, cerrar]);
  const puedeCaja = metodo === "efectivo" && fecha === hoy && cajaAbierta;
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Nuevo egreso" titulo="Registrar egreso" ancho>
      <form action={accion} className="pila">
        <input type="hidden" name="metodo" value={metodo} />
        <input type="hidden" name="fecha" value={fecha} />
        <input type="hidden" name="categoria" value={categoria} />
        <input type="hidden" name="deCaja" value={puedeCaja && deCaja ? "si" : "no"} />
        <input type="hidden" name="periodicidad" value={periodo} />
        {archivo && <><input type="hidden" name="comprobante" value={archivo.datos} /><input type="hidden" name="comprobanteNombre" value={archivo.nombre} /></>}
        {opciones.frecuentes.length > 0 && (
          <div className="pila-chica">
            <span className="lab">Gastos frecuentes</span>
            <div className="chips-cat">{opciones.frecuentes.map((f) => <button key={f.id} type="button" className={`chip-cat ${concepto === f.concepto ? "on" : ""}`} onClick={() => usar(f)}>{f.concepto}{f.monto ? ` ${formatoDinero(f.monto)}` : ""}</button>)}</div>
          </div>
        )}
        <div className="rejilla-f">
          <label className="campo" style={{ gridColumn: "1 / -1" }}><span>Concepto</span><input className="input" name="concepto" value={concepto} onChange={(x) => setConcepto(x.target.value)} placeholder="Ejemplo: Recibo de luz de octubre" required autoFocus maxLength={120} /></label>
          <label className="campo"><span>Cantidad</span><input className="input grande" name="monto" value={monto} onChange={(x) => setMonto(x.target.value)} inputMode="decimal" placeholder="$0" required /></label>
          <div className="campo"><span>Categoría</span><Selector etiqueta="Categoría" valor={categoria} onChange={setCategoria} opciones={categorias.map((c) => ({ valor: c.nombre, texto: c.nombre }))} /></div>
          <div className="campo"><span>Fecha</span><Calendario fecha={fecha} hoy={hoy} elegir={setFecha} /></div>
          <div className="campo"><span>Cómo se pagó</span>
            <div className="seg" role="radiogroup" aria-label="Cómo se pagó">
              {opciones.metodos.includes("efectivo") && <button type="button" className={metodo === "efectivo" ? "on" : ""} onClick={() => setMetodo("efectivo")}><Icono n="efectivo" />Efectivo</button>}
              {opciones.metodos.includes("transferencia") && <button type="button" className={metodo === "transferencia" ? "on" : ""} onClick={() => setMetodo("transferencia")}><Icono n="cobro" />Transferencia</button>}
              {opciones.metodos.includes("tarjeta") && <button type="button" className={metodo === "tarjeta" ? "on" : ""} onClick={() => setMetodo("tarjeta")}><Icono n="tarjeta" />Tarjeta</button>}
            </div>
          </div>
          {opciones.periodicidad && (
            <div className="campo"><span>Cada cuándo se paga</span><Selector etiqueta="Periodicidad" valor={periodo} onChange={setPeriodo} opciones={PERIODOS.map(([k, t]) => ({ valor: k, texto: t }))} /></div>
          )}
          {opciones.comprobantes && (
            <div className="campo"><span>Comprobante (opcional)</span>
              <label className="subir-arch">
                <input type="file" accept="image/*,application/pdf" capture="environment" onChange={async (x) => {
                  const f = x.target.files?.[0]; setErrArchivo(null);
                  if (!f) { setArchivo(null); return; }
                  if (f.type === "application/pdf" && f.size > 2_000_000) { setErrArchivo("El PDF debe pesar menos de 2 MB."); return; }
                  try { setArchivo({ datos: await prepararArchivo(f), nombre: f.name.slice(0, 100) }); } catch { setErrArchivo("No se pudo leer ese archivo."); }
                }} />
                <Icono n={archivo ? "palomita" : "archivo"} />{archivo ? archivo.nombre : "Tomar foto o elegir archivo"}
              </label>
              {errArchivo && <small style={{ color: "#a0525a" }}>{errArchivo}</small>}
            </div>
          )}
        </div>
        {puedeCaja ? (
          <label className="entre opcion-caja">
            <span><b>Salió del efectivo de la caja</b><small>Se descuenta del efectivo que debe haber al hacer el corte.</small></span>
            <Interruptor etiqueta="Salió de la caja" checked={deCaja} onChange={setDeCaja} />
          </label>
        ) : (
          <p className="ayuda-txt">{metodo !== "efectivo" ? `Pagado con ${metodo}: no toca la caja.` : fecha !== hoy ? "Es de otro día: no toca la caja de hoy." : "La caja está cerrada: este gasto no toca el corte."}</p>
        )}
        <label className="campo"><span>Descripción (opcional)</span><textarea className="input" name="descripcion" rows={2} maxLength={500} placeholder="Algún detalle que ayude a recordarlo" /></label>
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          <button className="bt sec solo" disabled={guardando} onClick={() => setSeguir(true)}>Guardar y agregar otro</button>
          <button className="bt" disabled={guardando} onClick={() => setSeguir(false)}>{guardando ? "Guardando…" : "Guardar egreso"}<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}

export function Cancelar({ f, cerrar }: { f: FilaEgreso; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(cancelarEgreso, {});
  useEffect(() => { if (e.ok) cerrar(); }, [e.ok, e.n, cerrar]);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Cancelar egreso" titulo={`¿Cancelar ${f.concepto}?`}>
      <form action={accion} className="pila">
        <input type="hidden" name="id" value={f.id} />
        <p className="muted">{formatoDinero(f.monto)}. No se borra: queda tachado, con tu nombre y el motivo, y deja de contar.</p>
        <label className="campo"><span>Motivo</span><input className="input" name="motivo" placeholder="Ejemplo: se registró dos veces" required autoFocus /></label>
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          <button className="bt peligro" disabled={guardando}>Sí, cancelar<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}
