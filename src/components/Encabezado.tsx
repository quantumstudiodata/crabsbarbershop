export function Encabezado({ etiqueta, titulo, sub, children }: { etiqueta: string; titulo: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="entre" style={{ alignItems: "flex-end" }}>
      <div>
        <span className="lab">{etiqueta}</span>
        <h1 className="titulo">{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="fila">{children}</div>}
    </div>
  );
}

export function Dato({ etiqueta, valor, contexto }: { etiqueta: string; valor: React.ReactNode; contexto?: React.ReactNode }) {
  return (
    <div className="glass panel">
      <div>
        <span className="lab">{etiqueta}</span>
        <span className="fig">{valor}</span>
        {contexto && <span className="ctx">{contexto}</span>}
      </div>
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo?: "ok" | "error"; children: React.ReactNode }) {
  return <p className={`aviso ${tipo ?? ""}`} role={tipo === "error" ? "alert" : "status"}>{children}</p>;
}

/** Mensajes cortos que regresan las acciones por la URL (?aviso=...). */
export const AVISOS: Record<string, { tipo?: "ok" | "error"; texto: string }> = {
  "sin-permiso": { tipo: "error", texto: "No tienes permiso para entrar a esa sección." },
  contrasena: { tipo: "ok", texto: "Listo. Tu contraseña quedó guardada." },
  cobrada: { tipo: "ok", texto: "Venta cobrada." },
  "caja-abierta": { tipo: "ok", texto: "La caja quedó abierta." },
  "caja-cerrada": { tipo: "ok", texto: "La caja quedó cerrada." },
  guardado: { tipo: "ok", texto: "Guardado." },
  cancelada: { tipo: "ok", texto: "La venta quedó cancelada. Sigue visible en el historial." },
};
