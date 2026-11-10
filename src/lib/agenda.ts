// Disponibilidad de la agenda. Lógica pura: se usa igual en la página pública, en la agenda y al guardar una cita.

export type Horario = Record<string, [string, string]>;

export type ModoPago = "sin_pago" | "opcional" | "completo" | "anticipo_fijo" | "anticipo_pct";

export type ConfigCitas = {
  enLinea: boolean; // reservaciones en línea activas
  anticipacionMinMin: number; // minutos mínimos antes de la cita
  anticipacionMaxDias: number; // días máximos hacia adelante
  margenMin: number; // tiempo adicional entre citas
  pasoMin: number; // cada cuántos minutos se ofrecen horarios
  elegirBarbero: boolean;
  cualquierBarbero: boolean;
  variosServicios: boolean;
  pago: { modo: ModoPago; valor: number }; // anticipo_fijo: centavos; anticipo_pct: puntos base
  cancelarHorasAntes: number;
  politicaCancelacion: string;
  politicaReembolso: string;
  apartarMin: number; // minutos que se guarda un horario mientras el cliente paga
  // Interruptores de Ajustes, Horarios: apagados no borran lo configurado, solo dejan de aplicarse.
  usaHorarioPersona: boolean;
  usaRotacion: boolean;
  usaBloqueos: boolean;
};

export const CONFIG_CITAS: ConfigCitas = {
  enLinea: false,
  anticipacionMinMin: 120, anticipacionMaxDias: 30, margenMin: 0, pasoMin: 15,
  elegirBarbero: true, cualquierBarbero: true, variosServicios: true,
  pago: { modo: "sin_pago", valor: 0 }, cancelarHorasAntes: 2,
  politicaCancelacion: "Puedes cancelar o cambiar tu cita hasta 2 horas antes.",
  politicaReembolso: "", apartarMin: 10,
  usaHorarioPersona: true, usaRotacion: true, usaBloqueos: true,
};

export function leerConfig(raw: unknown): ConfigCitas {
  const r = (raw ?? {}) as Partial<ConfigCitas>;
  const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : d);
  const modos: ModoPago[] = ["sin_pago", "opcional", "completo", "anticipo_fijo", "anticipo_pct"];
  const d = CONFIG_CITAS;
  return {
    enLinea: r.enLinea ?? d.enLinea,
    anticipacionMinMin: num(r.anticipacionMinMin, d.anticipacionMinMin, 0, 7 * 24 * 60),
    anticipacionMaxDias: num(r.anticipacionMaxDias, d.anticipacionMaxDias, 1, 180),
    margenMin: num(r.margenMin, d.margenMin, 0, 120),
    pasoMin: num(r.pasoMin, d.pasoMin, 5, 60),
    elegirBarbero: r.elegirBarbero ?? d.elegirBarbero,
    cualquierBarbero: r.cualquierBarbero ?? d.cualquierBarbero,
    variosServicios: r.variosServicios ?? d.variosServicios,
    pago: { modo: modos.includes(r.pago?.modo as ModoPago) ? (r.pago!.modo as ModoPago) : "sin_pago", valor: num(r.pago?.valor, 0, 0, 100000000) },
    cancelarHorasAntes: num(r.cancelarHorasAntes, d.cancelarHorasAntes, 0, 168),
    politicaCancelacion: typeof r.politicaCancelacion === "string" ? r.politicaCancelacion.slice(0, 400) : d.politicaCancelacion,
    politicaReembolso: typeof r.politicaReembolso === "string" ? r.politicaReembolso.slice(0, 400) : d.politicaReembolso,
    apartarMin: num(r.apartarMin, d.apartarMin, 5, 30),
    usaHorarioPersona: r.usaHorarioPersona ?? d.usaHorarioPersona,
    usaRotacion: r.usaRotacion ?? d.usaRotacion,
    usaBloqueos: r.usaBloqueos ?? d.usaBloqueos,
  };
}

/** Cuánto se paga al reservar según la configuración. */
export function montoAPagar(total: number, pago: ConfigCitas["pago"]): { minimo: number; sugerido: number } {
  if (pago.modo === "completo") return { minimo: total, sugerido: total };
  if (pago.modo === "anticipo_fijo") { const a = Math.min(pago.valor, total); return { minimo: a, sugerido: a }; }
  if (pago.modo === "anticipo_pct") { const a = Math.round((total * Math.min(pago.valor, 10000)) / 10000); return { minimo: a, sugerido: a }; }
  if (pago.modo === "opcional") return { minimo: 0, sugerido: total };
  return { minimo: 0, sugerido: 0 };
}

