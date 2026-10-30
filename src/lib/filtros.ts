import { sql, type SQL } from "drizzle-orm";
import { schema as s } from "./db";
import { type ConsultaPeriodo, leerPeriodo, type Periodo } from "./periodo";

// Filtros de Analítica: un periodo (o todo el historial), una persona y un texto a buscar.

export type ConsultaFiltros = ConsultaPeriodo & { persona?: string; q?: string; pagina?: string };
export type Filtros = { periodo: Periodo | null; persona: string; buscar: string; pagina: number };

export const DIAS_POR_PAGINA = 7;

export function leerFiltros(q: ConsultaFiltros, hoy: string, personas: string[]): Filtros {
  const conFecha = !!(q.periodo || q.fecha || q.mes || q.anio || (q.desde && q.hasta));
  return {
    periodo: conFecha ? leerPeriodo(q, hoy, "dia") : null,
    persona: q.persona && personas.includes(q.persona) ? q.persona : "",
    buscar: (q.q ?? "").trim().slice(0, 60),
    pagina: Math.max(1, Math.floor(Number(q.pagina)) || 1),
  };
}

/** Condición SQL sobre ventas: persona que atendió y texto (folio, servicio, quien atendió o forma de pago). */
export function condicionVentas(f: { persona: string; buscar: string }): SQL[] {
  const cond: SQL[] = [];
  if (f.persona) cond.push(sql`exists (select 1 from ${s.conceptos} c where c.venta_id = ${s.ventas.id} and c.barbero_id = ${f.persona})`);
  if (f.buscar) {
    const t = `%${f.buscar}%`;
    cond.push(sql`(${s.ventas.folio} ilike ${t}
      or exists (select 1 from ${s.conceptos} c join ${s.usuarios} u on u.id = c.barbero_id where c.venta_id = ${s.ventas.id} and (c.nombre_servicio ilike ${t} or u.nombre ilike ${t}))
      or exists (select 1 from ${s.pagos} p where p.venta_id = ${s.ventas.id} and p.nombre_metodo ilike ${t}))`);
  }
  return cond;
}

/** Los días de una página: la lista de días con movimientos va del más reciente al más viejo. */
export function rangoDePagina(dias: string[], pagina: number) {
  const total = Math.max(1, Math.ceil(dias.length / DIAS_POR_PAGINA));
  const p = Math.min(pagina, total);
  const deLaPagina = dias.slice((p - 1) * DIAS_POR_PAGINA, p * DIAS_POR_PAGINA);
  return { pagina: p, paginas: total, dias: deLaPagina, desde: deLaPagina[deLaPagina.length - 1], hasta: deLaPagina[0] };
}

/** Dirección de descarga con los mismos filtros. Sin periodo se descarga todo. */
export function urlDescarga(tipo: string, f: Filtros) {
  const q = new URLSearchParams({ tipo });
  if (f.periodo) { q.set("desde", f.periodo.desde); q.set("hasta", f.periodo.hasta); }
  if (f.persona) q.set("persona", f.persona);
  if (f.buscar) q.set("q", f.buscar);
  return `/api/exportar?${q.toString()}`;
}

/** Filtra cortes por persona (abrió o cerró) y por texto (folio, observaciones o nombres). */
export function filtrarCortes<T extends { id: string; abiertoPor: string | null; cerradoPorId: string | null; cerradoPor: string | null; notasCierre: string | null }>(
  cortes: T[], f: { persona: string; buscar: string }, folios: Map<string, string>, nombres: Map<string, string>,
) {
  const t = f.buscar.toLowerCase();
  return cortes.filter((c) => (!f.persona || c.abiertoPor === f.persona || c.cerradoPorId === f.persona)
    && (!t || [folios.get(c.id), c.notasCierre, c.cerradoPor, nombres.get(c.abiertoPor ?? "")].some((x) => x?.toLowerCase().includes(t))));
}
