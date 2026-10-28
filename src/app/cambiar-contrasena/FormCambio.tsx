"use client";

import { useActionState } from "react";
import { cambiarContrasena, type EstadoCambio } from "./actions";

export function FormCambio() {
  const [estado, accion, enviando] = useActionState<EstadoCambio, FormData>(cambiarContrasena, {});
  return (
    <form action={accion} className="pila">
      <label className="campo"><span>Contraseña actual</span><input className="input" name="actual" type="password" autoComplete="current-password" required /></label>
      <label className="campo"><span>Nueva contraseña</span><input className="input" name="nueva" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="campo"><span>Repite la nueva</span><input className="input" name="repetir" type="password" autoComplete="new-password" minLength={8} required /></label>
      <p className="ayuda">Al menos 8 caracteres, con letras y números.</p>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      <button className="btn pri grande" disabled={enviando}>{enviando ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
