"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Fl, Icono } from "@/components/Icono";
import { Interruptor, Modal, Selector } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import type { Rol } from "@/lib/permisos";
import { CamposFormaPago, type FormaActual } from "./CamposFormaPago";
import { actualizarPersona, darDeAlta, darDeBaja, desactivar, reactivar, restablecer, verClave, type ClaveVisible, type EstadoPersona } from "./actions";

type Persona = {
  id: string; nombre: string; usuario: string; rol: Rol; avatar: string; activo: boolean; metaSemanal: number; permisosExtra: string[];
  debeCambiar: boolean; pide: boolean; claveHasta: number | null; yo: boolean; editable: boolean; forma: FormaActual; formaTexto: string;
};
type Props = {
  personas: Persona[]; roles: { valor: Rol; texto: string; detalle: string }[]; nombresRol: Record<Rol, string>; conRenta: boolean;
  grupos: { titulo: string; permisos: { clave: string; texto: string }[] }[]; permisosPorRol: Record<Rol, readonly string[]>; restablecerId: string | null;
};

const ROLES_VISIBLES: Rol[] = ["duena", "admin", "barbera", "contador"];
const rolDe = (r: Rol): Rol => (r === "encargada" ? "barbera" : r);
const esBarbero = (r: Rol) => r === "barbera" || r === "encargada";

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

function Estado({ p }: { p: Persona }) {
  const ms = useRestante(p.claveHasta);
  if (!p.activo) return <span className="chip-e off"><i />Desactivado</span>;
  if (p.debeCambiar) return <span className="chip-e pendiente"><i />Acceso pendiente{p.claveHasta && ms > 0 ? `, ${Math.ceil(ms / 60000)} min` : ""}</span>;
  return <span className="chip-e ok"><i />Activo</span>;
}

/** Resumen de una persona, al tocar su fila. */
function Ficha({ p, props, cerrar, editar }: { p: Persona; props: Props; cerrar: () => void; editar?: () => void }) {
  const rol = rolDe(p.rol);
  const extra = props.grupos.flatMap((g) => g.permisos).filter((x) => p.permisosExtra.includes(x.clave));
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Usuario" titulo="Resumen">
      <div className="ficha-u">
        <div className="ficha-cab">
          <Avatar avatar={p.avatar} nombre={p.nombre} t={72} />
          <div>
            <b>{p.nombre}</b>
            <div className="fila" style={{ gap: 6, marginTop: 6 }}><span className={`rol-tag r-${rol}`}>{props.nombresRol[rol]}</span><Estado p={p} /></div>
          </div>
        </div>
        <div className="perfil-datos">
          <div><small>Usuario</small><span className="mono">{p.usuario}</span></div>
          <div><small>Puesto</small><span>{props.nombresRol[rol]}</span></div>
          {p.formaTexto && <div><small>Forma de pago</small><span>{p.formaTexto}</span></div>}
          {esBarbero(p.rol) && <div><small>Meta individual</small><span>{p.metaSemanal ? `${formatoDinero(p.metaSemanal)} a la semana` : "Se calcula sola"}</span></div>}
          <div><small>Permisos extra</small><span>{extra.length ? extra.map((x) => x.texto).join(", ") : "Solo los de su rol"}</span></div>
        </div>
      </div>
      <div className="acciones">
        <button type="button" className="bt sec solo" onClick={cerrar}>Cerrar</button>
        {editar && <button type="button" className="bt" onClick={editar}>Editar usuario<span className="fl" aria-hidden="true"><Icono n="editar" /></span></button>}
      </div>
    </Modal>
  );
}

