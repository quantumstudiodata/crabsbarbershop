// Iconos de trazo. Un solo lugar para todos.

const P: Record<string, React.ReactNode> = {
  inicio: <path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" />,
  cobro: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  grafica: <path d="M4 20V11M10 20V5M16 20v-8M21 20H3" />,
  lista: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  chispa: <><path d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z" /><path d="M18.5 15c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" /></>,
  campana: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  llave: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></>,
  salir: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  editar: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  basura: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  abajo: <path d="M6 9l6 6 6-6" />,
  arriba: <path d="M6 15l6-6 6 6" />,
  izquierda: <path d="M15 6l-6 6 6 6" />,
  derecha: <path d="M9 6l6 6-6 6" />,
  mas: <path d="M12 5v14M5 12h14" />,
  candado: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  copiar: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  descargar: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  palomita: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  historial: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2" />,
  mayus: <path d="M12 4 4 12h4v5h8v-5h4zM8 20h8" />,
  efectivo: <><rect x="3" y="7" width="18" height="11" rx="2" /><circle cx="12" cy="12.5" r="2.2" /></>,
  caja: <><path d="M3 9h18v11H3z" /><path d="M7 9V5h10v4M10 14h4" /></>,
  ojo: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  ojoNo: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  minimizar: <path d="M6 12h12" />,
  archivo: <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  persona: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 13.8c1.8.9 3 2.7 3 4.9" /></>,
  tarjeta: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  etiqueta: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
};

export type NombreIcono = keyof typeof P;

export function Icono({ n, className = "ic", titulo }: { n: string; className?: string; titulo?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={titulo ? undefined : true} role={titulo ? "img" : undefined}>
      {titulo && <title>{titulo}</title>}
      {P[n]}
    </svg>
  );
}

/** Flecha del botón principal. */
export function Fl() {
  return (
    <span className="fl giro" aria-hidden="true">
      <svg className="ic" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}
