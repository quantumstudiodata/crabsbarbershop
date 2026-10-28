"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { cambiarAvatar } from "@/app/(app)/acciones-usuario";
import { salir } from "@/app/salir";
import { AVATARES } from "@/lib/avatares";
import { Avatar } from "./Avatar";
import { Icono } from "./Icono";
import { Modal } from "./ui";

export function MenuUsuario(p: { nombre: string; usuario: string; rol: string; avatar: string; ajustes: boolean; historial: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [elegir, setElegir] = useState(false);
  const [avatar, setAvatar] = useState(p.avatar);
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

  const guardar = (a: string) => {
    setAvatar(a);
    iniciar(async () => { await cambiarAvatar(a); });
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
          <button type="button" role="menuitem" className="it" onClick={() => { setElegir(true); setAbierto(false); }}><Icono n="usuario" />Cambiar avatar</button>
          {p.ajustes && <Link role="menuitem" className="it" href="/ajustes" onClick={() => setAbierto(false)}><Icono n="ajustes" />Ajustes</Link>}
          {p.historial && <Link role="menuitem" className="it" href="/historial" onClick={() => setAbierto(false)}><Icono n="historial" />Historial</Link>}
          <Link role="menuitem" className="it" href="/cambiar-contrasena" onClick={() => setAbierto(false)}><Icono n="candado" />Cambiar contraseña</Link>
          <div className="separador" style={{ margin: "4px 0" }} />
          <form action={salir}><button role="menuitem" className="it salir"><Icono n="salir" />Salir</button></form>
        </div>
      )}
      <Modal abierto={elegir} cerrar={() => setElegir(false)} etiqueta="Tu perfil" titulo="Elige tu avatar">
        <div className="avatares">
          {Object.keys(AVATARES).map((a) => (
            <button key={a} type="button" aria-pressed={avatar === a} aria-label={a === "iniciales" ? "Tus iniciales" : a} onClick={() => guardar(a)}>
              <Avatar avatar={a} nombre={p.nombre} t={56} />
            </button>
          ))}
        </div>
        <p className="ayuda-txt">{pendiente ? "Guardando…" : "Se guarda al tocarlo. Es el que verá el equipo junto a tu nombre."}</p>
        <div className="acciones"><button type="button" className="bt" onClick={() => setElegir(false)}>Listo<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
      </Modal>
    </div>
  );
}
