import { Icono } from "./Icono";

/**
 * Cuando todavía no hay datos (o un filtro no encontró nada): dice qué falta y cuándo aparecerá.
 * Ocupa espacio a propósito para que la pantalla no se vea abandonada; "chico" es para tarjetas pequeñas.
 */
export function Vacio({ icono, titulo, texto, chico = false }: { icono: string; titulo: string; texto: string; chico?: boolean }) {
  return (
    <div className={`vacio-g ${chico ? "chico" : ""}`}>
      <span className="vacio-g-i" aria-hidden="true"><Icono n={icono} /></span>
      <b>{titulo}</b>
      <small>{texto}</small>
    </div>
  );
}