function MenuAcciones({ p, acciones }: { p: Persona; acciones: { editar: () => void; clave: () => void; desactivar: () => void; reactivar: () => void; eliminar: () => void } }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  const ir = (f: () => void) => () => { setAbierto(false); f(); };
  return (
    <div ref={caja} style={{ position: "relative" }}>
      <button type="button" className="icb" aria-label={`Acciones para ${p.nombre}`} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>⋯</button>
      {abierto && (
        <div className="menu acciones-m" role="menu">
          {p.activo ? (
            <>
              <button type="button" role="menuitem" className="it" onClick={ir(acciones.editar)}><Icono n="editar" />Editar usuario</button>
              <button type="button" role="menuitem" className="it" onClick={ir(acciones.clave)}><Icono n="llave" />Restablecer contraseña</button>
              <button type="button" role="menuitem" className="it salir" onClick={ir(acciones.desactivar)}><Icono n="candado" />Desactivar usuario</button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="it" onClick={ir(acciones.reactivar)}><Icono n="palomita" />Reactivar usuario</button>
              <button type="button" role="menuitem" className="it salir" onClick={ir(acciones.eliminar)}><Icono n="basura" />Eliminar definitivamente</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RolTarjetas({ roles, valor, cambiar }: { roles: Props["roles"]; valor: Rol; cambiar: (r: Rol) => void }) {
  return (
    <div className="opciones-t chicas" role="radiogroup" aria-label="Rol">
      {roles.filter((r) => ROLES_VISIBLES.includes(r.valor)).map((r) => (
        <label key={r.valor} className="opcion-t"><input type="radio" name="rol" value={r.valor} checked={valor === r.valor} onChange={() => cambiar(r.valor)} /><b>{r.texto}</b><small>{r.detalle}</small></label>
      ))}
    </div>
  );
}

function EditarPersona({ p, props, cerrar }: { p: Persona; props: Props; cerrar: () => void }) {
  const [e, accion, guardando] = useActionState<EstadoPersona, FormData>(actualizarPersona, {});
  const [rol, setRol] = useState<Rol>(rolDe(p.rol));
  useEffect(() => { if (e.ok) cerrar(); }, [e.ok, e.n, cerrar]);
  const base = new Set(props.permisosPorRol[rol]);
  return (
    <Modal abierto cerrar={cerrar} etiqueta="Editar usuario" titulo={p.nombre} ancho>
      <form action={accion} className="pila">
        <input type="hidden" name="id" value={p.id} />
        <span className="paso-t">Datos del usuario</span>
        <label className="campo"><span>Nombre completo</span><input className="input" name="nombre" defaultValue={p.nombre} /></label>
        <div className="campo"><span>Rol</span><RolTarjetas roles={props.roles} valor={rol} cambiar={setRol} /></div>
        <span className="paso-t">Permisos</span>
        <div className="grupos-p">
          {props.grupos.map((g) => {
            const incluidos = g.permisos.filter((x) => base.has(x.clave));
            const extra = g.permisos.filter((x) => !base.has(x.clave));
            return (
              <details key={`${rol}-${g.titulo}`} className="grupo-p">
                <summary><b>{g.titulo}</b><span className="muted">{incluidos.length} de {g.permisos.length} incluidos</span></summary>
                <div className="grupo-p-c">
                  {incluidos.length > 0 && <div className="incluidos">{incluidos.map((x) => <span key={x.clave} className="tag-i"><Icono n="palomita" />{x.texto}</span>)}</div>}
                  {extra.map((x) => (
                    <label key={x.clave} className="entre perm-l">
                      <span>{x.texto}</span>
                      <Interruptor name="permisos" value={x.clave} etiqueta={x.texto} defaultChecked={p.permisosExtra.includes(x.clave)} />
                    </label>
                  ))}
                  {extra.length === 0 && <small className="muted">Su rol ya incluye todo este grupo.</small>}
                </div>
              </details>
            );
          })}
        </div>
        {esBarbero(rol) && (
          <>
            <span className="paso-t">Forma de pago</span>
            <CamposFormaPago actual={p.forma} conRenta={props.conRenta} />
            <span className="paso-t">Meta individual</span>
            <label className="campo">
              <span>Meta de ventas por semana (opcional)</span>
              <input className="input" name="meta" inputMode="decimal" defaultValue={p.metaSemanal ? String(p.metaSemanal / 100) : ""} placeholder="Si la dejas vacía, se calcula sola" />
            </label>
          </>
        )}
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={cerrar}>Cancelar</button>
          <button className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}<Fl /></button>
        </div>
      </form>
    </Modal>
  );
}

function AltaUsuario({ props, cerrar, alGuardar }: { props: Props; cerrar: () => void; alGuardar: (c: ClaveVisible) => void }) {
  const [e, accion, guardando] = useActionState<EstadoPersona, FormData>(darDeAlta, {});
  const [paso, setPaso] = useState(1);
  const [rol, setRol] = useState<Rol>("barbera");
  const [nombre, setNombre] = useState("");
  useEffect(() => { if (e.ok && e.clave) alGuardar(e.clave); }, [e.ok, e.n, e.clave, alGuardar]);
  const dosPasos = esBarbero(rol);
  return (
    <Modal abierto cerrar={cerrar} etiqueta={dosPasos ? `Paso ${paso} de 2` : "Nuevo usuario"} titulo={paso === 1 ? "Agregar usuario" : "Cómo se le paga"} ancho>
      <form action={accion} className="pila">
        <div className="pila" style={{ display: paso === 1 ? undefined : "none" }}>
          <label className="campo"><span>Nombre completo</span><input className="input" name="nombre" value={nombre} onChange={(x) => setNombre(x.target.value)} placeholder="Ejemplo: Ana Martínez López" required /></label>
          <div className="campo"><span>Rol</span><RolTarjetas roles={props.roles} valor={rol} cambiar={setRol} /></div>
          <p className="ayuda-txt">El usuario se arma con las iniciales y el primer apellido. La contraseña temporal se verá 30 minutos.</p>
        </div>
        {dosPasos && <div style={{ display: paso === 2 ? undefined : "none" }}><CamposFormaPago actual={null} conRenta={props.conRenta} /><p className="ayuda-txt" style={{ marginTop: 8 }}>Se puede cambiar después.</p></div>}
        {e.error && <p className="aviso error">{e.error}</p>}
        <div className="acciones">
          {paso === 2 ? <button type="button" className="bt sec solo" onClick={() => setPaso(1)}>Regresar</button> : <button type="button" className="bt sec solo" onClick={cerrar}>Cancelar</button>}
          {dosPasos && paso === 1
            ? <button key="sig" type="button" className="bt" disabled={nombre.trim().split(/\s+/).length < 2} onClick={() => setPaso(2)}>Siguiente<Fl /></button>
            : <button key="alta" className="bt" disabled={guardando}>{guardando ? "Guardando…" : "Dar de alta"}<Fl /></button>}
        </div>
      </form>
    </Modal>
  );
}

export function Personas(props: Props) {
  const [clave, setClave] = useState<ClaveVisible | null>(null);
  const [editar, setEditar] = useState<Persona | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "restablecer" | "desactivar" | "eliminar"; p: Persona } | null>(
    () => (props.restablecerId ? { tipo: "restablecer", p: props.personas.find((x) => x.id === props.restablecerId)! } : null),
  );
  const [alta, setAlta] = useState(0);
  const [aviso, setAviso] = useState<EstadoPersona>({});
  const [buscar, setBuscar] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (f: () => Promise<EstadoPersona>) => iniciar(async () => {
    const r = await f();
    setConfirmar(null);
    if (r.clave) setClave(r.clave);
    setAviso(r);
  });
  const [ficha, setFicha] = useState<Persona | null>(null);
  // Con acceso pendiente, tocar la fila lleva directo a la contraseña temporal; si no, al resumen.
  const abrirFila = (p: Persona) => (p.debeCambiar && p.editable && p.activo ? acceso(p) : setFicha(p));
  const acceso = (p: Persona) => (p.claveHasta && p.claveHasta > Date.now() ? ejecutar(() => verClave(p.id)) : setConfirmar({ tipo: "restablecer", p }));

  const q = buscar.trim().toLowerCase();
  const lista = props.personas.filter((p) => (verInactivos ? !p.activo : p.activo) && (!filtroRol || rolDe(p.rol) === filtroRol) && (!q || `${p.nombre} ${p.usuario}`.toLowerCase().includes(q)));
  const piden = props.personas.filter((p) => p.pide && p.editable);
  const inactivos = props.personas.filter((p) => !p.activo).length;

  return (
    <>
      <div className="entre">
        <h1 className="titulo">Usuarios</h1>
        <button type="button" className="bt" onClick={() => setAlta((n) => n + 1)}>Agregar usuario<span className="fl" aria-hidden="true"><Icono n="mas" /></span></button>
      </div>
      {aviso.error && <p className="aviso error">{aviso.error}</p>}
      {aviso.mensaje && <p className="aviso ok">{aviso.mensaje}</p>}
      {piden.map((p) => (
        <div key={p.id} className="glass panel" style={{ boxShadow: "var(--sh1), inset 0 0 0 2px var(--accent)", padding: "12px 16px" }}>
          <div className="entre">
            <span className="persona"><Avatar avatar={p.avatar} nombre={p.nombre} t={34} /><b>{p.nombre} pidió restablecer su contraseña</b></span>
            <button type="button" className="bt solo chico" onClick={() => setConfirmar({ tipo: "restablecer", p })}><Icono n="llave" />Restablecer</button>
          </div>
        </div>
      ))}

      <div className="herr-usuarios">
        <label className="con-icono" style={{ flex: "1 1 220px" }}><Icono n="buscar" /><input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o usuario" aria-label="Buscar usuario" /></label>
        <div style={{ width: 200 }}>
          <Selector etiqueta="Filtrar por rol" valor={filtroRol} onChange={setFiltroRol} opciones={[{ valor: "", texto: "Todos los roles" }, ...ROLES_VISIBLES.map((r) => ({ valor: r, texto: props.nombresRol[r] }))]} />
        </div>
        {inactivos > 0 && <button type="button" className={`chipf ${verInactivos ? "on" : ""}`} onClick={() => setVerInactivos((v) => !v)}>Desactivados ({inactivos})</button>}
      </div>

      <div className="glass lista-u">
        {lista.length === 0 && <p className="muted" style={{ padding: 16 }}>No hay usuarios con ese filtro.</p>}
        {lista.map((p) => (
          <div key={p.id} className={`fila-u ${p.activo ? "" : "inactivo"} ${p.debeCambiar && p.activo ? "pendiente" : ""}`} role="button" tabIndex={0}
            title={p.debeCambiar && p.editable && p.activo ? "Ver la contraseña temporal" : "Ver resumen"}
            onClick={(e) => { if ((e.target as HTMLElement).closest(".acts")) return; abrirFila(p); }}
            onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) abrirFila(p); }}>
            <Avatar avatar={p.avatar} nombre={p.nombre} t={34} />
            <span className="nom"><b>{p.nombre}</b>{p.yo && <span className="etiqueta" style={{ padding: "1px 7px", marginLeft: 6 }}>Tú</span>}<small>{p.usuario}{p.formaTexto ? ` - ${p.formaTexto}` : ""}</small></span>
            <span className={`rol-tag r-${rolDe(p.rol)}`}>{props.nombresRol[rolDe(p.rol)]}</span>
            <span className="est-col"><Estado p={p} /></span>
            <span className="acts">
              {p.editable && <MenuAcciones p={p} acciones={{
                editar: () => setEditar(p), clave: () => setConfirmar({ tipo: "restablecer", p }), desactivar: () => setConfirmar({ tipo: "desactivar", p }),
                reactivar: () => ejecutar(() => reactivar(p.id)), eliminar: () => setConfirmar({ tipo: "eliminar", p }),
              }} />}
            </span>
          </div>
        ))}
      </div>

      {alta > 0 && <AltaUsuario key={alta} props={props} cerrar={() => setAlta(0)} alGuardar={(c) => { setAlta(0); setClave(c); }} />}
      {confirmar?.tipo === "restablecer" && (
        <Modal abierto cerrar={() => setConfirmar(null)} etiqueta="Acceso" titulo={`Darle acceso a ${confirmar.p.nombre.split(" ")[0]}`}>
          <p className="muted">Se genera una contraseña temporal que verás 30 minutos para dársela.<br />Su contraseña anterior deja de servir y al entrar elegirá una propia.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setConfirmar(null)}>Regresar</button>
            <button type="button" className="bt" disabled={pendiente} onClick={() => ejecutar(() => restablecer(confirmar.p.id))}>{pendiente ? "Generando…" : "Generar contraseña"}<Fl /></button>
          </div>
        </Modal>
      )}
      {confirmar?.tipo === "desactivar" && (
        <Modal abierto cerrar={() => setConfirmar(null)} etiqueta="Desactivar usuario" titulo={`¿Desactivar a ${confirmar.p.nombre.split(" ")[0]}?`}>
          <p className="muted">Ya no podrá entrar.<br />Sus ventas y todo lo que hizo se conservan. Se puede reactivar cuando quieras.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setConfirmar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => ejecutar(() => desactivar(confirmar.p.id))}>Sí, desactivar<Fl /></button>
          </div>
        </Modal>
      )}
      {confirmar?.tipo === "eliminar" && (
        <Modal abierto cerrar={() => setConfirmar(null)} etiqueta="Eliminar usuario" titulo={`¿Eliminar a ${confirmar.p.nombre.split(" ")[0]} definitivamente?`}>
          <p className="muted">Solo se puede si nunca registró ventas ni movimientos. Si ya tiene, se queda desactivado.</p>
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={() => setConfirmar(null)}>Regresar</button>
            <button type="button" className="bt peligro" disabled={pendiente} onClick={() => ejecutar(() => darDeBaja(confirmar.p.id))}>Sí, eliminar<Fl /></button>
          </div>
        </Modal>
      )}
      {ficha && <Ficha p={ficha} props={props} cerrar={() => setFicha(null)} editar={ficha.editable ? () => { setEditar(ficha); setFicha(null); } : undefined} />}
      {editar && <EditarPersona p={editar} props={props} cerrar={() => setEditar(null)} />}
      <VentanaClave c={clave} cerrar={() => setClave(null)} />
    </>
  );
}
