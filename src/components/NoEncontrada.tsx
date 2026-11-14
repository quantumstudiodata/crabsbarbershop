import Link from "next/link";

/** Página no encontrada con el estilo de la app (claro) o de las páginas del cliente (grafito). */
export function NoEncontrada({ titulo, texto, inicio, oscuro }: { titulo: string; texto: string; inicio?: boolean; oscuro?: boolean }) {
  return (
    <main className={`nf ${oscuro ? "fx oscuro" : ""}`}>
      <section className="nf-t">
        <span className="nf-i" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /><path d="M3 3l18 18" /></svg>
        </span>
        <h1>{titulo}</h1>
        <p>{texto}</p>
        {inicio && <Link className="nf-b" href="/">Ir al inicio</Link>}
      </section>
    </main>
  );
}
