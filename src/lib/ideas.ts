// Calendario comercial: horarios tranquilos detectados con las ventas y fechas que mueven a una barbería.

import { diaDeSemana, diasEntre, finDeMes, nombreDia, sumarDias } from "./fechas";

export const SEMANAS_MINIMAS = 8;

export type Servicio = { fecha: string; hora: number };
export type Franja = { dia: number; desde: number; hasta: number; porSemana: number; relacion: number };

export type Deteccion =
  | { listo: false; semanasConDatos: number; faltan: number }
  | { listo: true; semanasConDatos: number; flojas: Franja[]; picos: Franja[]; promedio: number };

/** Compara cada día y hora contra el promedio del negocio. Floja: menos del 70%. Pico: más del 130%. */
export function detectarFranjas(servicios: Servicio[], hoy: string): Deteccion {
  if (servicios.length === 0) return { listo: false, semanasConDatos: 0, faltan: SEMANAS_MINIMAS };
  const primera = servicios.reduce((m, s) => (s.fecha < m ? s.fecha : m), servicios[0].fecha);
  const semanas = Math.max(1, Math.floor((diasEntre(primera, hoy) + 1) / 7));
  if (semanas < SEMANAS_MINIMAS) return { listo: false, semanasConDatos: semanas, faltan: SEMANAS_MINIMAS - semanas };

  const conteo = new Map<string, number>();
  const dias = new Set<number>();
  let hMin = 23, hMax = 0;
  for (const s of servicios) {
    const d = diaDeSemana(s.fecha);
    dias.add(d);
    hMin = Math.min(hMin, s.hora);
    hMax = Math.max(hMax, s.hora);
    conteo.set(`${d}-${s.hora}`, (conteo.get(`${d}-${s.hora}`) ?? 0) + 1);
  }
  // Solo cuentan las horas en que el local suele trabajar; las horas en que está cerrado no son "tranquilas".
  const porHora = new Map<number, number>();
  for (const sv of servicios) porHora.set(sv.hora, (porHora.get(sv.hora) ?? 0) + 1);
  const maxHora = Math.max(...porHora.values());
  const abierta = (h: number) => (porHora.get(h) ?? 0) >= maxHora * 0.25;
  const celdas: { dia: number; hora: number; porSemana: number }[] = [];
  for (const d of dias) for (let h = hMin; h <= hMax; h++) if (abierta(h)) celdas.push({ dia: d, hora: h, porSemana: (conteo.get(`${d}-${h}`) ?? 0) / semanas });
  const promedio = celdas.reduce((a, c) => a + c.porSemana, 0) / celdas.length;

  const agrupar = (cond: (r: number) => boolean): Franja[] => {
    const res: Franja[] = [];
    for (const d of [...dias].sort()) {
      let actual: { desde: number; hasta: number; suma: number; n: number } | null = null;
      for (let h = hMin; h <= hMax + 1; h++) {
        const c = celdas.find((x) => x.dia === d && x.hora === h);
        const ok = c && cond(c.porSemana / promedio);
        if (ok && c) {
          if (!actual) actual = { desde: h, hasta: h + 1, suma: c.porSemana, n: 1 };
          else { actual.hasta = h + 1; actual.suma += c.porSemana; actual.n++; }
        } else if (actual) {
          const porSemana = actual.suma / actual.n;
          res.push({ dia: d, desde: actual.desde, hasta: actual.hasta, porSemana, relacion: porSemana / promedio });
          actual = null;
        }
      }
    }
    return res;
  };
  const flojas = agrupar((r) => r < 0.7).filter((f) => f.hasta - f.desde >= 2).sort((a, b) => a.relacion - b.relacion).slice(0, 3);
  const picos = agrupar((r) => r > 1.3).sort((a, b) => b.relacion - a.relacion).slice(0, 2);
  return { listo: true, semanasConDatos: semanas, flojas, picos, promedio };
}

