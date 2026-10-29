// Gráfica de área con curva suave que se dibuja al entrar. Sin JavaScript en el navegador.

type Punto = [number, number];

/** Curva monótona: pasa por cada punto sin inventar picos entre ellos. */
function curva(p: Punto[]): string {
  if (p.length === 0) return "";
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]}`;
  const n = p.length;
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) m.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0] || 1));
  const t = p.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (p[i + 1][0] - p[i][0]) / 3;
    d += ` C${(p[i][0] + dx).toFixed(1)} ${(p[i][1] + t[i] * dx).toFixed(1)} ${(p[i + 1][0] - dx).toFixed(1)} ${(p[i + 1][1] - t[i + 1] * dx).toFixed(1)} ${p[i + 1][0].toFixed(1)} ${p[i + 1][1].toFixed(1)}`;
  }
  return d;
}

export function Grafica({ id, actual, previo, etiquetas, alto = 170, ancho = 640, descripcion, vacio, cadaEtiqueta = 1, resaltar }: {
  id: string;
  /** null = todavía no llega ese momento (por ejemplo, horas que no han pasado). */
  actual: (number | null)[];
  previo?: number[];
  etiquetas: string[];
  alto?: number;
  ancho?: number;
  descripcion: string;
  vacio?: string;
  cadaEtiqueta?: number;
  resaltar?: string;
}) {
  const n = Math.max(actual.length, previo?.length ?? 0, 2);
  const max = Math.max(...actual.map((v) => v ?? 0), ...(previo ?? []), 1);
  const x = (i: number) => (i * ancho) / (n - 1);
  const y = (v: number) => alto - 10 - (v / max) * (alto - 30);
  const pts: Punto[] = actual.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as Punto]));
  const pPrev: Punto[] = (previo ?? []).map((v, i) => [x(i), y(v)]);
  const dActual = curva(pts);
  const ultimo = pts[pts.length - 1];
  const sinDatos = actual.every((v) => !v) && (previo ?? []).every((v) => !v);
  return (
    <div className="grafica">
      <svg className="area" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4b6274" stopOpacity=".3" />
            <stop offset="1" stopColor="#4b6274" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="r" x1="0" x2={ancho} y1={alto - 10 - f * (alto - 30)} y2={alto - 10 - f * (alto - 30)} />)}
        <line className="b" x1="0" x2={ancho} y1={alto - 10} y2={alto - 10} />
        {pPrev.length > 1 && <path className="p" d={curva(pPrev)} />}
        {pts.length > 1 && <path className="f" d={`${dActual} L${ultimo[0].toFixed(1)} ${alto} L${pts[0][0].toFixed(1)} ${alto} Z`} fill={`url(#g-${id})`} />}
        {pts.length > 1 && <path className="l" d={dActual} pathLength={1} />}
        {ultimo && (
          <>
            <circle className="d2" cx={ultimo[0]} cy={ultimo[1]} r={6} />
            <circle className="d" cx={ultimo[0]} cy={ultimo[1]} r={6} />
          </>
        )}
      </svg>
      {ultimo && resaltar && <span className="marca-valor" style={{ left: `${(ultimo[0] / ancho) * 100}%`, top: `${(ultimo[1] / alto) * 100}%` }}>{resaltar}</span>}
      {sinDatos && vacio && <span className="grafica-vacia">{vacio}</span>}
      {/* Etiquetas posicionadas: no ensanchan la tarjeta aunque sean muchas. */}
      <div className="ejes">
        {etiquetas.map((e, i) => ((i % cadaEtiqueta === 0 && etiquetas.length - 1 - i >= Math.max(cadaEtiqueta, 2) / 2 + 0.5) || i === etiquetas.length - 1 || i === 0) && (
          <span key={i} style={{ left: `${(i / Math.max(etiquetas.length - 1, 1)) * 100}%`, transform: i === 0 ? "none" : i === etiquetas.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{e}</span>
        ))}
      </div>
    </div>
  );
}
