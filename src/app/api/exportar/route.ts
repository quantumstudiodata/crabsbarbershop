import ExcelJS from "exceljs";
import { and, eq, gte, lte } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { describirRegla, elegirRegla } from "@/lib/comisiones";
import { ajustesDeTurnos, copiaRegla, equipoQueAtiende, foliosCorte, reglasDe, turnosCerrados, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, esFechaValida, fechaLocal, horaCorta, lunesDe, sumarDias } from "@/lib/fechas";
import { condicionVentas, filtrarCortes } from "@/lib/filtros";
import { formatoDinero } from "@/lib/money";

export const dynamic = "force-dynamic";

type Filas = unknown[][];
const pesos = (c: number) => (c / 100).toFixed(2);
function celda(v: unknown): string {
  let t = String(v ?? "");
  // Evita que Excel interprete el texto como fórmula.
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const csv = (filas: Filas) => "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");

async function ventas(bId: string, desde: string, hasta: string, zona: string, f: { persona: string; buscar: string }): Promise<Filas> {
  const { ventas } = await ventasEntre(bId, desde, hasta, { zona, condiciones: condicionVentas(f) });
  const filas: Filas = [["Fecha", "Hora", "Folio", "Estado", "Servicio", "Atendió", "Precio de lista", "Descuento", "Cobrado", "Comisión", "Formas de pago", "Motivo de cancelación"]];
  for (const v of [...ventas].reverse()) {
    for (const c of v.conceptos.filter((x) => !f.persona || x.barberoId === f.persona)) {
      filas.push([v.fecha, horaCorta(v.creadoEn, zona), v.folio, v.estado, c.nombre, c.barbero, pesos(c.precioLista), pesos(c.descuento), pesos(c.precioCobrado), pesos(c.comision),
        v.pagos.map((p) => `${p.metodo} ${pesos(p.monto)}`).join(" y "), v.motivoCancelacion ?? ""]);
    }
  }
  return filas;
}

async function gastos(bId: string, desde: string, hasta: string): Promise<Filas> {
  const gs = await db.select().from(schema.gastos).where(and(eq(schema.gastos.barberiaId, bId), gte(schema.gastos.fecha, desde), lte(schema.gastos.fecha, hasta)));
  return [["Fecha", "Categoría", "Concepto", "Descripción", "Monto", "Método de pago", "Salió de la caja", "Estado", "Motivo de cancelación"],
    ...gs.map((g) => [g.fecha, g.categoria, g.concepto, g.descripcion, pesos(g.monto), g.metodo === "transferencia" ? "Transferencia" : "Efectivo", g.turnoId ? "Sí" : "No", g.canceladoEn ? "Cancelado" : "Vigente", g.motivoCancelacion ?? ""])];
}

async function cortes(bId: string, desde: string, hasta: string, zona: string, f: { persona: string; buscar: string }): Promise<Filas> {
  const [todos, folios, gente] = await Promise.all([
    turnosCerrados(bId, 100000, { desde, hasta }), foliosCorte(bId),
    db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, bId)),
  ]);
  const ts = filtrarCortes(todos, f, folios, new Map(gente.map((g) => [g.id, g.nombre])));
  const aj = await ajustesDeTurnos(bId, ts.map((t) => t.id));
  const filas: Filas = [["Folio", "Día", "Abrió", "Cerró", "Cerró quien", "Fondo de apertura", "Efectivo esperado", "Efectivo contado", "Diferencia", "Otras formas de pago", "Notas", "Correcciones"]];
  for (const t of ts) {
    const ver = Object.entries((t.verificacion ?? {}) as Record<string, { total: number; coincide?: boolean }>).map(([m, v]) => `${m} ${pesos(v.total)}${v.coincide === false ? " no coincide" : ""}`).join("; ");
    filas.push([folios.get(t.id) ?? "", t.fechaOperativa, horaCorta(t.abiertoEn, zona), t.cerradoEn ? horaCorta(t.cerradoEn, zona) : "", t.cerradoPor ?? "", pesos(t.fondoInicial),
      pesos(t.efectivoEsperado ?? 0), pesos(t.efectivoContado ?? 0), pesos(t.diferencia ?? 0), ver, t.notasCierre ?? "",
      aj.filter((a) => a.turnoId === t.id).map((a) => `${pesos(a.monto)} ${a.motivo}`).join("; ")]);
  }
  return filas;
}

async function pagosEquipo(bId: string, desde: string, hasta: string): Promise<Filas> {
  const filas = await db
    .select({ p: schema.pagosComision, nombre: schema.usuarios.nombre })
    .from(schema.pagosComision)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.pagosComision.barberoId))
    .where(and(eq(schema.pagosComision.barberiaId, bId), gte(schema.pagosComision.semana, lunesDe(desde)), lte(schema.pagosComision.semana, hasta)));
  return [["Semana", "Persona", "Tipo", "Monto", "Nota"], ...filas.map((f) => [f.p.semana, f.nombre, f.p.tipo === "renta" ? "Pagó renta" : "Pago del negocio", pesos(f.p.monto), f.p.nota])];
}

