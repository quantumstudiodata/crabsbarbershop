"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Interruptor, Modal } from "@/components/ui";
import { formatoDinero, leerPesos } from "@/lib/money";
import { DIAS_CORTOS, NOMBRE_TIPO, descuentoDe, estadoPromo, textoBeneficio, textoVigencia, type Promo, type TipoPromo } from "@/lib/promociones";
import { eliminarPromocion, guardarPromocion, pausarPromocion, type BorradorPromo, type ResultadoPromo } from "./promos-actions";
import { CampoFecha, CampoHora } from "@/components/Calendario";

type Servicio = { id: string; nombre: string; categoria: string; precio: number; activo: boolean };

const TIPOS: { t: TipoPromo; ejemplo: string; explica: string }[] = [
  { t: "precio", ejemplo: "Corte clásico de $150 a $120", explica: "El servicio se cobra a un precio nuevo." },
  { t: "fijo", ejemplo: "$30 menos", explica: "Se resta una cantidad fija al precio." },
  { t: "porcentaje", ejemplo: "20% de descuento", explica: "Se descuenta un porcentaje del precio." },
  { t: "paquete", ejemplo: "Corte + barba por $250", explica: "Varios servicios juntos por un precio." },
  { t: "horario", ejemplo: "15% de descuento de lunes a miércoles", explica: "Un porcentaje solo en ciertos días u horas." },
];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const PASOS = ["Nombre", "Tipo de promoción", "¿A qué servicios se aplica?", "Vigencia y condiciones", "¿Cómo se aplicará la promoción?", "Vista previa"];

const fechaCorta = (f: string) => {
  const [a, m, d] = f.split("-").map(Number);
  return `${d} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]} ${a}`;
};

const vacio = (hoy: string): BorradorPromo => ({
  nombre: "", descripcion: "", tipo: "porcentaje", valor: "", servicioIds: [], categorias: [], desde: hoy, hasta: "",
  dias: [0, 1, 2, 3, 4, 5, 6], conHorario: false, horaDesde: "10:00", horaHasta: "14:00",
  aplicacion: "auto", codigo: "", enCobro: true, enLinea: true, conLimite: false, limite: "",
});

const aBorrador = (p: Promo): BorradorPromo => ({
  id: p.id, nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
  valor: p.tipo === "porcentaje" || p.tipo === "horario" ? String(p.valor / 100) : String(p.valor / 100),
  servicioIds: p.servicioIds, categorias: p.categorias, desde: p.desde, hasta: p.hasta ?? "", dias: p.dias,
  conHorario: !!(p.horaDesde && p.horaHasta), horaDesde: p.horaDesde ?? "10:00", horaHasta: p.horaHasta ?? "14:00",
  aplicacion: p.aplicacion, codigo: p.codigo ?? "", enCobro: p.enCobro, enLinea: p.enLinea, conLimite: p.limiteUsos !== null, limite: p.limiteUsos ? String(p.limiteUsos) : "",
});

/** Convierte el borrador en una promoción para calcular la vista previa. */
function comoPromo(b: BorradorPromo): Promo {
  const pct = b.tipo === "porcentaje" || b.tipo === "horario";
  const v = pct ? Math.round((Number(b.valor) || 0) * 100) : leerPesos(b.valor) ?? 0;
  return {
    id: b.id ?? "nueva", nombre: b.nombre, descripcion: b.descripcion, tipo: b.tipo, valor: v, servicioIds: b.servicioIds, categorias: b.categorias,
    desde: b.desde, hasta: b.hasta || null, dias: b.dias, horaDesde: b.conHorario ? b.horaDesde : null, horaHasta: b.conHorario ? b.horaHasta : null,
    aplicacion: b.aplicacion, codigo: b.codigo || null, enCobro: b.enCobro, enLinea: b.enLinea, limiteUsos: b.conLimite ? Number(b.limite) || null : null, usos: 0, pausada: false,
  };
}

