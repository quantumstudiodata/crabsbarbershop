"use client";

import { useActionState, useState } from "react";
import { entrar, type EstadoEntrada } from "./actions";

export function FormEntrar() {
  const [estado, accion, enviando] = useActionState<EstadoEntrada, FormData>(entrar, {});
  // Controlado para que el usuario no se borre después de un intento fallido.
  const [usuario, setUsuario] = useState("");
  return (
    <form action={accion} className="pila">
      <label className="campo">
        <span>Usuario</span>
        <input className="input" name="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="characters" required placeholder="Ejemplo: AMARTINEZ" />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input className="input" name="contrasena" type="password" autoComplete="current-password" required />
      </label>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      <button className="btn pri grande" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
