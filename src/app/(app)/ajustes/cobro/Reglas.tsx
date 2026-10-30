"use client";

import { useActionState, useEffect, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { type BarberoMeta, metaDelNegocio } from "@/lib/metas";
import { formatoDinero } from "@/lib/money";
import { Funciones, type Funcion } from "./Funciones";
import { type EstadoReglas, guardarReglas } from "./actions";

/** Un ajuste con botones rápidos, control deslizante y una vista previa de lo que significa. */
function Ajuste({ name, titulo, ayuda, inicial, opciones, max, paso, formato, vista }: {
  name: string; titulo: string; ayuda: string; inicial: number; opciones: number[]; max: number; paso: number;
  formato: (v: number) => string; vista: (v: number) => React.ReactNode;
}) {
  const [v, setV] = useState(inicial);
  return (
    <div className="ajuste">
      <input type="hidden" name={name} value={v} />
      <div className="entre" style={{ alignItems: "flex-start" }}>
        <span><b>{titulo}</b><small>{ayuda}</small></span>
        <span className="valor-a" key={v}>{formato(v)}</span>
      </div>
      <input type="range" min={0} max={max} step={paso} value={Math.min(v, max)} onChange={(e) => setV(Number(e.target.value))} aria-label={titulo}
        style={{ "--p": `${(Math.min(v, max) / max) * 100}%` } as React.CSSProperties} />
      <div className="billetes">
        {opciones.map((o) => <button type="button" key={o} className={v === o ? "on" : ""} onClick={() => setV(o)}>{formato(o)}</button>)}
      </div>
      <div className="vista-a">{vista(v)}</div>
    </div>
  );
}

/** Formulario que guarda sin recargar. El botón dice "Guardado" hasta que se cambie algo. */
function FormGuardar({ children, className, conBoton = true }: { children: React.ReactNode; className: string; conBoton?: boolean }) {
  const [e, accion, guardando] = useActionState<EstadoReglas, FormData>(guardarReglas, {});
  const [sucio, setSucio] = useState(false);
  useEffect(() => { if (e.ok) setSucio(false); }, [e.ok, e.n]);
  const guardado = !!e.ok && !sucio && !guardando;
  const marcar = (x: React.SyntheticEvent) => { const t = x.target as HTMLElement; if (t.closest(".billetes button, input[type=range]")) setSucio(true); };
  return (
    <form action={accion} className={className} onChange={marcar} onClick={marcar}>
      {children}
      {e.error && !sucio && <p className="aviso error">{e.error}</p>}
      {conBoton && <div className="acciones">
        <button className={`bt ${guardado ? "guardado" : ""}`} disabled={guardando || guardado}>
          {guardando ? "Guardando…" : guardado ? "Guardado" : "Guardar"}
          {guardado ? <span className="fl" aria-hidden="true"><Icono n="palomita" /></span> : <Fl />}
        </button>
      </div>}
    </form>
  );
}

export function ReglasCobro({ descuento, autorizan, funciones }: { descuento: number; autorizan: string; funciones: Funcion[] }) {
  const [conDescuentos, setConDescuentos] = useState(funciones.find((f) => f.clave === "descuentos")?.activa ?? true);
  return (
    <FormGuardar className="glass panel bloque-a" conBoton={conDescuentos}>
      <span className="lab">2. Reglas de cobro</span>
      <p className="ayuda-txt" style={{ marginTop: -4 }}>Qué botones aparecen en la pantalla de cobro.</p>
      <Funciones funciones={funciones} alCambiar={(clave, activa) => { if (clave === "descuentos") setConDescuentos(activa); }} />
      {conDescuentos && (
        <Ajuste name="descuento" titulo="Autorización de descuentos" ayuda="Hasta cuánto puede descontar un barbero por su cuenta. Más que eso lo autoriza alguien con permiso."
          inicial={descuento} opciones={[0, 10, 20, 50, 100]} max={100} paso={5} formato={(v) => `${v}%`}
          vista={(v) => v === 0 ? <>Ningún barbero puede dar descuentos sin autorización.</> : v === 100 ? <>Un barbero puede dar cualquier descuento por su cuenta, hasta dejar el servicio gratis.</> : <>En un corte de $150, un barbero puede descontar hasta <b>{formatoDinero(Math.round(15000 * v / 100))}</b>. Más que eso lo autoriza: {autorizan}.</>} />
      )}
    </FormGuardar>
  );
}

export function CajaObjetivos({ fondo, diferencia, metaMensual, datosMeta }: { fondo: number; diferencia: number; metaMensual: number; datosMeta: { egresos: number; barberos: BarberoMeta[]; dias: number } }) {
  return (
    <FormGuardar className="glass panel bloque-a">
      <span className="lab">3. Caja y objetivos</span>
      <Ajuste name="fondo" titulo="Fondo inicial sugerido" ayuda="El efectivo que aparece listo al abrir la caja."
        inicial={fondo} opciones={[0, 100, 200, 500]} max={2000} paso={50} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>Al abrir la caja aparecerá <b>{formatoDinero(v * 100)}</b>; se puede cambiar en el momento.</> : <>Al abrir la caja se escribe el fondo cada vez.</>} />
      <Ajuste name="diferencia" titulo="Diferencia permitida al cerrar" ayuda="Si al contar falta o sobra más, se pide explicar qué pasó."
        inicial={diferencia} opciones={[0, 20, 50, 100]} max={500} paso={10} formato={(v) => formatoDinero(v * 100)}
        vista={(v) => v ? <>Faltar o sobrar hasta <b>{formatoDinero(v * 100)}</b> no pide explicación.</> : <>Cualquier diferencia pide explicación.</>} />
      <Ajuste name="metaMensual" titulo="Meta mensual del negocio" ayuda="Lo que el negocio quiere que le quede al mes. Con esto se calcula cuánto debe cobrar cada barbero al día."
        inicial={metaMensual} opciones={[0, 10000, 20000, 40000]} max={150000} paso={1000} formato={(v) => (v ? formatoDinero(v * 100) : "Sin meta")}
        vista={(v) => <VistaMeta meta={v} datos={datosMeta} />} />
    </FormGuardar>
  );
}

