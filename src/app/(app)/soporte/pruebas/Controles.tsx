"use client";

import { useActionState, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { MenuPuntos } from "@/components/MenuPuntos";
import { Modal } from "@/components/ui";
import { crearNegocioPrueba, type EstadoSoporte, limpiarRegistros, mantenimientoPrueba } from "../actions";

/** Cuentas con su usuario y contraseña, cada una con botón para copiarla. */
function Cuentas({ cuentas }: { cuentas: { puesto: string; usuario: string; clave: string }[] }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopiado(k); setTimeout(() => setCopiado(null), 1500); } catch { /* sin portapapeles */ } };
  return (
    <div className="acc-p">
      {cuentas.map((c) => (
        <div key={c.usuario} className="acc-f">
          <span className="acc-pu">{c.puesto}</span>
          <button type="button" className="accp-c" onClick={() => copiar(`u${c.usuario}`, c.usuario)} title="Copiar usuario"><small>Usuario</small><b className="mono">{c.usuario}</b><em>{copiado === `u${c.usuario}` ? "Copiado" : "Copiar"}</em></button>
          <button type="button" className="accp-c" onClick={() => copiar(`c${c.usuario}`, c.clave)} title="Copiar contraseña"><small>Contraseña</small><b className="mono">{c.clave}</b><em>{copiado === `c${c.usuario}` ? "Copiado" : "Copiar"}</em></button>
        </div>
      ))}
    </div>
  );
}

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
            <Cuentas cuentas={e.cuentas ?? []} />
          </div>
        ) : (
          <form action={accion} className="pila">
            <p className="muted">Se crea con servicios de ejemplo, formas de pago, citas y reservas en línea, comisiones automáticas y una cuenta de cada puesto: Titular, Administrador, Encargado y Barbero.</p>
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
  const [accion, setAccion] = useState<Accion | null>(null);
  const [vez, setVez] = useState(0);
  const abrir = (a: Accion) => { setAccion(a); setVez((n) => n + 1); };
  return (
    <>
      <MenuPuntos etiqueta={`Opciones de ${nombre}`} items={[
        { texto: "Ver cuentas y contraseñas", icono: "llave", hacer: () => abrir("accesos") },
        { texto: "Crear datos de demostración", icono: "mas", hacer: () => abrir("demo") },
        { texto: "Restablecer datos de prueba", icono: "historial", hacer: () => abrir("restablecer") },
        { texto: "Eliminar negocio de prueba", icono: "basura", hacer: () => abrir("eliminar"), peligro: true },
      ]} />
      {accion && <Operacion key={vez} id={id} nombre={nombre} conteo={conteo} accion={accion} cerrar={() => setAccion(null)} />}
    </>
  );
}

type Accion = "restablecer" | "eliminar" | "demo" | "accesos";

function Operacion({ id, nombre, conteo, accion, cerrar }: { id: string; nombre: string; conteo: Conteo; accion: Accion; cerrar: () => void }) {
  const [e, enviar, trabajando] = useActionState<EstadoSoporte, FormData>(mantenimientoPrueba, {});
  return (
    <>
      <Modal abierto cerrar={cerrar} etiqueta={nombre} titulo={accion === "accesos" ? `Cuentas de ${nombre}` : accion === "demo" ? `Datos de demostración en ${nombre}` : accion === "restablecer" ? `Restablecer ${nombre}` : `Eliminar ${nombre}`}>
        {e.ok ? <div className="pila"><p className="aviso ok">{e.mensaje}</p>{e.cuentas && <Cuentas cuentas={e.cuentas} />}</div> : (
          <form action={enviar} className="pila">
            <input type="hidden" name="negocioId" value={id} />
            <input type="hidden" name="accion" value={accion} />
            {accion === "accesos" && <p className="muted">Por seguridad las contraseñas no se guardan a la vista. Al continuar se generan contraseñas nuevas para todas las cuentas de este negocio de prueba y las anteriores dejan de funcionar. Las sesiones abiertas siguen abiertas. Si falta la cuenta de algún puesto, se crea.</p>}
            {accion === "demo" && <p className="muted">Se agregan ventas de las últimas dos semanas, con sus cortes de caja cerrados. No se borra nada.</p>}
            {(accion === "restablecer" || accion === "eliminar") && (
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
              <button className={`bt ${accion === "demo" || accion === "accesos" ? "" : "peligro"}`} disabled={trabajando}>
                {trabajando ? "Trabajando…" : accion === "accesos" ? "Generar contraseñas" : accion === "demo" ? "Crear datos" : accion === "restablecer" ? "Restablecer" : "Eliminar negocio"}<Fl />
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
