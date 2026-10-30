import Link from "next/link";

/** Números de página con flechas; conserva los demás filtros de la dirección. */
export function Paginacion({ ruta, params, pagina, paginas, texto }: { ruta: string; params: Record<string, string | undefined>; pagina: number; paginas: number; texto?: string }) {
  const enlace = (n: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "pagina" && k !== "aviso" && k !== "error") as [string, string][]);
    if (n > 1) q.set("pagina", String(n));
    const t = q.toString();
    return t ? `${ruta}?${t}` : ruta;
  };
  const numeros = [...new Set([1, pagina - 1, pagina, pagina + 1, paginas])].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  return (
    <div className="entre">
      <span className="muted" style={{ fontSize: 13 }}>{texto}</span>
      {paginas > 1 && (
        <nav className="paginas" aria-label="Páginas">
          {pagina > 1 && <Link href={enlace(pagina - 1)} aria-label="Anterior">‹</Link>}
          {numeros.map((n, i) => (
            <span key={n} style={{ display: "contents" }}>
              {i > 0 && n - numeros[i - 1] > 1 && <span className="muted">…</span>}
              <Link href={enlace(n)} aria-current={n === pagina ? "page" : undefined}>{n}</Link>
            </span>
          ))}
          {pagina < paginas && <Link href={enlace(pagina + 1)} aria-label="Siguiente">›</Link>}
        </nav>
      )}
    </div>
  );
}
