"use client";

import { useActionState, useEffect, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { type BarberoMeta, metaDelNegocio } from "@/lib/metas";
import { formatoDinero } from "@/lib/money";
import { Funciones, type Funcion } from "./Funciones";
import { type EstadoReglas, guardarReglas } from "./actions";

/** Un ajuste con botones rápidos, control deslizante y una vista previa de lo que significa. */
function Ajuste({ name, titulo, ayuda, inicial, opciones, max, paso, formato, vista, sinDeslizador }: {
  name: string; titulo: string; ayuda: string; inicial: number; opciones: number[]; max: number; paso: number;
  formato: (v: number) => string; vista: (v: number) => React.ReactNode; sinDeslizador?: boolean;
}) {
  const [v, setV] = useState(inicial);
  return (
    <div className="ajuste">
      <input type="hidden" name={name} value={v} />
      <div className="entre" style={{ alignItems: "flex-start" }}>
        <span><b>{titulo}</b><small>{ayuda}</small></span>
        <span className="valor-a" key={v}>{formato(v)}</span>
      </div>
      {!sinDeslizador && <input type="range" min={0} max={max} step={paso} value={Math.min(v, max)} onChange={(e) => setV(Number(e.target.value))} aria-label={titulo}
        style={{ "--p": `${(Math.min(v, max) / max) * 100}%` } as React.CSSProperties} />}
      <div className="billetes">
        {opciones.map((o) => <button type="button" key={o} className={v === o ? "on" : ""} onClick={() => setV(o)}>{formato(o)}</button>)}
      </div>
      <div className="vista-a" key={`v${v}`}>{vista(v)}</div>
    </div>
  );
}

/** Formulario que guarda sin recargar. La barra de guardar aparece solo cuando hay cambios pendientes. */
function FormGuardar({ children, className, conBoton = true }: { children: React.ReactNode; className: string; conBoton?: boolean }) {
  const [e, accion, guardando] = useActionState<EstadoReglas, FormData>(guardarReglas, {});
  const [sucio, setSucio] = useState(false);
  useEffect(() => { if (e.ok) setSucio(false); }, [e.ok, e.n]);
  const marcar = (x: React.SyntheticEvent) => { const t = x.target as HTMLElement; if (t.closest(".billetes button, input[type=range]")) setSucio(true); };
  return (
    <form action={accion} className={className} onChange={marcar} onClick={marcar}>
      {children}
      {e.error && !sucio && <p className="aviso error">{e.error}</p>}
      {e.ok && !sucio && !guardando && <p className="confirma" key={e.n}><Icono n="palomita" />Cambios guardados.</p>}
      {conBoton && sucio && (
        <div className="barra-guardar">
          <span>Tienes cambios sin guardar</span>
          <button className="bt chico" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}<Fl /></button>
        </div>
      )}
    </form>
  );
}

export function ReglasCobro({ descuento, autorizan, funciones }: { descuento: number; autorizan: string; funciones: Funcion[] }) {
  const [conDescuentos, setConDescuentos] = useState(funciones.find((f) => f.clave === "descuentos")?.activa ?? true);
  return (
    <FormGuardar className="pila" conBoton={conDescuentos}>
      <span className="sub-a">Reglas de cobro</span>
      <Funciones funciones={funciones} alCambiar={(clave, activa) => { if (clave === "descuentos") setConDescuentos(activa); }} />
      {conDescuentos && (
        <Ajuste name="descuento" titulo="Autorización de descuentos" ayuda="Hasta cuánto puede descontar un barbero por su cuenta. Más que eso lo autoriza alguien con permiso."
          inicial={descuento} opciones={[0, 10, 20, 50, 100]} max={100} paso={5} formato={(v) => `${v}%`} sinDeslizador
          vista={(v) => v === 0 ? <>Ningún barbero puede dar descuentos sin autorización.</> : v === 100 ? <><b>No se necesita autorización.</b> Cualquier barbero puede dar el descuento que quiera por su cuenta, hasta dejar el servicio gratis.</> : <>En un corte de $150, un barbero puede descontar hasta <b>{formatoDinero(Math.round(15000 * v / 100))}</b>. Más que eso lo autoriza: {autorizan}.</>} />
      )}
    </FormGuardar>
  );
}

