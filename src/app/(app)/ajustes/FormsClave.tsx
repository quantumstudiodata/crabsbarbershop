"use client";

import { useActionState, useState } from "react";
import { darDeAlta, restablecer, type EstadoClave } from "./actions";

function ClaveUnaVez({ e }: { e: EstadoClave }) {
  const [copiado, setCopiado] = useState(false);
  if (!e.clave) return null;
  return (
    <div className="glass panel" role="status" style={{ background: "var(--surface-strong)" }}>
      <span className="lab">Contraseña temporal de {e.nombre?.split(" ")[0]}</span>
      <p>Usuario: <b style={{ fontFamily: "var(--f-mono)" }}>{e.usuario}</b></p>
      <div className="clave">{e.clave}</div>
      <p className="ayuda">Se muestra solo esta vez. Al entrar, tendrá que cambiarla por una propia.</p>
      <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(`Usuario: ${e.usuario}\nContraseña temporal: ${e.clave}`).then(() => setCopiado(true)).catch(() => {})}>
        {copiado ? "Copiado" : "Copiar usuario y contraseña"}
      </button>
    </div>
  );
}

export function FormAlta({ roles }: { roles: { valor: string; texto: string }[] }) {
  const [e, accion, enviando] = useActionState<EstadoClave, FormData>(darDeAlta, {});
  return (
    <div className="pila">
      <form action={accion} className="glass panel">
        <span className="lab">Dar de alta</span>
        <label className="campo"><span>Nombre completo</span><input className="input" name="nombre" placeholder="Ejemplo: Ana Martínez López" required /></label>
        <label className="campo"><span>Rol</span>
          <select className="input" name="rol" defaultValue="barbera">{roles.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}</select>
        </label>
        <p className="ayuda">El usuario se arma con las iniciales y el primer apellido. La contraseña temporal, con las iniciales y tres números.</p>
        {e.error && <p className="aviso error">{e.error}</p>}
        <button className="btn pri" disabled={enviando}>{enviando ? "Guardando…" : "Dar de alta"}</button>
      </form>
      <ClaveUnaVez e={e} />
    </div>
  );
}

export function BotonRestablecer({ id, nombre }: { id: string; nombre: string }) {
  const [e, accion, enviando] = useActionState<EstadoClave, FormData>(restablecer, {});
  return (
    <div className="pila-chica">
      <form action={accion}>
        <input type="hidden" name="id" value={id} />
        <button className="enlace" disabled={enviando} aria-label={`Restablecer la contraseña de ${nombre}`}>{enviando ? "Generando…" : "Restablecer contraseña"}</button>
      </form>
      {e.error && <small className="aviso error">{e.error}</small>}
      <ClaveUnaVez e={e} />
    </div>
  );
}
