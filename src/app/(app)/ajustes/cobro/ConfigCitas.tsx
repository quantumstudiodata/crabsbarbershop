"use client";

import { useState, useTransition } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor } from "@/components/ui";
import type { ConfigCitas as Config, Horario, ModoPago } from "@/lib/agenda";
import { guardarConfigCitas } from "../../citas/actions";
import { EditorSemana } from "../../citas/PantallaCitas";

const MODOS: [ModoPago, string, string][] = [
  ["sin_pago", "Reservación sin pago", "El cliente paga en el negocio."],
  ["opcional", "Pago opcional", "El cliente decide si paga al reservar."],
  ["anticipo_pct", "Anticipo por porcentaje", "Ejemplo: 30% del total."],
  ["anticipo_fijo", "Anticipo de cantidad fija", "Ejemplo: $50 por cita."],
  ["completo", "Pago completo obligatorio", "Se paga todo al reservar."],
];

/** Configuración de citas: agenda, reservaciones en línea, horario, pagos y políticas. */
export function ConfigCitas({ inicial }: { inicial: { usaCitas: boolean; slug: string; horario: Horario; cerrados: string[]; config: Config; origen: string } }) {
  const c = inicial.config;
  const [d, setD] = useState({
    usaCitas: inicial.usaCitas, enLinea: c.enLinea, slug: inicial.slug, horario: inicial.horario, diasCerrados: inicial.cerrados,
    anticipacionMinHoras: String(c.anticipacionMinMin / 60), anticipacionMaxDias: String(c.anticipacionMaxDias), margenMin: String(c.margenMin),
    elegirBarbero: c.elegirBarbero, cualquierBarbero: c.cualquierBarbero, variosServicios: c.variosServicios,
    pagoModo: c.pago.modo, pagoValor: c.pago.modo === "anticipo_pct" ? String(c.pago.valor / 100) : c.pago.modo === "anticipo_fijo" ? String(c.pago.valor / 100) : "",
    cancelarHorasAntes: String(c.cancelarHorasAntes), politicaCancelacion: c.politicaCancelacion, politicaReembolso: c.politicaReembolso,
  });
  const [nuevoCerrado, setNuevoCerrado] = useState("");
  const [res, setRes] = useState<{ error?: string; mensaje?: string }>({});
  const [pend, iniciar] = useTransition();
  const cambia = (x: Partial<typeof d>) => { setD({ ...d, ...x }); setRes({}); };
  const sw = (k: "usaCitas" | "enLinea" | "elegirBarbero" | "cualquierBarbero" | "variosServicios", t: string, txt: string) => (
    <label><span><b>{t}</b><small>{txt}</small></span><Interruptor etiqueta={t} checked={d[k]} onChange={() => cambia({ [k]: !d[k] })} /></label>
  );
  return (
    <div className="pila cfg-citas" style={{ gap: 16 }}>
      <section className="sub-cfg">
        <span><b>Reservaciones</b></span>
        <div className="lista-sw">
          {sw("usaCitas", "Citas y agenda", "Muestra la sección Citas en el menú del equipo.")}
          {sw("enLinea", "Reservaciones en línea", "Los clientes reservan desde la página pública del negocio.")}
        </div>
        <label className="campo"><span>Dirección de la página de reservaciones</span>
          <span className="con-prefijo"><em>{inicial.origen}/reservar/</em><input className="input" value={d.slug} onChange={(e) => cambia({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={40} /></span></label>
        <div className="fila-eg">
          <label className="campo"><span>Anticipación mínima (horas)</span><input className="input" inputMode="decimal" value={d.anticipacionMinHoras} onChange={(e) => cambia({ anticipacionMinHoras: e.target.value })} /></label>
          <label className="campo"><span>Anticipación máxima (días)</span><input className="input" inputMode="numeric" value={d.anticipacionMaxDias} onChange={(e) => cambia({ anticipacionMaxDias: e.target.value })} /></label>
        </div>
        <label className="campo"><span>Tiempo adicional entre citas (minutos)</span><input className="input" inputMode="numeric" value={d.margenMin} onChange={(e) => cambia({ margenMin: e.target.value })} /></label>
        <div className="lista-sw">
          {sw("elegirBarbero", "Permitir elegir barbero", "El cliente elige quién lo atiende.")}
          {sw("cualquierBarbero", "Permitir reservar con cualquier barbero", "Se asigna a quien tenga menos citas ese día.")}
          {sw("variosServicios", "Permitir varios servicios en una cita", "Por ejemplo, corte y barba juntos.")}
        </div>
      </section>

      <section className="sub-cfg">
        <span><b>Días y horarios del negocio</b><small>Cada persona puede tener su propio horario en Citas, Horarios.</small></span>
        <EditorSemana valor={d.horario} onChange={(h) => cambia({ horario: h })} />
        <div className="campo"><span>Días que cierra el negocio</span>
          <div className="cerrados-c">
            {d.diasCerrados.map((f) => <span key={f} className="chip-cerr">{f.split("-").reverse().join("/")}<button type="button" aria-label="Quitar" onClick={() => cambia({ diasCerrados: d.diasCerrados.filter((x) => x !== f) })}><Icono n="cerrar" /></button></span>)}
            <span className="agrega-cerr"><input className="input" type="date" value={nuevoCerrado} onChange={(e) => setNuevoCerrado(e.target.value)} aria-label="Día cerrado" />
              <button type="button" className="bt sec chico" disabled={!nuevoCerrado} onClick={() => { cambia({ diasCerrados: [...new Set([...d.diasCerrados, nuevoCerrado])].sort() }); setNuevoCerrado(""); }}>Agregar</button></span>
          </div>
        </div>
      </section>

      <section className="sub-cfg">
        <span><b>Pagos</b><small>La pasarela de pagos se conecta en la siguiente fase. Mientras tanto, las reservaciones se guardan sin pago.</small></span>
        <div className="tipos-p" role="radiogroup" aria-label="Modalidad de pago">
          {MODOS.map(([k, t, x]) => (
            <button type="button" key={k} role="radio" aria-checked={d.pagoModo === k} className={`tipo-p ${d.pagoModo === k ? "on" : ""}`} onClick={() => cambia({ pagoModo: k })}>
              <i className="radio-p" aria-hidden="true" /><span><b>{t}</b><small>{x}</small></span>
            </button>
          ))}
        </div>
        {(d.pagoModo === "anticipo_pct" || d.pagoModo === "anticipo_fijo") && (
          <label className="campo"><span>{d.pagoModo === "anticipo_pct" ? "Porcentaje del anticipo" : "Cantidad del anticipo"}</span>
            <span className="con-unidad"><input className="input" inputMode="decimal" value={d.pagoValor} onChange={(e) => cambia({ pagoValor: e.target.value })} placeholder={d.pagoModo === "anticipo_pct" ? "30" : "$50"} /><em>{d.pagoModo === "anticipo_pct" ? "%" : "MXN"}</em></span></label>
        )}
        <label className="campo"><span>Se puede cancelar hasta (horas antes)</span><input className="input" inputMode="numeric" value={d.cancelarHorasAntes} onChange={(e) => cambia({ cancelarHorasAntes: e.target.value })} /></label>
        <label className="campo"><span>Política de cancelación</span><textarea className="input" rows={2} maxLength={400} value={d.politicaCancelacion} onChange={(e) => cambia({ politicaCancelacion: e.target.value })} /></label>
        <label className="campo"><span>Política de reembolso</span><textarea className="input" rows={2} maxLength={400} value={d.politicaReembolso} onChange={(e) => cambia({ politicaReembolso: e.target.value })} placeholder="Ejemplo: el anticipo no es reembolsable si cancelas con menos de 2 horas." /></label>
      </section>

      {res.error && <p className="aviso error" style={{ margin: 0 }}>{res.error}</p>}
      {res.mensaje && !res.error && <p className="confirma"><Icono n="palomita" />{res.mensaje}</p>}
      <div className="acciones"><button type="button" className="bt" disabled={pend} onClick={() => iniciar(async () => setRes(await guardarConfigCitas(d)))}>{pend ? "Guardando…" : "Guardar"}<Fl /></button></div>
    </div>
  );
}