export function CajaAjustes({ fondo, diferencia }: { fondo: number; diferencia: number }) {
  return (
    <FormGuardar className="pila">
      <Ajuste name="fondo" titulo="Fondo inicial sugerido" ayuda="El efectivo con el que se abre la caja. Con la apertura automática, la caja se abre sola con esta cantidad."
        inicial={fondo} opciones={[0, 100, 200, 500]} max={2000} paso={50} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>La caja se abre con <b>{formatoDinero(v * 100)}</b>.</> : <>La caja se abre sin fondo.</>} />
      <Ajuste name="diferencia" titulo="Diferencia permitida al cerrar" ayuda="Si al contar falta o sobra más, se pide explicar qué pasó."
        inicial={diferencia} opciones={[0, 20, 50, 100]} max={500} paso={10} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>Faltar o sobrar hasta <b>{formatoDinero(v * 100)}</b> no pide explicación.</> : <>Cualquier diferencia pide explicación.</>} />
    </FormGuardar>
  );
}

export function MetaMensual({ metaMensual, datosMeta }: { metaMensual: number; datosMeta: { egresos: number; barberos: BarberoMeta[]; dias: number } }) {
  return (
    <FormGuardar className="pila">
      <Ajuste name="metaMensual" titulo="Meta mensual del negocio" ayuda="Establece cuánto deseas obtener mensualmente después de pagar las comisiones de tus barberos. El sistema calculará las metas diarias de venta necesarias para alcanzar ese objetivo."
        inicial={metaMensual} opciones={[0, 10000, 20000, 40000]} max={150000} paso={1000} formato={(v) => (v ? formatoDinero(v * 100) : "Sin meta")}
        vista={(v) => <VistaMeta meta={v} datos={datosMeta} />} />
    </FormGuardar>
  );
}

/** Cómo queda la meta de cada barbero con la meta mensual elegida. */
function VistaMeta({ meta, datos }: { meta: number; datos: { egresos: number; barberos: BarberoMeta[]; dias: number } }) {
  if (!meta) return <>Sin meta mensual, la meta de cada día se calcula sola con lo que se ha vendido.</>;
  const r = metaDelNegocio(meta * 100, 0, datos.barberos, datos.dias);
  const conMeta = r.porBarbero.filter((b) => b.aplica);
  return (
    <div className="vista-meta">
      <span><b style={{ fontSize: 15 }}>Objetivo mensual: {formatoDinero(meta * 100)}</b><br />
        El equipo deberá generar suficientes ventas para que el negocio conserve {formatoDinero(meta * 100)} después de pagar las comisiones{r.sueldos ? " y los sueldos" : ""}.
        Esta cifra todavía no descuenta renta, luz, agua y demás gastos.</span>
      <span className="lab" style={{ marginTop: 4 }}>Meta diaria de ventas de cada barbero</span>
      <div className="metas-b">
        {r.porBarbero.map((b) => (
          <div key={b.id}>
            <b>{b.nombre.split(" ")[0]}</b>
            {b.aplica ? <><span className="num">{formatoDinero(b.diaria)}</span><small>en ventas cada día. No es su comisión: es lo que debe cobrar a clientes.</small></> : <><span className="muted">Sin meta</span><small>Paga renta de silla</small></>}
          </div>
        ))}
      </div>
      {conMeta.length > 0 && <span>Entre todos: <b>{formatoDinero(r.diaria)}</b> en ventas al día, durante {datos.dias} días de trabajo (lunes a sábado).</span>}
    </div>
  );
}
