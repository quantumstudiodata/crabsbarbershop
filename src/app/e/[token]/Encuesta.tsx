"use client";

import { useActionState, useState } from "react";
import { enviarEncuesta, type EstadoEncuesta } from "./actions";

const MENSAJE: Record<number, string> = {
  5: "¡Qué bueno que te gustó! ¿Quieres contarnos qué fue lo que más disfrutaste?",
  4: "¡Gracias! ¿Qué podríamos mejorar?",
  3: "Queremos mejorar. ¿Qué ocurrió durante tu visita?",
  2: "Queremos mejorar. ¿Qué ocurrió durante tu visita?",
  1: "Queremos mejorar. ¿Qué ocurrió durante tu visita?",
};

export function Encuesta({ token, barbero }: { token: string; barbero: string }) {
  const [estrellas, setEstrellas] = useState(0);
  const [e, accion, enviando] = useActionState<EstadoEncuesta, FormData>(enviarEncuesta, {});
  if (e.ok) return <div className="enc-gracias"><b>¡Gracias por tu opinión!</b><p>Nos ayuda a atenderte mejor en tu próxima visita.</p></div>;
  return (
    <form action={accion} className="enc-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="calificacion" value={estrellas || ""} />
      <p className="enc-preg">¿Cómo te atendió {barbero}?</p>
      <div className="enc-est" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={estrellas === n} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            className={n <= estrellas ? "on" : ""} onClick={() => setEstrellas(n)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" /></svg>
          </button>
        ))}
      </div>
      {estrellas > 0 && (
        <div className="enc-mas" key={estrellas > 4 ? "a" : estrellas > 3 ? "b" : "c"}>
          <label className="enc-campo"><span>{MENSAJE[estrellas]}</span><textarea name="comentario" rows={3} maxLength={600} placeholder="Opcional" /></label>
          <label className="enc-campo"><span>Tu nombre</span><input name="cliente" maxLength={60} placeholder="Opcional" /></label>
          {e.error && <p className="enc-error" role="alert">{e.error}</p>}
          <button className="enc-enviar" disabled={enviando}>{enviando ? "Enviando" : "Enviar"}</button>
        </div>
      )}
    </form>
  );
}
