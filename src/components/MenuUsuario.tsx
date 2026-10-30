"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { cambiarContrasena, type EstadoCambio } from "@/app/cambiar-contrasena/actions";
import { cambiarAvatar } from "@/app/(app)/acciones-usuario";
import { salir } from "@/app/salir";
import { AVATARES } from "@/lib/avatares";
import { Avatar } from "./Avatar";
import { Fl, Icono } from "./Icono";
import { Modal } from "./ui";

export function MenuUsuario(p: { nombre: string; usuario: string; rol: string; avatar: string; ajustes: boolean; historial: boolean; formaPago: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [elegir, setElegir] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [clave, setClave] = useState(false);
  const [avatar, setAvatar] = useState(p.avatar);
  const [propuesto, setPropuesto] = useState(p.avatar);
  const [vez, setVez] = useState(0);
  const [pendiente, iniciar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const guardar = () => {
    setAvatar(propuesto);
    iniciar(async () => { await cambiarAvatar(propuesto); setElegir(false); setPerfil(true); });
  };
  const nombreCorto = p.nombre.split(" ").slice(0, 2).join(" ");

  return (
    <div ref={caja} style={{ position: "relative", justifySelf: "start" }}>
      <button type="button" className="uchip" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <Avatar avatar={avatar} nombre={p.nombre} t={34} />
        <span className="txt"><b>{nombreCorto}</b><small>{p.rol}</small></span>
        <Icono n="abajo" className="ic txt" />
      </button>
      {abierto && (
        <div className="menu" role="menu">
          <div className="quien">
            <div className="fila"><Avatar avatar={avatar} nombre={p.nombre} t={44} /><span><b>{p.nombre}</b><small className="muted" style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 11 }}>{p.usuario}</small></span></div>
            <span className="etiqueta" style={{ width: "max-content" }}>{p.rol}</span>
          </div>
          <button type="button" role="menuitem" className="it" onClick={() => { setPerfil(true); setAbierto(false); }}><Icono n="usuario" />Mi perfil</button>
          {p.ajustes && <Link role="menuitem" className="it" href="/ajustes" onClick={() => setAbierto(false)}><Icono n="ajustes" />Ajustes</Link>}
          {p.historial && <Link role="menuitem" className="it" href="/historial" onClick={() => setAbierto(false)}><Icono n="historial" />Historial</Link>}
          <div className="separador" style={{ margin: "4px 0" }} />
          <form action={salir}><button role="menuitem" className="it salir"><Icono n="salir" />Salir</button></form>
        </div>
      )}
      <Modal abierto={perfil} cerrar={() => setPerfil(false)} etiqueta="Tu cuenta" titulo="Mi perfil">
        <div className="perfil">
          <button type="button" className="perfil-av" onClick={() => { setPropuesto(avatar); setPerfil(false); setElegir(true); }} aria-label="Cambiar avatar" title="Cambiar avatar">
            <Avatar avatar={avatar} nombre={p.nombre} t={96} />
            <span className="lapiz" aria-hidden="true"><Icono n="editar" /></span>
          </button>
          <b className="perfil-n">{p.nombre}</b>
          <span className="etiqueta">{p.rol}</span>
        </div>
        <div className="perfil-datos">
          <div><small>Nombre</small><span>{p.nombre}</span></div>
          <div><small>Puesto</small><span>{p.rol}</span></div>
          <div><small>Usuario</small><span className="mono">{p.usuario}</span></div>
          {p.formaPago && <div><small>Tipo de pago</small><span>{p.formaPago}</span></div>}
        </div>
        <p className="ayuda-txt" style={{ textAlign: "center" }}>Para cambiar tus datos, pídeselo al propietario.</p>
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={() => { setPerfil(false); setVez((v) => v + 1); setClave(true); }}><Icono n="candado" />Cambiar contraseña</button>
          <button type="button" className="bt" onClick={() => setPerfil(false)}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button>
        </div>
      </Modal>
      <Modal abierto={elegir} cerrar={() => { setElegir(false); setPerfil(true); }} etiqueta="Mi perfil" titulo="Elige tu avatar" ancho>
        <div className="carrusel-av">
          <button type="button" className="icb flecha-c" aria-label="Anteriores" onClick={(e) => e.currentTarget.parentElement?.querySelector(".pista")?.scrollBy({ left: -270, behavior: "smooth" })}><Icono n="izquierda" /></button>
          <div className="pista" role="radiogroup" aria-label="Avatares">
            {Object.keys(AVATARES).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={propuesto === a} aria-label={a === "iniciales" ? "Tus iniciales" : a} onClick={() => setPropuesto(a)} className="op-av">
                <Avatar avatar={a} nombre={p.nombre} t={76} />
                {propuesto === a && <span className="marca-av" aria-hidden="true"><Icono n="palomita" /></span>}
              </button>
            ))}
          </div>
          <button type="button" className="icb flecha-c" aria-label="Siguientes" onClick={(e) => e.currentTarget.parentElement?.querySelector(".pista")?.scrollBy({ left: 270, behavior: "smooth" })}><Icono n="derecha" /></button>
        </div>
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={() => { setElegir(false); setPerfil(true); }}>Cancelar</button>
          <button type="button" className="bt" disabled={pendiente} onClick={guardar}>{pendiente ? "Guardando…" : "Listo"}<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button>
        </div>
      </Modal>
      {clave && <VentanaClave key={vez} cerrar={() => setClave(false)} />}
    </div>
  );
}

function VentanaClave({ cerrar }: { cerrar: () => void }) {
  const [eClave, accClave, guardandoClave] = useActionState<EstadoCambio, FormData>(cambiarContrasena, {});
  return (
  <Modal abierto cerrar={cerrar} etiqueta="Tu cuenta" titulo={eClave.ok ? "Contraseña guardada" : "Cambiar contraseña"}>
      {eClave.ok ? (
        <>
          <div className="cronometro"><span className="exito"><Icono n="palomita" /></span><p className="muted">Listo. La próxima vez entra con la nueva.</p></div>
          <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Entendido<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
        </>
      ) : (
        <form action={accClave} className="pila">
          <input type="hidden" name="modal" value="si" />
          <label className="campo"><span>Contraseña actual</span><input className="input" name="actual" type="password" autoComplete="current-password" required /></label>
          <label className="campo"><span>Nueva contraseña</span><input className="input" name="nueva" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="campo"><span>Repite la nueva</span><input className="input" name="repetir" type="password" autoComplete="new-password" minLength={8} required /></label>
          <p className="ayuda-txt">Al menos 8 caracteres, con letras y números.</p>
          {eClave.error && <p className="aviso error" role="alert">{eClave.error}</p>}
          <div className="acciones">
            <button type="button" className="bt sec solo" onClick={cerrar}>Regresar</button>
            <button className="bt" disabled={guardandoClave}>{guardandoClave ? "Guardando…" : "Guardar"}<Fl /></button>
          </div>
        </form>
      )}
    </Modal>
  );
}