function Asistente({ inicial, servicios, hoy, cerrar, alGuardar }: { inicial: BorradorPromo; servicios: Servicio[]; hoy: string; cerrar: () => void; alGuardar: (r: ResultadoPromo) => void }) {
  const [b, setB] = useState(inicial);
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambia = (x: Partial<BorradorPromo>) => { setB({ ...b, ...x }); setError(null); };
  const pct = b.tipo === "porcentaje" || b.tipo === "horario";
  const promo = comoPromo(b);
  const activos = servicios.filter((s) => s.activo);
  const categorias = [...new Set(activos.map((s) => s.categoria))];
  const elegidos = activos.filter((s) => b.servicioIds.includes(s.id) || b.categorias.includes(s.categoria));
  const ejemplo = elegidos[0] ?? activos[0];
  const sumaPaquete = activos.filter((s) => b.servicioIds.includes(s.id)).reduce((a, s) => a + s.precio, 0);

  // Lo que hay que revisar antes de pasar al siguiente paso.
  const revisar = (): string | null => {
    if (paso === 0 && !b.nombre.trim()) return "Escribe el nombre de la promoción.";
    if (paso === 1) {
      if (pct) { const n = Number(b.valor); if (!(n > 0 && n <= 100)) return "El porcentaje va de 1 a 100."; }
      else if (!(leerPesos(b.valor) ?? 0)) return b.tipo === "fijo" ? "Escribe cuánto se descuenta." : "Escribe el precio.";
    }
    if (paso === 2) {
      if (b.tipo === "paquete" && b.servicioIds.length < 2) return "Un paquete necesita al menos dos servicios.";
      if (b.tipo !== "paquete" && !b.servicioIds.length && !b.categorias.length) return "Elige al menos un servicio o una categoría.";
      if (b.tipo === "paquete" && (leerPesos(b.valor) ?? 0) >= sumaPaquete) return `El paquete tiene que costar menos de ${formatoDinero(sumaPaquete)}, que es lo que suman sus servicios.`;
    }
    if (paso === 3) {
      if (!b.desde) return "Elige la fecha de inicio.";
      if (b.hasta && b.hasta < b.desde) return "La fecha de finalización no puede ser antes del inicio.";
      if (!b.dias.length) return "Elige al menos un día.";
      if (b.conHorario && b.horaDesde >= b.horaHasta) return "La hora de inicio va antes que la de fin.";
    }
    if (paso === 4) {
      if (b.aplicacion === "codigo" && !/^[A-Za-z0-9-]{3,20}$/.test(b.codigo.trim())) return "El código lleva de 3 a 20 letras o números, sin espacios.";
      if (!b.enCobro && !b.enLinea) return "Elige al menos dónde estará disponible.";
      if (b.conLimite && !(Number(b.limite) >= 1)) return "Escribe el límite de usos.";
    }
    return null;
  };
  const siguiente = () => { const e = revisar(); if (e) { setError(e); return; } setPaso(paso + 1); };
  const guardar = () => iniciar(async () => { const r = await guardarPromocion(b); if (r.error) setError(r.error); else alGuardar(r); });

  const tocarServicio = (id: string) => cambia({ servicioIds: b.servicioIds.includes(id) ? b.servicioIds.filter((x) => x !== id) : [...b.servicioIds, id] });
  const tocarCategoria = (c: string) => {
    const dentro = activos.filter((s) => s.categoria === c).map((s) => s.id);
    if (b.categorias.includes(c)) cambia({ categorias: b.categorias.filter((x) => x !== c) });
    else cambia({ categorias: [...b.categorias, c], servicioIds: b.servicioIds.filter((x) => !dentro.includes(x)) });
  };
  const estado = estadoPromo(promo, hoy);

  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Paso ${paso + 1} de 6`} titulo={PASOS[paso]} ancho>
      <div className="pila asist-promo">
        <div className="pasos-p" aria-hidden="true">{PASOS.map((_, i) => <i key={i} className={i <= paso ? "on" : ""} />)}</div>

        {paso === 0 && (
          <>
            <label className="campo"><span>Nombre de la promoción</span><input className="input" value={b.nombre} onChange={(e) => cambia({ nombre: e.target.value })} maxLength={60} autoFocus placeholder="Ejemplo: Martes de corte y barba" /></label>
            <label className="campo"><span>Descripción (opcional)</span><textarea className="input" value={b.descripcion} onChange={(e) => cambia({ descripcion: e.target.value })} maxLength={200} rows={2} placeholder="Lo que verá el cliente sobre la promoción" /></label>
          </>
        )}

        {paso === 1 && (
          <>
            <div className="tipos-p" role="radiogroup" aria-label="Tipo de promoción">
              {TIPOS.map((x) => (
                <button type="button" key={x.t} role="radio" aria-checked={b.tipo === x.t} className={`tipo-p ${b.tipo === x.t ? "on" : ""}`}
                  onClick={() => cambia({ tipo: x.t, valor: "", ...(x.t === "paquete" ? { categorias: [] } : {}) })}>
                  <i className="radio-p" aria-hidden="true" />
                  <span><b>{NOMBRE_TIPO[x.t]}</b><small>{x.ejemplo}</small>{b.tipo === x.t && <small className="explica-p">{x.explica}</small>}</span>
                </button>
              ))}
            </div>
            <label className="campo"><span>{pct ? "Porcentaje de descuento" : b.tipo === "fijo" ? "Cantidad que se descuenta" : b.tipo === "paquete" ? "Precio del paquete" : "Precio especial"}</span>
              <span className="con-unidad"><input className="input" inputMode="decimal" value={b.valor} onChange={(e) => cambia({ valor: e.target.value })} placeholder={pct ? "20" : "$0"} /><em>{pct ? "%" : "MXN"}</em></span></label>
            {ejemplo && b.tipo !== "paquete" && (() => {
              const d = descuentoDe(promo, ejemplo.precio);
              return (
                <div className="ejemplo-p">
                  <span><small>Ejemplo con {ejemplo.nombre}</small><span>Precio original <b>{formatoDinero(ejemplo.precio)}</b>, con la promoción <b>{formatoDinero(ejemplo.precio - d)}</b></span></span>
                  <small className="ahorro-p">El cliente ahorra {formatoDinero(d)}</small>
                </div>
              );
            })()}
            {b.tipo === "paquete" && <p className="ayuda-txt">En el siguiente paso eliges los servicios que forman el paquete.</p>}
          </>
        )}

        {paso === 2 && (
          <>
            <p className="ayuda-txt" style={{ margin: 0 }}>{b.tipo === "paquete" ? "Elige los servicios del paquete. Se aplica cuando se cobran todos juntos." : "Servicios participantes. Selecciona dónde será válida esta promoción."}</p>
            <div className="elige-p">
              {categorias.map((c) => {
                const toda = b.categorias.includes(c);
                return (
                  <section key={c}>
                    <div className="cat-p">
                      <b>{c}</b>
                      {b.tipo !== "paquete" && <label className="toda-p"><small>Toda la categoría</small><Interruptor etiqueta={`Toda la categoría ${c}`} checked={toda} onChange={() => tocarCategoria(c)} /></label>}
                    </div>
                    {activos.filter((s) => s.categoria === c).map((s) => {
                      const on = toda || b.servicioIds.includes(s.id);
                      return (
                        <button type="button" key={s.id} className={`svc-p ${on ? "on" : ""}`} aria-pressed={on} disabled={toda} onClick={() => tocarServicio(s.id)}>
                          <i className="check-p" aria-hidden="true">{on && <Icono n="palomita" />}</i><span>{s.nombre}</span><span className="num">{formatoDinero(s.precio)}</span>
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </div>
            {b.tipo === "paquete" && b.servicioIds.length > 1 && (
              <div className="ejemplo-p"><span><small>El paquete</small><span>Por separado <b>{formatoDinero(sumaPaquete)}</b>, en paquete <b>{formatoDinero(leerPesos(b.valor) ?? 0)}</b></span></span>
                <small className="ahorro-p">El cliente ahorra {formatoDinero(Math.max(sumaPaquete - (leerPesos(b.valor) ?? 0), 0))}</small></div>
            )}
          </>
        )}

        {paso === 3 && (
          <>
            <div className="fila-eg">
              <div className="campo"><span>Empieza</span><CampoFecha valor={b.desde} cambiar={(f) => cambia({ desde: f })} etiqueta="Fecha de inicio" /></div>
              <div className="campo"><span>Termina</span><CampoFecha valor={b.hasta} min={b.desde} cambiar={(f) => cambia({ hasta: f })} vacio="Sin fecha" etiqueta="Fecha de finalización" /></div>
            </div>
            <small className="muted" style={{ marginTop: -6 }}>Sin fecha de término, sigue activa hasta que la pauses.</small>
            <div className="campo"><span>Días aplicables</span>
              <div className="dias-p">{ORDEN_DIAS.map((d) => (
                <button type="button" key={d} aria-pressed={b.dias.includes(d)} className={b.dias.includes(d) ? "on" : ""} onClick={() => cambia({ dias: b.dias.includes(d) ? b.dias.filter((x) => x !== d) : [...b.dias, d] })}>{DIAS_CORTOS[d]}</button>
              ))}</div>
            </div>
            <label className="opcion-caja"><span><b>Solo en un horario</b><small>Si está apagado, aplica todo el día.</small></span><Interruptor etiqueta="Solo en un horario" checked={b.conHorario} onChange={() => cambia({ conHorario: !b.conHorario })} /></label>
            {b.conHorario && (
              <div className="fila-eg horario-p">
                <div className="campo"><span>De</span><CampoHora valor={b.horaDesde} cambiar={(h) => cambia({ horaDesde: h })} etiqueta="Desde" /></div>
                <div className="campo"><span>A</span><CampoHora valor={b.horaHasta} cambiar={(h) => cambia({ horaHasta: h })} etiqueta="Hasta" /></div>
              </div>
            )}
          </>
        )}

        {paso === 4 && (
          <>
            <div className="campo"><span>Aplicación de la promoción</span>
              <div className="tipos-p" role="radiogroup" aria-label="Aplicación">
                {([["auto", "Automáticamente", "El descuento se aplica cuando el servicio cumple las condiciones."], ["codigo", "Mediante código promocional", "El cliente o el trabajador escribe un código para aplicar el descuento."]] as const).map(([k, t, d]) => (
                  <button type="button" key={k} role="radio" aria-checked={b.aplicacion === k} className={`tipo-p ${b.aplicacion === k ? "on" : ""}`} onClick={() => cambia({ aplicacion: k })}>
                    <i className="radio-p" aria-hidden="true" /><span><b>{t}</b><small>{d}</small></span>
                  </button>
                ))}
              </div>
            </div>
            {b.aplicacion === "codigo" && <label className="campo"><span>Código promocional</span><input className="input" value={b.codigo} onChange={(e) => cambia({ codigo: e.target.value.toUpperCase().replace(/\s/g, "") })} maxLength={20} placeholder="Ejemplo: MARTES350" /></label>}
            <div className="campo"><span>Dónde estará disponible</span>
              <div className="lista-sw">
                <label><span><b>Cobro en el negocio</b></span><Interruptor etiqueta="Cobro en el negocio" checked={b.enCobro} onChange={() => cambia({ enCobro: !b.enCobro })} /></label>
                <label><span><b>Reservaciones en línea</b><small>Se mostrará cuando estén listas las reservaciones.</small></span><Interruptor etiqueta="Reservaciones en línea" checked={b.enLinea} onChange={() => cambia({ enLinea: !b.enLinea })} /></label>
                <label><span><b>Límite de usos</b><small>Cada venta con la promoción cuenta como un uso.</small></span><Interruptor etiqueta="Límite de usos" checked={b.conLimite} onChange={() => cambia({ conLimite: !b.conLimite })} /></label>
              </div>
            </div>
            {b.conLimite && <label className="campo"><span>Número de usos</span><input className="input" inputMode="numeric" value={b.limite} onChange={(e) => cambia({ limite: e.target.value.replace(/\D/g, "") })} placeholder="Ejemplo: 50" /></label>}
          </>
        )}

        {paso === 5 && (
          <>
            <div className="vista-promo">
              <span className="chip-promo"><Icono n="etiqueta" />{textoBeneficio(promo, formatoDinero)}</span>
              <b className="vp-nombre">{b.nombre}</b>
              {b.descripcion && <p>{b.descripcion}</p>}
              {ejemplo && b.tipo !== "paquete" && <span className="vp-precio"><s>{formatoDinero(ejemplo.precio)}</s><b>{formatoDinero(ejemplo.precio - descuentoDe(promo, ejemplo.precio))}</b><small>{ejemplo.nombre}</small></span>}
              {b.tipo === "paquete" && <span className="vp-precio"><s>{formatoDinero(sumaPaquete)}</s><b>{formatoDinero(promo.valor)}</b><small>Paquete</small></span>}
              <small className="muted">{textoVigencia(promo, fechaCorta)}</small>
            </div>
            <div className="datos resumen-cfg">
              <div><span>Servicios</span><b>{[...b.categorias.map((c) => `Toda ${c}`), ...activos.filter((s) => b.servicioIds.includes(s.id)).map((s) => s.nombre)].join(", ")}</b></div>
              <div><span>Tipo de descuento</span><b>{NOMBRE_TIPO[b.tipo]}</b></div>
              <div><span>Vigencia</span><b>{b.hasta ? `${fechaCorta(b.desde)} al ${fechaCorta(b.hasta)}` : `Desde ${fechaCorta(b.desde)}`}</b></div>
              <div><span>Días y horario</span><b>{b.dias.length === 7 ? "Todos los días" : ORDEN_DIAS.filter((d) => b.dias.includes(d)).map((d) => DIAS_CORTOS[d]).join(", ")}{b.conHorario ? `, de ${b.horaDesde} a ${b.horaHasta}` : ""}</b></div>
              <div><span>Aplicación</span><b>{b.aplicacion === "auto" ? "Automática" : `Con el código ${b.codigo}`}</b></div>
              <div><span>Límite de usos</span><b>{b.conLimite ? `${b.limite} usos` : "Sin límite"}</b></div>
              <div><span>Estado</span><b>{estado}</b></div>
            </div>
          </>
        )}

        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones-p">
          {paso > 0 ? <button type="button" className="ck-atras" aria-label="Anterior" onClick={() => { setError(null); setPaso(paso - 1); }}><Icono n="izquierda" /></button> : <span />}
          {paso < 5
            ? <button type="button" className="bt" onClick={siguiente}>Siguiente<Fl /></button>
            : <button type="button" className="bt" disabled={pendiente} onClick={guardar}>{pendiente ? "Guardando…" : b.id ? "Guardar cambios" : "Crear promoción"}<Fl /></button>}
        </div>
      </div>
    </Modal>
  );
}

export function ListaPromociones({ promos, servicios, hoy, activas, puedeEditar, crear }: {
  promos: Promo[]; servicios: Servicio[]; hoy: string; activas: boolean; puedeEditar: boolean; crear: number;
}) {
  const [edit, setEdit] = useState<BorradorPromo | null>(null);
  const [borrar, setBorrar] = useState<Promo | null>(null);
  const [res, setRes] = useState<ResultadoPromo>({});
  const [pendiente, iniciar] = useTransition();
  const [visto, setVisto] = useState(0);
  if (crear !== visto) { setVisto(crear); if (crear > 0) setEdit(vacio(hoy)); }
  const correr = (f: () => Promise<ResultadoPromo>, despues?: () => void) => iniciar(async () => { const r = await f(); setRes(r); if (!r.error) despues?.(); });

  if (!activas) {
    return (
      <div className="glass vacio-promo">
        <Icono n="etiqueta" />
        <span><b>Las promociones están apagadas</b><small>Actívalas en Configurar negocio, en el apartado Promociones.</small></span>
        <Link className="bt sec solo chico" href="/ajustes/cobro">Ir a Configurar negocio</Link>
      </div>
    );
  }
  const nombreSvc = (p: Promo) => [...p.categorias, ...servicios.filter((s) => p.servicioIds.includes(s.id)).map((s) => s.nombre)].join(", ");
  return (
    <>
      {res.error && <p className="aviso error">{res.error}</p>}
      {res.mensaje && !res.error && <p className="aviso ok">{res.mensaje}</p>}
      {promos.length === 0 ? (
        <div className="glass vacio-promo">
          <Icono n="etiqueta" />
          <span><b>Todavía no hay promociones</b><small>Crea una para ofrecer precios especiales, descuentos o paquetes.</small></span>
        </div>
      ) : (
        <div className="glass lista-promo">
          {promos.map((p) => {
            const e = estadoPromo(p, hoy);
            return (
              <div key={p.id} className={`fila-promo ${e === "Activa" ? "" : "apagada"}`}>
                <span className="ic-promo"><Icono n="etiqueta" /></span>
                <span className="txt-promo">
                  <b>{p.nombre}</b>
                  <small>{textoBeneficio(p, formatoDinero)}, {nombreSvc(p)}</small>
                  <small>{textoVigencia(p, fechaCorta)}{p.aplicacion === "codigo" ? `, código ${p.codigo}` : ""}{p.limiteUsos !== null ? `, ${p.usos} de ${p.limiteUsos} usos` : p.usos ? `, ${p.usos} usos` : ""}</small>
                </span>
                <span className={`chip-e ${e === "Activa" ? "activa-p" : "off"}`}><i />{e}</span>
                {puedeEditar ? <MenuPuntos etiqueta={`Opciones de ${p.nombre}`} items={[
                  { texto: "Editar promoción", icono: "editar", hacer: () => setEdit(aBorrador(p)) },
                  { texto: p.pausada ? "Reanudar" : "Pausar", icono: p.pausada ? "palomita" : "reloj", hacer: () => correr(() => pausarPromocion(p.id)) },
                  { texto: "Eliminar", icono: "basura", peligro: true, hacer: () => setBorrar(p) },
                ]} /> : <span />}
              </div>
            );
          })}
        </div>
      )}
      {edit && <Asistente inicial={edit} servicios={servicios} hoy={hoy} cerrar={() => setEdit(null)} alGuardar={(r) => { setRes(r); setEdit(null); }} />}
      {borrar && (
        <Modal abierto cerrar={() => setBorrar(null)} etiqueta="Promociones" titulo={`¿Eliminar ${borrar.nombre}?`}>
          <p className="muted">Si ya se usó en ventas, solo se pausa para conservar el historial.</p>
          <div className="acciones"><button type="button" className="bt peligro" disabled={pendiente} onClick={() => correr(() => eliminarPromocion(borrar.id), () => setBorrar(null))}>Sí, eliminar<Fl /></button></div>
        </Modal>
      )}
    </>
  );
}
