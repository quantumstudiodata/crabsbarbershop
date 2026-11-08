"use client";

import { useActionState, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Modal } from "@/components/ui";
import { crearNegocioPrueba, type EstadoSoporte, limpiarRegistros, mantenimientoPrueba } from "../actions";

type Conteo = { ventas: number; egresos: number; cortes: number; usuarios: number; servicios: number; pagos: number; historial: number };

export function CrearPrueba() {
  const [abierto, setAbierto] = useState(false);
  const [e, accion, creando] = useActionState<EstadoSoporte, FormData>(crearNegocioPrueba, {});
  return (
    <>
      <button type="button" className="bt" onClick={() => setAbierto(true)}><Icono n="mas" />Crear negocio de prueba</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta="Entornos de prueba" titulo={e.ok ? "Negocio de prueba creado" : "Crear negocio de prueba"}>
        {e.ok ? (
          <div className="pila">
            <p className="muted">{e.mensaje}</p>
            <div className="tabla-mini">{e.cuentas?.map((c) => <div key={c.usuario}><span>{c.puesto}</span><b className="mono">{c.usuario}</b><b className="mono">{c.clave}</b></div>)}</div>
          </div>
        ) : (
          <form action={accion} className="pila">
            <p className="muted">Se crea con servicios de ejemplo, formas de pago y tres cuentas: Titular, Administrador y Barbero.</p>
            <label className="campo"><span>Nombre del negocio</span><input className="input" name="nombre" placeholder="Ejemplo: Barbería Demo" required minLength={3} maxLength={60} /></label>
            {e.error && <p className="aviso error">{e.error}</p>}
            <div className="acciones"><button className="bt" disabled={creando}>{creando ? "Creando…" : "Crear negocio"}<Fl /></button></div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Menú de cada negocio de prueba. Restablecer y eliminar muestran exactamente qué se borra y piden escribir el nombre. */
export function Mantenimiento({ id, nombre, conteo }: { id: string; nombre: string; conteo: Conteo }) {
  const [accion, setAccion] = useState<"restablecer" | "eliminar" | "demo" | null>(null);
  const [vez, setVez] = useState(0);
  const abrir = (a: "restablecer" | "eliminar" | "demo") => { setAccion(a); setVez((n) => n + 1); };
  return (
    <>
      <MenuPuntos etiqueta={`Opciones de ${nombre}`} items={[
        { texto: "Crear datos de demostración", icono: "mas", hacer: () => abrir("demo") },
        { texto: "Restablecer datos de prueba", icono: "historial", hacer: () => abrir("restablecer") },
        { texto: "Eliminar negocio de prueba", icono: "basura", hacer: () => abrir("eliminar"), peligro: true },
      ]} />
      {accion && <Operacion key={vez} id={id} nombre={nombre} conteo={conteo} accion={accion} cerrar={() => setAccion(null)} />}
    </>
  );
}

function Operacion({ id, nombre, conteo, accion, cerrar }: { id: string; nombre: string; conteo: Conteo; accion: "restablecer" | "eliminar" | "demo"; cerrar: () => void }) {
  const [e, enviar, trabajando] = useActionState<EstadoSoporte, FormData>(mantenimientoPrueba, {});
  return (
    <>
      <Modal abierto cerrar={cerrar} etiqueta={nombre} titulo={accion === "demo" ? `Datos de demostración en ${nombre}` : accion === "restablecer" ? `Restablecer ${nombre}` : `Eliminar ${nombre}`}>
        {e.ok ? <p className="aviso ok">{e.mensaje}</p> : (
          <form action={enviar} className="pila">
            <input type="hidden" name="negocioId" value={id} />
            <input type="hidden" name="accion" value={accion} />
            {accion === "demo" && <p className="muted">Se agregan ventas de las últimas dos semanas, con sus cortes de caja cerrados. No se borra nada.</p>}
            {accion !== "demo" && (
              <>
                <div className="aviso-borrar">
                  <span className="icono-alerta grande"><Icono n="basura" /></span>
                  <p><b>Negocio:</b> {nombre} (de prueba)<br /><b>Se borran para siempre:</b> {conteo.ventas} ventas, {conteo.egresos} egresos, {conteo.cortes} cortes de caja, {conteo.pagos} pagos al equipo y {conteo.historial} registros del historial
                    {accion === "eliminar" ? `, además de sus ${conteo.usuarios} cuentas, ${conteo.servicios} servicios y toda su configuración.` : "."}</p>
                </div>
                {accion === "restablecer" && <p className="muted chico-t">Se conservan las cuentas, servicios, precios y ajustes. Los folios vuelven a empezar en 1.</p>}
                <label className="campo"><span>Escribe {nombre} para confirmar</span><input className="input" name="confirmar" autoComplete="off" required /></label>
              </>
            )}
            {e.error && <p className="aviso error">{e.error}</p>}
            <div className="acciones">
              <button className={`bt ${accion === "demo" ? "" : "peligro"}`} disabled={trabajando}>
                {trabajando ? "Trabajando…" : accion === "demo" ? "Crear datos" : accion === "restablecer" ? "Restablecer" : "Eliminar negocio"}<Fl />
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function LimpiarTemporales() {
  const [e, accion, limpiando] = useActionState<EstadoSoporte>(limpiarRegistros, {});
  return e.ok ? <small className="muted">{e.mensaje}</small> : (
    <form action={accion}><button className="bt sec chico" disabled={limpiando}>{limpiando ? "Limpiando…" : "Limpiar"}</button></form>
  );
}