export const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
export const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Diferencia en minutos entre la hora local de una zona y UTC en un instante. */
function desfase(zona: string, t: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((local - Math.floor(t / 60000) * 60000) / 60000);
}

/** Instante (milisegundos) de una fecha y minuto del día en la zona del negocio. */
export function instante(fecha: string, minutos: number, zona: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, 0, minutos);
  let t = ingenuo - desfase(zona, ingenuo) * 60000;
  t = ingenuo - desfase(zona, t) * 60000;
  return t;
}

export const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

export type Rotacion = { persona1: string; persona2: string; dia1: number; dia2: number; semanaInicio: string; activo: boolean };

/** ¿Esa persona descansa ese día por la rotación? La semana de inicio, persona 1 descansa el día 1; la siguiente, el día 2. */
export function descansaPorRotacion(rots: Rotacion[], persona: string, fecha: string): boolean {
  const dia = diaSemana(fecha);
  const lunes = (f: string) => { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.getTime(); };
  for (const r of rots) {
    if (!r.activo || (r.persona1 !== persona && r.persona2 !== persona)) continue;
    const semanas = Math.round((lunes(fecha) - lunes(r.semanaInicio)) / (7 * 864e5));
    const par = ((semanas % 2) + 2) % 2 === 0;
    const suDia = (r.persona1 === persona) === par ? r.dia1 : r.dia2;
    if (dia === suDia) return true;
  }
  return false;
}

/** Quién descansa cada día rotativo en la semana de esa fecha. */
export function descansosDeSemana(r: Rotacion, fecha: string): { dia: number; persona: string }[] {
  const lunesF = new Date(`${fecha}T12:00:00Z`); lunesF.setUTCDate(lunesF.getUTCDate() - ((lunesF.getUTCDay() + 6) % 7));
  const lunesI = new Date(`${r.semanaInicio}T12:00:00Z`); lunesI.setUTCDate(lunesI.getUTCDate() - ((lunesI.getUTCDay() + 6) % 7));
  const par = ((Math.round((lunesF.getTime() - lunesI.getTime()) / (7 * 864e5)) % 2) + 2) % 2 === 0;
  return [{ dia: r.dia1, persona: par ? r.persona1 : r.persona2 }, { dia: r.dia2, persona: par ? r.persona2 : r.persona1 }];
}

/** Horario de trabajo de una persona en una fecha (minutos del día), o null si no trabaja. */
export function ventanaDelDia(fecha: string, negocio: Horario, cerrados: string[], propio: Horario | null, rots: Rotacion[], persona: string): [number, number] | null {
  if (cerrados.includes(fecha)) return null;
  const d = String(diaSemana(fecha));
  const n = negocio[d];
  if (!n) return null;
  if (descansaPorRotacion(rots, persona, fecha)) return null;
  let ini = aMin(n[0]), fin = aMin(n[1]);
  if (propio) {
    const p = propio[d];
    if (!p) return null;
    ini = Math.max(ini, aMin(p[0])); fin = Math.min(fin, aMin(p[1]));
  }
  return fin > ini ? [ini, fin] : null;
}

export type Ocupado = { persona: string | null; inicio: number; fin: number };

/**
 * Horarios libres (minutos del día) de una persona para un servicio de cierta duración.
 * Respeta su horario, la anticipación, las citas (con margen) y los bloqueos (propios o de todo el negocio).
 */
export function horariosLibres(p: {
  fecha: string; zona: string; ahora: number; duracion: number; config: ConfigCitas;
  ventana: [number, number] | null; persona: string; ocupados: Ocupado[]; ignorarCita?: number[];
}): number[] {
  if (!p.ventana || p.duracion <= 0) return [];
  const { config: c } = p;
  const minimo = p.ahora + c.anticipacionMinMin * 60000;
  const maximo = p.ahora + c.anticipacionMaxDias * 864e5;
  const mios = p.ocupados.filter((o) => o.persona === p.persona || o.persona === null);
  const libres: number[] = [];
  for (let m = p.ventana[0]; m + p.duracion <= p.ventana[1]; m += c.pasoMin) {
    const ini = instante(p.fecha, m, p.zona), fin = ini + p.duracion * 60000;
    if (ini < minimo || ini > maximo) continue;
    const choca = mios.some((o) => {
      const margen = o.persona === null ? 0 : c.margenMin * 60000;
      return ini < o.fin + margen && fin + margen > o.inicio;
    });
    if (!choca) libres.push(m);
  }
  return libres;
}
