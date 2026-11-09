"use client";

import { useActionState, useEffect, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor } from "@/components/ui";
import { type BarberoMeta, metaDelNegocio } from "@/lib/metas";
import { formatoDinero } from "@/lib/money";
import { Funciones, type Funcion } from "./Funciones";
import { type EstadoReglas, guardarReglas } from "./actions";

/** Un ajuste con botones rápidos, control deslizante y una vista previa de lo que significa. */
function Ajuste({ name, titulo, ayuda, inicial, opciones, max, paso, formato, vista, sinDeslizador, sugerido }: {
  name: string; titulo: string; ayuda: string; inicial: number; opciones: number[]; max: number; paso: number;
  formato: (v: number) => string; vista: (v: number) => React.ReactNode; sinDeslizador?: boolean;
  /** Un valor calculado por el sistema, que se ofrece primero. */
  sugerido?: { valor: number; texto: string };
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
        {sugerido && <button type="button" className={`sugerido ${v === sugerido.valor ? "on" : ""}`} onClick={() => setV(sugerido.valor)}><Icono n="chispa" />{sugerido.texto}</button>}
        {(opciones.includes(inicial) ? opciones : [...opciones, inicial].sort((a, b) => a - b)).map((o) => <button type="button" key={o} className={v === o ? "on" : ""} onClick={() => setV(o)}>{formato(o)}</button>)}
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
  const marcar = (x: React.SyntheticEvent) => { const t = x.target as HTMLElement; if (t.closest(".billetes button, input[type=range], [data-sucio]")) setSucio(true); };
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

/**
 * Caja: apertura, cierre obligatorio, fondo inicial y diferencia permitida.
 * El fondo sugerido solo hace falta cuando la caja se abre sola; la diferencia se elige con botones de sugerencia.
 */
export function CajaConfig({ apertura, corte, fondo, diferencia }: { apertura: boolean; corte: boolean; fondo: number; diferencia: number }) {
  const [manual, setManual] = useState(apertura);
  const [obligatorio, setObligatorio] = useState(corte);
  const [conTolerancia, setConTolerancia] = useState(diferencia > 0);
  return (
    <div className="pila">
      <Funciones alCambiar={(k, v) => { if (k === "apertura") setManual(v); if (k === "corte") setObligatorio(v); }} funciones={[
        { clave: "apertura", nombre: "Apertura de caja", activa: apertura, encendida: "Alguien abre la caja contando el fondo inicial.", apagada: "La caja se abre sola con el fondo inicial sugerido al primer cobro del día." },
        { clave: "corte", nombre: "Cierre de caja obligatorio", activa: corte, encendida: "No se puede cobrar con la caja de un día anterior abierta: primero se hace el corte.", apagada: "Se puede seguir cobrando sin cerrar la caja del día anterior." },
      ]} />
      {!obligatorio && <p className="aviso-riesgo">Sin cierre obligatorio, las ventas de varios días pueden quedar en un mismo corte y es más difícil saber cuándo faltó o sobró dinero.</p>}
      <FormGuardar className="pila">
        {!manual && (
          <Ajuste name="fondo" titulo="Fondo inicial sugerido" ayuda="El efectivo con el que la caja se abre sola al primer cobro del día."
            inicial={fondo} opciones={[0, 100, 200, 500]} max={2000} paso={50} formato={(v) => formatoDinero(v * 100)} sinDeslizador
            vista={(v) => v ? <>La caja se abre con <b>{formatoDinero(v * 100)}</b>.</> : <>La caja se abre sin fondo.</>} />
        )}
        <div className="ajuste">
          <div className="entre" style={{ alignItems: "flex-start" }}>
            <span><b>Permitir una diferencia al cerrar</b><small>{conTolerancia ? "Si falta o sobra poco, no se pide explicar qué pasó." : "Cualquier diferencia, por pequeña que sea, pide explicar qué pasó."}</small></span>
            <span data-sucio=""><Interruptor etiqueta="Permitir una diferencia al cerrar" checked={conTolerancia} onChange={setConTolerancia} /></span>
          </div>
          {conTolerancia
            ? <Ajuste name="diferencia" titulo="Diferencia permitida al cerrar" ayuda="Si al contar falta o sobra más que esto, se pide explicar qué pasó."
                inicial={diferencia || 20} opciones={[20, 50, 100, 200]} max={500} paso={10} formato={(v) => formatoDinero(v * 100)} sinDeslizador
                vista={(v) => <>Faltar o sobrar hasta <b>{formatoDinero(v * 100)}</b> no pide explicación.</>} />
            : <input type="hidden" name="diferencia" value="0" />}
        </div>
      </FormGuardar>
    </div>
  );
}

type DatosMeta = { egresos: number; barberos: BarberoMeta[]; dias: number; fijos: { concepto: string; mensual: number }[] };

export function MetaMensual({ metaMensual, datosMeta }: { metaMensual: number; datosMeta: DatosMeta }) {
  // Meta calculada: lo que cuestan al mes los gastos frecuentes, redondeado a miles. Los sueldos y las rentas
  // de silla ya entran en la meta de cada barbero. Sin gastos frecuentes ni sueldos, no se propone nada.
  const fijos = datosMeta.fijos.reduce((a, f) => a + f.mensual, 0);
  const hayEsquemas = datosMeta.barberos.some((b) => b.tipo);
  const calculada = fijos > 0 ? Math.ceil(fijos / 100 / 1000) * 1000 : 0;
  return (
    <FormGuardar className="pila">
      <Ajuste name="metaMensual" titulo="Meta mensual del negocio" ayuda="Establece cuánto deseas obtener mensualmente después de pagar al equipo. El sistema calculará las metas diarias de venta necesarias para alcanzar ese objetivo."
        inicial={metaMensual} opciones={[0, 10000, 20000, 40000]} max={150000} paso={1000} formato={(v) => (v ? formatoDinero(v * 100) : "Sin meta")}
        sugerido={calculada && hayEsquemas ? { valor: calculada, texto: `Calculada, ${formatoDinero(calculada * 100)}` } : undefined}
        vista={(v) => <VistaMeta meta={v} datos={datosMeta} calculada={calculada} />} />
    </FormGuardar>
  );
}

/** Cómo queda la meta de cada barbero con la meta mensual elegida. */
function VistaMeta({ meta, datos, calculada }: { meta: number; datos: DatosMeta; calculada: number }) {
  if (!meta) return <>Sin meta mensual, la meta de cada día se calcula sola con lo que se ha vendido.</>;
  const r = metaDelNegocio(meta * 100, 0, datos.barberos, datos.dias);
  const conMeta = r.porBarbero.filter((b) => b.aplica);
  const ventasMes = conMeta.reduce((a, b) => a + b.mensual, 0);
  const $p = (c: number) => formatoDinero(Math.round(c / 100) * 100);
  const pagos: Record<string, string> = { porcentaje: "porcentaje por servicio", fijo: "pago fijo por servicio", renta: "renta de silla", sueldo: "sueldo fijo", mixto: "sueldo más porcentaje" };
  return (
    <div className="vista-meta">
      {meta === calculada && (
        <div className="calculo-m">
          <span className="lab">Cómo se calculó</span>
          {datos.fijos.map((f) => <div key={f.concepto}><span>{f.concepto}</span><span className="num">{$p(f.mensual)} al mes</span></div>)}
          {r.sueldos > 0 && <div><span>Sueldos del equipo</span><span className="num">+{$p(r.sueldos)}</span></div>}
          {r.rentas > 0 && <div><span>Rentas de silla que entran</span><span className="num">−{$p(r.rentas)}</span></div>}
          {datos.barberos.filter((b) => b.tipo === "porcentaje" || b.tipo === "mixto" || b.tipo === "fijo").map((b) => (
            <div key={b.id}><span>{b.nombre.split(" ")[0]}, {pagos[b.tipo!]}</span><span className="muted">{b.tipo === "fijo" ? `${formatoDinero(b.montoFijo)} por servicio` : `${b.porcentaje / 100}% de lo que cobra`}</span></div>
          ))}
          <div className="tot-m"><span>Ventas necesarias en el mes</span><b className="num">{$p(ventasMes)}</b></div>
          <small>La meta cubre los gastos frecuentes. Los sueldos y las comisiones se suman al calcular cuánto debe vender cada barbero; las rentas de silla se restan. Si cambian, vuelve a elegir la meta calculada.</small>
        </div>
      )}
      <span><b style={{ fontSize: 15 }}>Objetivo mensual: {formatoDinero(meta * 100)}</b><br />
        El equipo deberá generar suficientes ventas para que el negocio conserve {formatoDinero(meta * 100)} después de pagar las comisiones{r.sueldos ? " y los sueldos" : ""}.
        {meta === calculada ? " Con esto se cubren los gastos frecuentes del negocio." : " Esta cifra todavía no descuenta renta, luz, agua y demás gastos."}</span>
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
