import { AVATARES, esAvatar } from "@/lib/avatares";

const DIBUJO: Record<string, React.ReactNode> = {
  tijera: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.1 8.1 20 20M8.1 15.9 20 4" /></g>,
  peine: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="7" width="18" height="4" rx="1.5" /><path d="M5 11v6M8 11v6M11 11v6M14 11v6M17 11v6M20 11v4" /></g>,
  bigote: <path fill="currentColor" d="M12 11.5c1.6-2.6 4.6-3.3 6.4-1.6 1.1 1 2.1 1 3.1.1-.2 3.3-3.2 5-6 4-1.6-.5-2.8-1.4-3.5-2.4-.7 1-1.9 1.9-3.5 2.4-2.8 1-5.8-.7-6-4 1 .9 2 .9 3.1-.1 1.8-1.7 4.8-1 6.4 1.6z" />,
  navaja: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d="M3 15 15 5c2 0 3.5 1 4 3L8 18z" /><path d="M8 18l-3 3M15 5l2 2" /></g>,
  luna: <path fill="currentColor" d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5z" />,
  ola: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 9c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1M2 15c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1" /></g>,
  mostrador: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h18v9H3z" /><path d="M5 11V8h14v3M9 15h6M12 4v4" /></g>,
  calculadora: <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></g>,
  estrella: <path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
};

export const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function Avatar({ avatar, nombre, t = 36 }: { avatar: string; nombre: string; t?: number }) {
  const clave = esAvatar(avatar) ? avatar : "iniciales";
  return (
    <span className="avatar" style={{ width: t, height: t, background: AVATARES[clave].fondo }} title={nombre}>
      {clave === "iniciales" ? (
        <b style={{ fontSize: t * 0.36, fontWeight: 600, letterSpacing: ".02em" }}>{iniciales(nombre)}</b>
      ) : clave === "cangrejo" ? (
        <svg viewBox="0 0 64 48" style={{ width: "62%", height: "62%" }} aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="32" cy="31" rx="13" ry="9" /><path d="M27 22.5 25 15M37 22.5 39 15" /><path d="M20 27C13 25 11 20 12 15M44 27C51 25 53 20 52 15" /><path d="M12 15 6 11C5 7 8 4 12 5 15 6 16 9 15 12ZM52 15 58 11C59 7 56 4 52 5 49 6 48 9 49 12Z" /></g>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">{DIBUJO[clave]}</svg>
      )}
    </span>
  );
}
