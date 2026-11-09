// Reglas de las promociones. Se usan igual en el navegador (para mostrar) y en el servidor (para cobrar).

export type TipoPromo = "precio" | "fijo" | "porcentaje" | "paquete" | "horario";

export type Promo = {
  id: string; nombre: string; descripcion: string; tipo: TipoPromo; valor: number;
  servicioIds: string[]; categorias: string[];
  desde: string; hasta: string | null; dias: number[]; horaDesde: string | null; horaHasta: string | null;
  aplicacion: "auto" | "codigo"; codigo: string | null; enCobro: boolean; enLinea: boolean;
  limiteUsos: number | null; usos: number; pausada: boolean;
};

export type LineaPromo = { servicioId: string; categoria: string; precio: number };
export type Momento = { fecha: string; dia: number; hora: string };

export const NOMBRE_TIPO: Record<TipoPromo, string> = {
  precio: "Precio especial", fijo: "Descuento fijo", porcentaje: "Descuento porcentual", paquete: "Paquete promocional", horario: "Promoción por horario",
};

export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Fecha, día de la semana y hora del negocio en este momento. */
export function momentoEn(zona: string, ahora = new Date()): Momento {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(ahora).map((x) => [x.type, x.value]));
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, dia: dias[p.weekday] ?? 0, hora: `${p.hour}:${p.minute}` };
}

export type EstadoPromo = "Activa" | "Pausada" | "Programada" | "Terminada" | "Agotada";

export function estadoPromo(p: Promo, hoy: string): EstadoPromo {
  if (p.pausada) return "Pausada";
  if (p.hasta && p.hasta < hoy) return "Terminada";
  if (p.limiteUsos !== null && p.usos >= p.limiteUsos) return "Agotada";
  if (p.desde > hoy) return "Programada";
  return "Activa";
}

/** ¿Se puede usar ahora mismo (fecha, día y horario)? */
export function vigente(p: Promo, m: Momento): boolean {
  if (estadoPromo(p, m.fecha) !== "Activa") return false;
  if (!p.dias.includes(m.dia)) return false;
  if (p.horaDesde && m.hora < p.horaDesde) return false;
  if (p.horaHasta && m.hora >= p.horaHasta) return false;
  return true;
}

export const participa = (p: Promo, l: { servicioId: string; categoria: string }) => p.servicioIds.includes(l.servicioId) || p.categorias.includes(l.categoria);

/** Descuento que da una promoción (no de paquete) a un servicio con ese precio. */
export function descuentoDe(p: Promo, precio: number): number {
  if (p.tipo === "precio") return Math.max(0, precio - p.valor);
  if (p.tipo === "fijo") return Math.min(p.valor, precio);
  if (p.tipo === "porcentaje" || p.tipo === "horario") return Math.floor((precio * Math.min(p.valor, 10000)) / 10000);
  return 0;
}

export type Aplicada = { promocionId: string; descuento: number }[];

/**
 * Qué promoción le toca a cada servicio de la venta. Primero los paquetes (todos sus servicios tienen que estar),
 * después a cada servicio la que más ahorre. Las de código solo entran si se escribió su código.
 */
export function aplicarPromos(promos: Promo[], lineas: LineaPromo[], m: Momento, codigo: string, canal: "cobro" | "linea" = "cobro") {
  const cod = codigo.trim().toUpperCase();
  const usables = promos.filter((p) => vigente(p, m) && (canal === "cobro" ? p.enCobro : p.enLinea)
    && (p.aplicacion === "auto" || (cod !== "" && (p.codigo ?? "").toUpperCase() === cod)));
  const res: ({ promocionId: string; descuento: number } | null)[] = lineas.map(() => null);
  for (const p of usables.filter((x) => x.tipo === "paquete" && x.servicioIds.length > 0)) {
    const tomadas: number[] = [];
    for (const sid of p.servicioIds) {
      const i = lineas.findIndex((l, k) => l.servicioId === sid && res[k] === null && !tomadas.includes(k));
      if (i < 0) { tomadas.length = 0; break; }
      tomadas.push(i);
    }
    if (!tomadas.length) continue;
    const suma = tomadas.reduce((a, i) => a + lineas[i].precio, 0);
    const ahorro = Math.max(0, suma - p.valor);
    if (!ahorro) continue;
    let resta = ahorro;
    tomadas.forEach((i, k) => {
      const d = k === tomadas.length - 1 ? resta : Math.floor((ahorro * lineas[i].precio) / Math.max(suma, 1));
      resta -= d;
      res[i] = { promocionId: p.id, descuento: d };
    });
  }
  lineas.forEach((l, i) => {
    if (res[i]) return;
    let mejor: { promocionId: string; descuento: number } | null = null;
    for (const p of usables) {
      if (p.tipo === "paquete" || !participa(p, l)) continue;
      const d = descuentoDe(p, l.precio);
      if (d > 0 && (!mejor || d > mejor.descuento)) mejor = { promocionId: p.id, descuento: d };
    }
    res[i] = mejor;
  });
  const usadas = [...new Set(res.filter(Boolean).map((r) => r!.promocionId))];
  const codigoValido = cod !== "" && usables.some((p) => p.aplicacion === "codigo");
  return { porLinea: res, usadas, codigoValido };
}

/** Texto corto del beneficio: "$30 menos", "20% de descuento", "Queda en $120". */
export function textoBeneficio(p: Pick<Promo, "tipo" | "valor">, pesos: (c: number) => string): string {
  if (p.tipo === "precio") return `Precio especial de ${pesos(p.valor)}`;
  if (p.tipo === "fijo") return `${pesos(p.valor)} menos`;
  if (p.tipo === "paquete") return `Paquete por ${pesos(p.valor)}`;
  return `${p.valor / 100}% de descuento`;
}

export function textoVigencia(p: Pick<Promo, "desde" | "hasta" | "dias" | "horaDesde" | "horaHasta">, fecha: (f: string) => string): string {
  const partes = [p.hasta ? `Del ${fecha(p.desde)} al ${fecha(p.hasta)}` : `Desde el ${fecha(p.desde)}`];
  if (p.dias.length && p.dias.length < 7) partes.push([1, 2, 3, 4, 5, 6, 0].filter((d) => p.dias.includes(d)).map((d) => DIAS_CORTOS[d]).join(", "));
  if (p.horaDesde && p.horaHasta) partes.push(`de ${p.horaDesde} a ${p.horaHasta}`);
  return partes.join(", ");
}
