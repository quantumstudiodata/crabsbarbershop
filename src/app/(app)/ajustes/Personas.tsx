"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal } from "@/components/ui";
import type { Rol } from "@/lib/permisos";
import { CamposFormaPago, type FormaActual } from "./CamposFormaPago";
import { actualizarPersona, darDeAlta, darDeBaja, restablecer, verClave, type ClaveVisible, type EstadoPersona } from "./actions";

type Persona = {
  id: string; nombre: string; usuario: string; rol: Rol; avatar: string; activo: boolean; metaSemanal: number; permisosExtra: string[];
  debeCambiar: boolean; pide: boolean; claveHasta: number | null; yo: boolean; editable: boolean; forma: FormaActual; formaTexto: string;
};
type Props = {
  personas: Persona[]; roles: { valor: Rol; texto: string; detalle: string }[]; nombresRol: Record<Rol, string>;
  permisos: { clave: string; texto: string }[]; permisosPorRol: Record<Rol, readonly string[]>; restablecerId: string | null;
};

const GRUPO: Record<Rol, string> = { duena: "Propietario", admin: "Administración", contador: "Contador", encargada: "Encargado", barbera: "Barberos" };

/** Minutos que faltan, actualizado cada segundo. */
function useRestante(hasta: number | null) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!hasta) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasta]);
  return hasta ? Math.max(0, hasta - ahora) : 0;
}

