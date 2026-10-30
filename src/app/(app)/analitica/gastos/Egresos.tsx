"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Calendario } from "@/components/Calendario";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { alternarCategoria, cancelarEgreso, crearCategoria, type EstadoGasto, registrarEgreso } from "./actions";

type FilaEgreso = { id: string; concepto: string; categoria: string; metodo: string; monto: number; cancelado: boolean; puedeCancelar: boolean; detalle: [string, string][] };
export type DiaEgresos = { fecha: string; titulo: string; total: number; filas: FilaEgreso[] };
type Categoria = { id: string; nombre: string; activo: boolean };

export function Egresos({ dias, hoy, cajaAbierta, puede, categorias, resumen, porCategoria, etiqueta }: {
  dias: DiaEgresos[]; hoy: string; cajaAbierta: boolean; puede: boolean; categorias: Categoria[];
  resumen: { total: number; efectivo: number; transferencia: number; movimientos: number };
  porCategoria: { nombre: string; monto: number; texto: string }[]; etiqueta: string;
}) {
  const [nuevo, setNuevo] = useState(0);
  const [verCats, setVerCats] = useState(false);
  const [cancelar, setCancelar] = useState<FilaEgreso | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const max = Math.max(1, ...porCategoria.map((c) => c.monto));
  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="lab">{etiqueta}</span>
          <h1 className="titulo" style={{ marginTop: 6 }}>Egresos</h1>
        </div>
        {puede && (
          <div className="fila" style={{ gap: 8 }}>
            <button type="button" className="bt sec solo" onClick={() => setVerCats(true)}><Icono n="etiqueta" />Categorías</button>
            <button type="button" className="bt" onClick={() => setNuevo((n) => n + 1)}>Registrar egreso<span className="fl"><Icono n="mas" /></span></button>
          </div>
        )}
      </div>

      <section className="kpis subir">
        <div className="kpi principal">
          <span className="lab">Total de egresos</span>
          <b className="big num">{formatoDinero(resumen.total)}</b>
          <small>{resumen.movimientos} {resumen.movimientos === 1 ? "registro" : "registros"}</small>
        </div>
        <div className="kpi"><span className="lab">En efectivo</span><b className="num">{formatoDinero(resumen.efectivo)}</b><small>{pct(resumen.efectivo, resumen.total)} del total</small></div>
        <div className="kpi"><span className="lab">Por transferencia</span><b className="num">{formatoDinero(resumen.transferencia)}</b><small>{pct(resumen.transferencia, resumen.total)} del total</small></div>
      </section>

      <section className="egresos-g subir d1">
        <div className="glass panel">
          <span className="lab">Por categoría</span>
          {porCategoria.length === 0 ? <p className="muted">Sin egresos en estas fechas.</p> : (
            <div className="ranking">
              {porCategoria.map((c, i) => (
                <div key={c.nombre}>
                  <span className="rank">{i + 1}</span>
                  <span><span className="entre"><b>{c.nombre}</b><span className="num">{c.texto}</span></span>
                    <span className="barra-s"><i style={{ width: `${(c.monto / max) * 100}%`, animationDelay: `${0.3 + i * 0.08}s` }} /></span></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass historial">
          {dias.length === 0 ? <p className="muted" style={{ padding: 16 }}>No hay egresos en estas fechas.</p> : (
            <div className="hist-scroll">
              {dias.map((d) => (
                <div key={d.fecha}>
                  <div className="hist-dia"><span>{d.titulo}</span><b className="num">{formatoDinero(d.total)}</b></div>
                  {d.filas.map((f) => (
                    <div key={f.id} className={`hist-fila ${f.cancelado ? "cancelada" : ""} ${abierta === f.id ? "abierta" : ""}`}>
                      <button type="button" className="hist-linea egreso-l" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                        <span className="srv">{f.concepto}<small>{f.categoria}</small></span>
                        <span className={`met-tag ${f.metodo}`}>{f.metodo === "transferencia" ? "Transferencia" : "Efectivo"}</span>
                        <span className="num">{formatoDinero(f.monto)}</span>
                        <Icono n="abajo" />
                      </button>
                      {abierta === f.id && (
                        <div className="hist-det" style={{ paddingLeft: 14 }}>
                          {f.detalle.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}
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

      {nuevo > 0 && <Nuevo key={nuevo} hoy={hoy} cajaAbierta={cajaAbierta} categorias={categorias.filter((c) => c.activo)} cerrar={() => setNuevo(0)} otro={() => setNuevo((n) => n + 1)} />}
      {verCats && <Categorias categorias={categorias} cerrar={() => setVerCats(false)} />}
      {cancelar && <Cancelar f={cancelar} cerrar={() => setCancelar(null)} />}
    </>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

function Nuevo({ hoy, cajaAbierta, categorias, cerrar, otro }: { hoy: string; cajaAbierta: boolean; categorias: Categoria[]; cerrar: () => void; otro: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(registrarEgreso, {});
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia">("efectivo");
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
        <div className="rejilla-f">
          <label className="campo" style={{ gridColumn: "1 / -1" }}><span>Concepto</span><input className="input" name="concepto" placeholder="Ejemplo: Recibo de luz de octubre" required autoFocus maxLength={120} /></label>
          <label className="campo"><span>Cantidad</span><input className="input grande" name="monto" inputMode="decimal" placeholder="$0" required /></label>
          <div className="campo"><span>Categoría</span><Selector etiqueta="Categoría" valor={categoria} onChange={setCategoria} opciones={categorias.map((c) => ({ valor: c.nombre, texto: c.nombre }))} /></div>
          <div className="campo"><span>Fecha</span><Calendario fecha={fecha} hoy={hoy} elegir={setFecha} /></div>
          <div className="campo"><span>Cómo se pagó</span>
            <div className="seg" role="radiogroup" aria-label="Cómo se pagó">
              <button type="button" className={metodo === "efectivo" ? "on" : ""} onClick={() => setMetodo("efectivo")}><Icono n="efectivo" />Efectivo</button>
              <button type="button" className={metodo === "transferencia" ? "on" : ""} onClick={() => setMetodo("transferencia")}><Icono n="tarjeta" />Transferencia</button>
            </div>
          </div>
        </div>
        {puedeCaja ? (
          <label className="entre opcion-caja">
            <span><b>Salió del efectivo de la caja</b><small>Se descuenta del efectivo que debe haber al hacer el corte.</small></span>
            <Interruptor etiqueta="Salió de la caja" checked={deCaja} onChange={setDeCaja} />
          </label>
        ) : (
          <p className="ayuda-txt">{metodo === "transferencia" ? "Por transferencia no toca la caja." : fecha !== hoy ? "Es de otro día: no toca la caja de hoy." : "La caja está cerrada: este gasto no toca el corte."}</p>
        )}
        <label className="campo"><span>Descripción (opcional)</span><textarea className="input" name="descripcion" rows={2} maxLength={500} placeholder="Algún detalle que ayude a recordarlo" /></label>
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={cerrar}>Cancelar</button>
          <button className="bt sec solo" disabled={guardando} onClick={() => setSeguir(true)}>Guardar y agregar otro</button>
          <button className="bt" disabled={guardando} onClick={() => setSeguir(false)}>{guardando ? "Guardando…" : "Guardar egreso"}<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}

function Categorias({ categorias, cerrar }: { categorias: Categoria[]; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoGasto, FormData>(crearCategoria, {});
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  useEffect(() => { if (e.ok) setNombre(""); }, [e.ok, e.n]);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Egresos" titulo="Categorías">
      <div className="pila">
        <div className="lista-cat">
          {categorias.map((c) => (
            <div key={c.id} className={`entre ${c.activo ? "" : "oculta"}`}>
              <span>{c.nombre}</span>
              <button type="button" className={`icb ojo ${c.activo ? "" : "apagado"}`} disabled={pendiente} aria-pressed={!c.activo}
                title={c.activo ? "Se muestra al registrar" : "Oculta al registrar"} aria-label={c.activo ? `Ocultar ${c.nombre}` : `Mostrar ${c.nombre}`}
                onClick={() => iniciar(async () => { const r = await alternarCategoria(c.id); setAviso(r.error ?? null); })}>
                <Icono n={c.activo ? "ojo" : "ojoNo"} />
              </button>
            </div>
          ))}
        </div>
        <form action={accion} className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
          <input className="input" name="nombre" value={nombre} onChange={(x) => setNombre(x.target.value)} placeholder="Nueva categoría, por ejemplo: Productos" maxLength={40} style={{ flex: 1 }} />
          <button className="bt sec solo" disabled={guardando || nombre.trim().length < 2}><Icono n="mas" />Agregar</button>
        </form>
        {(e.error || aviso) && <p className="aviso error">{e.error ?? aviso}</p>}
        <p className="ayuda-txt">Ocultar una categoría no cambia los egresos que ya la usan.</p>
      </div>
    </Modal>
  );
}

function Cancelar({ f, cerrar }: { f: FilaEgreso; cerrar: () => void }) {
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
          <button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button>
          <button className="bt peligro" disabled={guardando}>Sí, cancelar<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}
