import { diaDeSemana, horaCorta } from "./fechas";

export type HorarioDia = { abierto: boolean; abre: string; cierra: string };
export type HorarioAgenda = Record<string, HorarioDia>;
export type ReservaAgenda = { iniciaEn: Date; terminaEn: Date; estado: string };

/** Convierte una hora de pared en una fecha UTC para la zona del negocio. */
export function fechaHoraEnZona(fecha: string, hora: string, zona: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const objetivo = Date.UTC(y, m - 1, d, h, min);
  let estimada = objetivo;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(estimada)).map((x) => [x.type, x.value]));
    const representada = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    const delta = representada - objetivo;
    if (!delta) break;
    estimada -= delta;
  }
  return new Date(estimada);
}

export function inicioDelDiaEnZona(fecha: string, zona: string): Date {
  return fechaHoraEnZona(fecha, "00:00", zona);
}

export function slotsDisponibles(args: {
  fecha: string;
  zona: string;
  horario: HorarioAgenda;
  duracionMin: number;
  reservas: ReservaAgenda[];
  ahora?: Date;
}) {
  const h = args.horario[String(diaDeSemana(args.fecha))];
  if (!h?.abierto || !/^\d{2}:\d{2}$/.test(h.abre) || !/^\d{2}:\d{2}$/.test(h.cierra)) return [];
  const [ah, am] = h.abre.split(":").map(Number);
  const [ch, cm] = h.cierra.split(":").map(Number);
  const inicio = ah * 60 + am;
  const cierre = ch * 60 + cm;
  const duracion = Math.max(15, Math.min(args.duracionMin, 8 * 60));
  if (inicio < 0 || cierre > 24 * 60 || cierre <= inicio || inicio % 15 || cierre % 15) return [];
  const ahora = args.ahora ?? new Date();
  const resultado: { hora: string; iniciaEn: string; terminaEn: string }[] = [];
  for (let minuto = inicio; minuto + duracion <= cierre; minuto += 15) {
    const hora = `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
    const empieza = fechaHoraEnZona(args.fecha, hora, args.zona);
    const termina = new Date(empieza.getTime() + duracion * 60_000);
    if (empieza <= ahora) continue;
    if (args.reservas.some((r) => r.estado !== "cancelada" && empieza < r.terminaEn && termina > r.iniciaEn)) continue;
    resultado.push({ hora: horaCorta(empieza, args.zona), iniciaEn: empieza.toISOString(), terminaEn: termina.toISOString() });
  }
  return resultado;
}