function EstadoPersona({ p }: { p: Persona }) {
  const ms = useRestante(p.claveHasta);
  if (p.claveHasta && ms > 0) return <span className="est temp"><span className="d" style={{ background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />Clave temporal, {Math.ceil(ms / 60000)} min</span>;
  if (p.debeCambiar) return <span className="est temp"><span className="d" style={{ background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />Falta elegir contraseña</span>;
  return <span className="est"><span className="d" />Activa</span>;
}

function VentanaClave({ c, cerrar }: { c: ClaveVisible | null; cerrar: () => void }) {
  const ms = useRestante(c?.expira ?? null);
  const [copiado, setCopiado] = useState(false);
  if (!c) return null;
  const total = 30 * 60000;
  const circ = 2 * Math.PI * 54;
  const min = Math.floor(ms / 60000), seg = Math.floor((ms % 60000) / 1000);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Contraseña temporal" titulo={c.nombre}>
      <div className="cronometro">
        <svg viewBox="0 0 124 124" aria-hidden="true">
          <circle cx="62" cy="62" r="54" fill="none" stroke="var(--accent-soft)" strokeWidth="7" />
          <circle cx="62" cy="62" r="54" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${circ * (ms / total)} ${circ}`} transform="rotate(-90 62 62)" style={{ transition: "stroke-dasharray 1s linear" }} />
          <text x="62" y="60" textAnchor="middle" style={{ font: "600 24px var(--f-body)", fill: "var(--fg)" }}>{min}:{String(seg).padStart(2, "0")}</text>
          <text x="62" y="80" textAnchor="middle" style={{ font: "500 10px var(--f-mono)", fill: "var(--faint)", letterSpacing: ".1em" }}>MINUTOS</text>
        </svg>
        <div style={{ width: "100%" }}>
          <span className="lab">Usuario</span>
          <p style={{ font: "600 18px var(--f-mono)", margin: "6px 0 14px" }}>{c.usuario}</p>
          <span className="lab">Contraseña</span>
          <div className="clave" style={{ marginTop: 6 }}>{ms > 0 ? c.clave : "Expiró"}</div>
        </div>
        <p className="ayuda-txt">
          Puedes volver a verla desde la lista mientras corre el tiempo.
          <br />
          Al entrar, tendrá que elegir una propia.
        </p>
      </div>
      <div className="acciones">
        <button type="button" className="bt sec solo" disabled={ms <= 0} onClick={() => navigator.clipboard?.writeText(`Usuario: ${c.usuario}\nContraseña temporal: ${c.clave}`).then(() => setCopiado(true)).catch(() => {})}>
          <Icono n={copiado ? "palomita" : "copiar"} />{copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" className="bt" onClick={cerrar}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button>
      </div>
    </Modal>
  );
}

function EditarPersona({ p, props, cerrar }: { p: Persona; props: Props; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoPersona, FormData>(actualizarPersona, {});
  const [rol, setRol] = useState<Rol>(p.rol);
  useEffect(() => { if (e.ok) cerrar(); }, [e.ok, e.n, cerrar]);
  const base = new Set(props.permisosPorRol[rol]);
  const atiende = rol === "barbera" || rol === "encargada";
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Editar usuario" titulo={p.nombre} ancho>
      <form action={accion} className="pila">
        <input type="hidden" name="id" value={p.id} />
        <label className="campo"><span>Nombre completo</span><input className="input" name="nombre" defaultValue={p.nombre} /></label>
        <div className="campo">
          <span>Rol</span>
          <div className="opciones-t" role="radiogroup">
            {props.roles.map((r) => (
              <label key={r.valor} className="opcion-t"><input type="radio" name="rol" value={r.valor} checked={rol === r.valor} onChange={() => setRol(r.valor)} /><b>{r.texto}</b><small>{r.detalle}</small></label>
            ))}
          </div>
        </div>
        <div className="campo">
          <span>Permisos<Ayuda titulo="Permisos">Los que ya trae el rol aparecen encendidos y no se pueden quitar. Los demás se pueden dar como permiso extra.</Ayuda></span>
          <div className="permisos">
            {props.permisos.map((x) => (
              <div key={`${rol}-${x.clave}`}>
                <span>{x.texto}{base.has(x.clave) && <small>Incluido en su rol</small>}</span>
                {base.has(x.clave)
                  ? <Interruptor etiqueta={x.texto} checked disabled />
                  : <Interruptor name="permisos" value={x.clave} etiqueta={x.texto} defaultChecked={p.permisosExtra.includes(x.clave)} />}
              </div>
            ))}
          </div>
        </div>
        {atiende && (
          <div className="campo">
            <span>Forma de pago<Ayuda titulo="Forma de pago">Cómo gana esta persona. Con esto se calcula lo que le corresponde. Si la cambias, lo ya cobrado conserva la forma con la que se cobró.</Ayuda></span>
            <CamposFormaPago actual={p.forma} nombre={p.nombre} />
          </div>
        )}
        {atiende && (
          <label className="campo">
            <span>Meta de ventas por semana<Ayuda titulo="Meta semanal">Se le muestra en su Inicio con una barra de avance. Si la dejas vacía, se calcula sola con sus ventas; al principio es de $4,000.</Ayuda></span>
            <input className="input" name="meta" inputMode="decimal" defaultValue={p.metaSemanal ? String(p.metaSemanal / 100) : ""} placeholder="Ejemplo: 5000" />
          </label>
        )}
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button>
          <button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}

export function Personas(props: Props) {
  const [clave, setClave] = useState<ClaveVisible | null>(null);
  const [editar, setEditar] = useState<Persona | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "restablecer" | "baja"; p: Persona } | null>(
    () => (props.restablecerId ? { tipo: "restablecer", p: props.personas.find((x) => x.id === props.restablecerId)! } : null),
  );
  const [alta, setAlta] = useState(false);
  const [rolAlta, setRolAlta] = useState<Rol>("barbera");
  const [nombreAlta, setNombreAlta] = useState("");
  const [aviso, setAviso] = useState<EstadoPersona>({});
  const [pendiente, iniciar] = useTransition();
  const [eAlta, accAlta, guardandoAlta] = useActionState<EstadoPersona, FormData>(darDeAlta, {});

  useEffect(() => { if (eAlta.ok && eAlta.clave) { setAlta(false); setClave(eAlta.clave); } }, [eAlta.n, eAlta.ok, eAlta.clave]);

  const ejecutar = (f: () => Promise<EstadoPersona>) => iniciar(async () => {
    const r = await f();
    setConfirmar(null);
    if (r.clave) setClave(r.clave);
    setAviso(r);
  });

  const grupos = (["duena", "admin", "contador", "encargada", "barbera"] as Rol[]).map((r) => ({ r, gente: props.personas.filter((p) => p.rol === r) })).filter((g) => g.gente.length);
  const piden = props.personas.filter((p) => p.pide && p.editable);

  return (
    <>
      <div className="entre">
        <div>
          <h1 className="titulo">Usuarios</h1>
          <p className="sub">Cada quien entra con su usuario y ve solo lo que le toca.</p>
        </div>
        <button type="button" className="bt" onClick={() => { setNombreAlta(""); setRolAlta("barbera"); setAlta(true); }}>Agregar usuario<span className="fl" aria-hidden="true"><Icono n="mas" /></span></button>
      </div>
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.mensaje && <p className="aviso ok">{aviso.mensaje}</p>}
      {piden.map((p) => (
        <div key={p.id} className="glass panel" style={{ boxShadow: "var(--sh1), inset 0 0 0 2px var(--accent)" }}>
          <div className="entre">
            <span className="persona"><Avatar avatar={p.avatar} nombre={p.nombre} t={40} /><span><b>{p.nombre} pidió restablecer su contraseña</b><small className="muted" style={{ display: "block" }}>Lo pidió desde la pantalla de entrada.</small></span></span>
            <button type="button" className="bt solo" onClick={() => setConfirmar({ tipo: "restablecer", p })}><Icono n="llave" />Restablecer</button>
          </div>
        </div>
      ))}

      <div className="glass panel" style={{ padding: "6px 10px 12px" }}>
        {grupos.map(({ r, gente }) => (
          <div key={r}>
            <div className="grupo">{GRUPO[r]}</div>
            {gente.map((p) => (
              <div key={p.id} className="fila-p" >
                <Avatar avatar={p.avatar} nombre={p.nombre} t={42} />
                <span style={{ minWidth: 0 }}><b>{p.nombre}</b>{p.yo && <span className="etiqueta" style={{ marginLeft: 8, padding: "2px 8px" }}>Tú</span>}<small><span style={{ fontFamily: "var(--f-mono)" }}>{p.usuario}</span>{p.formaTexto ? `, ${p.formaTexto.charAt(0).toLowerCase()}${p.formaTexto.slice(1)}` : ""}</small></span>
                <span className="est-col"><EstadoPersona p={p} /></span>
                <span className="acts">
                  {p.editable && (
                    <>
                      <button type="button" className="icb" onClick={() => setEditar(p)} aria-label={`Editar a ${p.nombre}`} title="Editar"><Icono n="editar" /></button>
                      {p.claveHasta && p.claveHasta > Date.now()
                        ? <button type="button" className="icb" onClick={() => ejecutar(() => verClave(p.id))} aria-label={`Ver la contraseña temporal de ${p.nombre}`} title="Ver contraseña temporal"><Icono n="ojo" /></button>
                        : <button type="button" className="icb" onClick={() => setConfirmar({ tipo: "restablecer", p })} aria-label={`Restablecer la contraseña de ${p.nombre}`} title="Restablecer contraseña"><Icono n="llave" /></button>}
                      <button type="button" className="icb peligro" onClick={() => setConfirmar({ tipo: "baja", p })} aria-label={`Eliminar a ${p.nombre}`} title="Eliminar"><Icono n="basura" /></button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Modal abierto={alta} cerrar={() => setAlta(false)} etiqueta="Nuevo usuario" titulo="Agregar usuario" ancho>
        <form action={accAlta} className="pila">
          <label className="campo"><span>Nombre completo</span><input className="input" name="nombre" value={nombreAlta} onChange={(e) => setNombreAlta(e.target.value)} placeholder="Ejemplo: Ana Martínez López" required /></label>
          <div className="campo">
            <span>Rol</span>
            <div className="opciones-t" role="radiogroup">
              {props.roles.map((r) => (
                <label key={r.valor} className="opcion-t"><input type="radio" name="rol" value={r.valor} checked={rolAlta === r.valor} onChange={() => setRolAlta(r.valor)} /><b>{r.texto}</b><small>{r.detalle}</small></label>
              ))}
            </div>
          </div>
          {(rolAlta === "barbera" || rolAlta === "encargada") && (
            <div className="campo">
              <span>Forma de pago<Ayuda titulo="Forma de pago">Cómo gana esta persona: un porcentaje, un monto por servicio, renta de silla o sueldo. Se puede cambiar después.</Ayuda></span>
              <CamposFormaPago actual={null} nombre={nombreAlta} />
            </div>
          )}
          <p className="ayuda-txt">El usuario se arma con las iniciales y el primer apellido.<br />La contraseña temporal se podrá ver durante 30 minutos.</p>
          {eAlta.error && <p className="aviso error">{eAlta.error}</p>}
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setAlta(false)}>Regresar</button>
            <button className="bt" disabled={guardandoAlta}>{guardandoAlta ? "Guardando…" : "Dar de alta"}<Fl /></button>
          </div>
        </form>
      </Modal>

      {confirmar?.tipo === "restablecer" && (
        <Modal abierto cerrar={() => setConfirmar(null)} etiqueta="Restablecer contraseña" titulo={`¿Restablecer la contraseña de ${confirmar.p.nombre.split(" ")[0]}?`}>
          <p className="muted">Su contraseña actual dejará de servir y se cerrará su sesión.<br />Verás una temporal durante 30 minutos para dársela.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setConfirmar(null)}>Regresar</button>
            <button type="button" className="bt" disabled={pendiente} onClick={() => ejecutar(() => restablecer(confirmar.p.id))}>{pendiente ? "Generando…" : "Sí, restablecer"}<Fl /></button>
          </div>
        </Modal>
      )}
      {confirmar?.tipo === "baja" && (
        <Modal abierto cerrar={() => setConfirmar(null)} etiqueta="Eliminar usuario" titulo={`¿Eliminar a ${confirmar.p.nombre.split(" ")[0]}?`}>
          <p className="muted">Ya no podrá entrar y desaparece de la lista.<br />Sus ventas pasadas se conservan en los reportes.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setConfirmar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => ejecutar(() => darDeBaja(confirmar.p.id))}>{pendiente ? "Eliminando…" : "Sí, eliminar"}<Fl /></button>
          </div>
        </Modal>
      )}
      {editar && <EditarPersona p={editar} props={props} cerrar={() => setEditar(null)} />}
      <VentanaClave c={clave} cerrar={() => setClave(null)} />
    </>
  );
}