export function describirFranja(f: Franja): string {
  const dia = nombreDia(f.dia);
  return `Los ${dia === "sábado" || dia === "domingo" ? dia + "s" : dia} de ${f.desde} a ${f.hasta}`;
}

export type FechaComercial = { fecha: string; titulo: string; consejo: string; aproximada?: boolean };

function enesimoDomingo(anio: number, mes: number, n: number): string {
  const primero = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const d = diaDeSemana(primero);
  return sumarDias(primero, ((7 - d) % 7) + (n - 1) * 7);
}

/** Domingo de Pascua (algoritmo de Butcher). Semana Santa es la semana anterior. */
export function pascua(anio: number): string {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Fechas de los próximos `dias` días, de la más cercana a la más lejana. */
export function fechasComerciales(hoy: string, dias = 60): FechaComercial[] {
  const limite = sumarDias(hoy, dias);
  const lista: FechaComercial[] = [];
  const anio = Number(hoy.slice(0, 4));
  for (const a of [anio, anio + 1]) {
    const domingoPascua = pascua(a);
    lista.push(
      { fecha: `${a}-01-07`, titulo: "Regreso al trabajo", consejo: "Mucha gente vuelve a la oficina y quiere verse bien. Publica horarios temprano y un precio de arranque de año." },
      { fecha: `${a}-01-20`, titulo: "Cuesta de enero", consejo: "Las semanas más flojas del año. Un paquete accesible entre semana mantiene las sillas ocupadas." },
      { fecha: `${a}-02-14`, titulo: "14 de febrero", consejo: "Promueve el arreglo completo para una cita o salida." },
      { fecha: sumarDias(domingoPascua, -7), titulo: "Semana Santa", consejo: "Muchos salen de viaje. Abre más horarios los días antes y avisa qué días cierran." },
      { fecha: `${a}-04-30`, titulo: "Día del Niño", consejo: "Buen momento para el corte infantil. Un detalle para los niños ayuda a que vuelvan." },
      { fecha: `${a}-05-10`, titulo: "Día de las Madres", consejo: "Las familias se arreglan para la comida. Invita a reservar desde el fin de semana anterior." },
      { fecha: enesimoDomingo(a, 6, 3), titulo: "Día del Padre", consejo: "Paquete corte y barba, o una tarjeta de regalo para que los hijos se la den." },
      { fecha: `${a}-07-01`, titulo: "Graduaciones", consejo: "Publica cortes formales durante junio y julio.", aproximada: true },
      { fecha: `${a}-08-17`, titulo: "Regreso a clases", consejo: "Corte escolar para niños y jóvenes. Conviene abrir más temprano esa semana.", aproximada: true },
      { fecha: `${a}-09-15`, titulo: "Fiestas patrias", consejo: "Abre más horarios antes del puente." },
      { fecha: `${a}-10-31`, titulo: "Día de Muertos", consejo: "Diseños con temática, figuras rasuradas o barba con estilo. Publica fotos de trabajos anteriores." },
      { fecha: `${a}-11-14`, titulo: "Buen Fin", consejo: "Prepara el contenido una semana antes. Confirma las fechas oficiales.", aproximada: true },
      { fecha: `${a}-12-16`, titulo: "Posadas y fiestas", consejo: "Conviene abrir más horarios en la tarde." },
      { fecha: `${a}-12-20`, titulo: "Aguinaldo", consejo: "Llega el aguinaldo. Buen momento para tarjetas de regalo y paquetes completos.", aproximada: true },
      { fecha: `${a}-12-24`, titulo: "Navidad y Año Nuevo", consejo: "Las semanas más llenas del año. Abre agenda extendida del 20 al 31 y pide reservar con tiempo." },
    );
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      lista.push({ fecha: `${a}-${mm}-15`, titulo: "Quincena", consejo: "Avisa el día anterior que hay lugares." });
      lista.push({ fecha: finDeMes(`${a}-${mm}-01`), titulo: "Quincena", consejo: "Avisa el día anterior que hay lugares." });
    }
  }
  return lista.filter((f) => f.fecha >= hoy && f.fecha <= limite).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
