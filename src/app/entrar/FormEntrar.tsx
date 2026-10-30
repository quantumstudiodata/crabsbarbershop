"use client";

import { useActionState, useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { entrar, solicitarRestablecer, type EstadoEntrada } from "./actions";

type Paso = "cerrado" | "intencion" | "cambiar" | "confirmar" | "enviando" | "enviada";

export function FormEntrar() {
  const [estado, accion, enviando] = useActionState<EstadoEntrada, FormData>(entrar, {});
  // Controlado para que el usuario no se borre después de un intento fallido.
  const [usuario, setUsuario] = useState("");
  const [mayus, setMayus] = useState(false);
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [usuarioOlvido, setUsuarioOlvido] = useState("");

  const revisarMayus = (e: React.KeyboardEvent<HTMLInputElement>) => setMayus(e.getModifierState?.("CapsLock") ?? false);
  const abrir = () => { setUsuarioOlvido(usuario); setPaso("intencion"); };
  const cerrar = () => setPaso("cerrado");
  const enviar = async () => {
    setPaso("enviando");
    await solicitarRestablecer(usuarioOlvido).catch(() => null);
    setPaso("enviada");
  };

  return (
    <div className="form-entrada">
      <div>
        <span className="lab">Bienvenido</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>Entra a tu cuenta</h1>
        <p className="sub">Introduce tus credenciales para acceder a tu cuenta.</p>
      </div>
      <form action={accion} className="pila">
        <label className="campo">
          <span>Usuario</span>
          <span className="con-icono">
            <Icono n="usuario" />
            <input className="input" name="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="characters" required placeholder="Ejemplo: AMARTINEZ" />
          </span>
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <span className="con-icono">
            <Icono n="candado" />
            <input className="input" name="contrasena" type="password" autoComplete="current-password" required onKeyDown={revisarMayus} onKeyUp={revisarMayus} onBlur={() => setMayus(false)} />
          </span>
          {mayus && <span className="mayus" role="status"><Icono n="mayus" className="ic" />Las mayúsculas están activadas</span>}
        </label>
        {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
        <button className="bt grande" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
          <Fl />
        </button>
      </form>
      <button type="button" className="enlace" style={{ justifySelf: "center" }} onClick={abrir}>¿Olvidaste tu contraseña?</button>

      <Modal abierto={paso === "intencion"} cerrar={cerrar} etiqueta="Tu contraseña" titulo="¿Qué necesitas hacer?">
        <div className="pila-chica">
          <button type="button" className="opcion-t" style={{ textAlign: "left", border: 0 }} onClick={() => setPaso("cambiar")}>
            <b>Cambiarla por otra</b>
            <small>Todavía la recuerdas y solo quieres una nueva.</small>
          </button>
          <button type="button" className="opcion-t" style={{ textAlign: "left", border: 0 }} onClick={() => setPaso("confirmar")}>
            <b>Restablecerla</b>
            <small>No la recuerdas. El propietario te dará una temporal.</small>
          </button>
        </div>
      </Modal>

      <Modal abierto={paso === "cambiar"} cerrar={cerrar} etiqueta="Cambiar contraseña" titulo="Puedes hacerlo tú">
        <p className="muted">
          Entra con tu contraseña actual.
          <br />
          Luego toca tu nombre, arriba a la izquierda, y elige <b>Cambiar contraseña</b>.
        </p>
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={() => setPaso("intencion")}>Regresar</button>
          <button type="button" className="bt" onClick={cerrar}>Entendido<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button>
        </div>
      </Modal>

      <Modal abierto={paso === "confirmar" || paso === "enviando"} cerrar={cerrar} etiqueta="Restablecer contraseña" titulo="¿Seguro que quieres restablecerla?">
        <p className="muted">
          Se le avisará al propietario.
          <br />
          Te dará una contraseña temporal y, al entrar, elegirás una nueva.
        </p>
        <label className="campo">
          <span>Tu usuario</span>
          <span className="con-icono">
            <Icono n="usuario" />
            <input className="input" value={usuarioOlvido} onChange={(e) => setUsuarioOlvido(e.target.value)} autoCapitalize="characters" placeholder="Ejemplo: AMARTINEZ" />
          </span>
        </label>
        <div className="acciones">
          <button type="button" className="bt sec solo" onClick={() => setPaso("intencion")}>Regresar</button>
          <button type="button" className="bt" disabled={!usuarioOlvido.trim() || paso === "enviando"} onClick={enviar}>
            {paso === "enviando" ? "Enviando…" : "Sí, restablecer"}
            <Fl />
          </button>
        </div>
      </Modal>

      <Modal abierto={paso === "enviada"} cerrar={cerrar} etiqueta="Solicitud enviada" titulo="Listo, ya se avisó">
        <div className="cronometro">
          <span className="exito"><Icono n="palomita" /></span>
          <p className="muted">
            Tu solicitud llegó al propietario y se aprobará pronto.
            <br />
            Cuando te dé la contraseña temporal, entra con ella.
          </p>
        </div>
        <div className="acciones"><button type="button" className="bt" onClick={cerrar}>Entendido<span className="fl" aria-hidden="true"><Icono n="palomita" /></span></button></div>
      </Modal>
    </div>
  );
}