/** Cómo queda la meta de cada barbero con la meta mensual elegida. */
function VistaMeta({ meta, datos }: { meta: number; datos: { egresos: number; barberos: BarberoMeta[]; dias: number } }) {
  if (!meta) return <>Sin meta mensual, la meta de cada día se calcula sola con lo que se ha vendido.</>;
  const r = metaDelNegocio(meta * 100, datos.egresos, datos.barberos, datos.dias);
  return (
    <div className="vista-meta">
      <span>Para que al negocio le queden <b>{formatoDinero(meta * 100)}</b> al mes hay que cubrir <b>{formatoDinero(r.cubrir)}</b>:
        la meta{r.egresos ? <>, más {formatoDinero(r.egresos)} de egresos de un mes normal</> : null}{r.sueldos ? <>, más {formatoDinero(r.sueldos)} de sueldos</> : null}{r.rentas ? <>, menos {formatoDinero(r.rentas)} de rentas de silla</> : null}.</span>
      <div className="metas-b">
        {r.porBarbero.map((b) => (
          <div key={b.id}>
            <b>{b.nombre.split(" ")[0]}</b>
            {b.aplica ? <><span className="num">{formatoDinero(b.diaria)} al día</span><small>Al negocio le queda el {b.parteNegocio}% de lo que cobra</small></> : <><span className="muted">Sin meta</span><small>Paga renta de silla</small></>}
          </div>
        ))}
      </div>
      <span>Meta del negocio por día: <b>{formatoDinero(r.diaria)}</b>, en {datos.dias} días de trabajo.</span>
    </div>
  );
}
