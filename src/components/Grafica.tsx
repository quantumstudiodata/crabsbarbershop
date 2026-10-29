// Gráfica de área con curva suave que se dibuja al entrar. Sin JavaScript en el navegador.
// Distingue los días sin ventas (punto hueco en cero) de los que todavía no llegan (zona rayada).

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

const pesos = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-US");

export function Grafica({ id, actual, previo, etiquetas, alto = 170, ancho = 640, descripcion, vacio, cadaEtiqueta = 1, puntos, enCurso, minimo = 1, textoPoco }: {
  id: string;
  /** null = todavía no llega ese momento. */
  actual: (number | null)[];
  previo?: number[];
  etiquetas: string[];
  alto?: number;
  ancho?: number;
  descripcion: string;
  vacio?: string;
  cadaEtiqueta?: number;
  /** Dibuja un punto por cada día u hora. */
  puntos?: boolean;
  /** Índice del momento que todavía no termina (hoy o la hora actual). */
  enCurso?: number;
  /** Cuántos momentos con ventas hacen falta para dibujar una tendencia. */
  minimo?: number;
  textoPoco?: string;
}) {
  const n = Math.max(actual.length, previo?.length ?? 0, 2);
  const max = Math.max(...actual.map((v) => v ?? 0), ...(previo ?? []), 1);
  const x = (i: number) => (n === 1 ? ancho / 2 : (i * ancho) / (n - 1));
  const base = alto - 12;
  const y = (v: number) => base - (v / max) * (alto - 36);
  const pts: Punto[] = actual.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as Punto]));
  const pPrev: Punto[] = (previo ?? []).map((v, i) => [x(i), y(v)]);
  const conVentas = actual.filter((v) => (v ?? 0) > 0).length;
  const poco = conVentas > 0 && conVentas < minimo;
  const sinDatos = conVentas === 0 && (previo ?? []).every((v) => !v);
  const dActual = curva(pts);
  const ultimo = pts[pts.length - 1];
  const primerFuturo = actual.findIndex((v) => v === null);
  return (
    <div className="grafica">
      <svg className="area" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4b6274" stopOpacity=".34" />
            <stop offset="1" stopColor="#4b6274" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`l-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8ea5b8" />
            <stop offset="1" stopColor="#2b3a47" />
          </linearGradient>
          <pattern id={`r-${id}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(30,45,60,.08)" strokeWidth="3" />
          </pattern>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="r" x1="0" x2={ancho} y1={base - f * (alto - 36)} y2={base - f * (alto - 36)} />)}
        {primerFuturo > 0 && <rect className="futuro" x={x(primerFuturo - 1)} y="4" width={ancho - x(primerFuturo - 1)} height={base - 4} fill={`url(#r-${id})`} />}
        {primerFuturo > 0 && ancho - x(primerFuturo - 1) > 110 && <text className="futuro-t" x={(x(primerFuturo - 1) + ancho) / 2} y={base - 8} textAnchor="middle">Aún no llega</text>}
        <line className="b" x1="0" x2={ancho} y1={base} y2={base} />
        {pPrev.length > 1 && <path className="p" d={curva(pPrev)} />}
        {!poco && pts.length > 1 && <path className="f" d={`${dActual} L${ultimo[0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`} fill={`url(#g-${id})`} />}
        {!poco && pts.length > 1 && <path className="l" d={dActual} pathLength={1} stroke={`url(#l-${id})`} />}
        {poco && pts.length > 1 && <path className="l simple" d={pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ")} pathLength={1} />}
        {puntos && actual.map((v, i) => v === null || i === enCurso ? null : (
          <circle key={i} className={v > 0 ? "pt" : "pt cero"} cx={x(i)} cy={y(v)} r={v > 0 ? 4 : 3.5} style={{ animationDelay: `${0.9 + i * (1.2 / n)}s` }}>
            <title>{`${etiquetas[i]}: ${v > 0 ? pesos(v) : "sin ventas"}`}</title>
          </circle>
        ))}
        {ultimo && (enCurso === undefined || actual[enCurso] !== null) && (
          <g>
            <circle className="d2" cx={enCurso !== undefined ? x(enCurso) : ultimo[0]} cy={enCurso !== undefined ? y(actual[enCurso] ?? 0) : ultimo[1]} r={7} />
            <circle className="d" cx={enCurso !== undefined ? x(enCurso) : ultimo[0]} cy={enCurso !== undefined ? y(actual[enCurso] ?? 0) : ultimo[1]} r={6} />
          </g>
        )}
      </svg>
      {sinDatos && vacio && <span className="grafica-vacia">{vacio}</span>}
      {poco && <span className="grafica-vacia">{textoPoco ?? "Todavía hay pocas ventas para ver una tendencia"}</span>}
      <div className="ejes">
        {etiquetas.map((e, i) => ((i % cadaEtiqueta === 0 && etiquetas.length - 1 - i >= Math.max(cadaEtiqueta, 2) / 2 + 0.5) || i === etiquetas.length - 1 || i === 0) && (
          <span key={i} style={{ left: `${(i / Math.max(etiquetas.length - 1, 1)) * 100}%`, transform: i === 0 ? "none" : i === etiquetas.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{e}</span>
        ))}
      </div>
    </div>
  );
}
