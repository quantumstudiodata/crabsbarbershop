/** Signo (?) con explicación al pasar el cursor o al enfocarlo. */
export function Ayuda({ titulo, children, izq }: { titulo?: string; children: React.ReactNode; izq?: boolean }) {
  return (
    <span className="ayuda" tabIndex={0} aria-label={titulo ? `Ayuda: ${titulo}` : "Ayuda"}>
      <span aria-hidden="true">?</span>
      <span className={`tip ${izq ? "izq" : ""}`} role="tooltip">
        {titulo && <b>{titulo}</b>}
        {children}
      </span>
    </span>
  );
}