/** Libro de Excel con una hoja por tema. Los montos van como números para poder sumarlos. */
async function libro(hojas: [string, Filas][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Crabs";
  for (const [nombre, filas] of hojas) {
    const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    for (const f of filas) ws.addRow(f.map((v) => (typeof v === "string" && /^-?\d+\.\d{2}$/.test(v) ? Number(v) : v)));
    const enc = ws.getRow(1);
    enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
    enc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13171C" } };
    ws.columns.forEach((c, i) => {
      const largo = Math.max(...filas.map((f) => String(f[i] ?? "").length), 8);
      c.width = Math.min(largo + 2, 48);
      const esDinero = filas.slice(1).some((f) => typeof f[i] === "string" && /^-?\d+\.\d{2}$/.test(f[i] as string));
      if (esDinero) c.numFmt = '"$"#,##0.00';
    });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

async function equipo(bId: string, desde: string, hasta: string, zona: string): Promise<Filas> {
  const [gente, reglas, { ventas }, pagos] = await Promise.all([
    equipoQueAtiende(bId), reglasDe(bId), ventasEntre(bId, desde, hasta, { zona }),
    db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, bId), gte(schema.pagosComision.semana, lunesDe(desde)), lte(schema.pagosComision.semana, hasta))),
  ]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const filas: Filas = [["Persona", "Forma de pago", "Servicios", "Ventas generadas", "Comisión generada", "Propinas", "Pagos del negocio", "Renta pagada"]];
  for (const p of gente) {
    const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === p.id));
    const regla = copiaRegla(elegirRegla(reglas, p.id, null, new Date()));
    filas.push([p.nombre, describirRegla(regla, formatoDinero), cs.length, pesos(cs.reduce((a, c) => a + c.precioCobrado, 0)), pesos(cs.reduce((a, c) => a + c.comision, 0)),
      pesos(pagadas.flatMap((v) => v.propinas).filter((x) => x.barberoId === p.id).reduce((a, x) => a + x.monto, 0)),
      pesos(pagos.filter((x) => x.barberoId === p.id && x.tipo === "pago").reduce((a, x) => a + x.monto, 0)),
      pesos(pagos.filter((x) => x.barberoId === p.id && x.tipo === "renta").reduce((a, x) => a + x.monto, 0))]);
  }
  return filas;
}

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  if (!s.puede("reportes.exportar")) return new Response("No tienes permiso para descargar reportes.", { status: 403 });
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  // Sin fechas se descarga todo el historial.
  const d = u.searchParams.get("desde"), h = u.searchParams.get("hasta");
  const conFechas = esFechaValida(d) && esFechaValida(h);
  const desde = conFechas ? d : "2000-01-01";
  const hasta = conFechas ? h : hoy;
  if (desde > hasta || diasEntre(desde, hasta) > 10000) return new Response("Rango de fechas no válido.", { status: 400 });
  const f = { persona: /^[0-9a-f-]{36}$/.test(u.searchParams.get("persona") ?? "") ? u.searchParams.get("persona")! : "", buscar: (u.searchParams.get("q") ?? "").trim().slice(0, 60) };
  const bId = s.barberia.id;

  const hojas: Record<string, () => Promise<[string, Filas]>> = {
    ventas: async () => ["Ventas", await ventas(bId, desde, hasta, zona, f)],
    gastos: async () => ["Gastos", await gastos(bId, desde, hasta)],
    cortes: async () => ["Cortes de caja", await cortes(bId, desde, hasta, zona, f)],
    equipo: async () => ["Equipo", await equipo(bId, desde, hasta, zona)],
    pagos: async () => ["Pagos al equipo", await pagosEquipo(bId, desde, hasta)],
  };
  const elegidas = tipo === "todo" ? Object.keys(hojas) : tipo && tipo in hojas ? [tipo] : [];
  if (elegidas.length === 0) return new Response("Tipo de reporte no válido.", { status: 400 });
  const datos = await Promise.all(elegidas.map((k) => hojas[k]()));
  const base = `${tipo === "todo" ? "cierre" : tipo}_${conFechas ? `${desde}_${hasta}` : "todo"}`;

  if (u.searchParams.get("formato") === "csv") {
    const filas: Filas = datos.length === 1 ? datos[0][1] : datos.flatMap(([t, f]) => [[], [t.toUpperCase()], ...f]);
    return new Response(csv(filas), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return new Response(await libro(datos), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store",
    },
  });
}
