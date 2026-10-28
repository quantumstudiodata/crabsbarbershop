export function Encabezado({ etiqueta, titulo, sub, children }: { etiqueta?: React.ReactNode; titulo: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="entre" style={{ alignItems: "flex-end" }}>
      <div>
        {etiqueta && <span className="lab">{etiqueta}</span>}
        <h1 className="titulo" style={{ marginTop: etiqueta ? 8 : 0 }}>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="fila">{children}</div>}
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
  guardado: { tipo: "ok", texto: "Guardado." },
  cancelada: { tipo: "ok", texto: "La venta quedó cancelada. Sigue visible en el historial." },
};

export function AvisoUrl({ aviso, error }: { aviso?: string; error?: string }) {
  const a = aviso ? AVISOS[aviso] : undefined;
  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </>
  );
}
