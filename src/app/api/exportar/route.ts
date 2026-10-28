import { and, eq, gte, lte } from "drizzle-orm";
import { obtenerSesion } from "@/lib/auth";
import { ajustesDeTurnos, turnosCerrados, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, esFechaValida, fechaLocal, horaCorta, sumarDias } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const pesos = (c: number) => (c / 100).toFixed(2);
function celda(v: unknown): string {
  let t = String(v ?? "");
  // Evita que Excel interprete el texto como fórmula.
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const csv = (filas: unknown[][]) => "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  if (!s.puede("reportes.exportar")) return new Response("No tienes permiso para descargar reportes.", { status: 403 });
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const d = u.searchParams.get("desde"), h = u.searchParams.get("hasta");
  const desde = esFechaValida(d) ? d : sumarDias(hoy, -30);
  const hasta = esFechaValida(h) ? h : hoy;
  if (desde > hasta || diasEntre(desde, hasta) > 400) return new Response("Rango de fechas no válido.", { status: 400 });

  let filas: unknown[][];
  let nombre: string;
  if (tipo === "ventas") {
    const { ventas } = await ventasEntre(s.barberia.id, desde, hasta);
    filas = [["Fecha", "Hora", "Folio", "Estado", "Servicio", "Barbera", "Precio de lista", "Descuento", "Cobrado", "Comisión", "Formas de pago", "Motivo de cancelación"]];
    for (const v of [...ventas].reverse()) {
      for (const c of v.conceptos) {
        filas.push([v.fechaOperativa, horaCorta(v.creadoEn, zona), v.folio, v.estado, c.nombre, c.barbero, pesos(c.precioLista), pesos(c.descuento), pesos(c.precioCobrado), pesos(c.comision),
          v.pagos.map((p) => `${p.metodo} ${pesos(p.monto)}`).join(" y "), v.motivoCancelacion ?? ""]);
      }
    }
    nombre = `ventas_${desde}_${hasta}.csv`;
  } else if (tipo === "gastos") {
    const gs = await db.select().from(schema.gastos)
      .where(and(eq(schema.gastos.barberiaId, s.barberia.id), gte(schema.gastos.fecha, desde), lte(schema.gastos.fecha, hasta)));
    filas = [["Fecha", "Tipo", "Concepto", "Monto", "Pagado con la caja"], ...gs.map((g) => [g.fecha, g.categoria, g.concepto, pesos(g.monto), g.turnoId ? "Sí" : "No"])];
    nombre = `gastos_${desde}_${hasta}.csv`;
  } else if (tipo === "cortes") {
    const ts = await turnosCerrados(s.barberia.id, 1000);
    const aj = await ajustesDeTurnos(s.barberia.id, ts.map((t) => t.id));
    filas = [["Día", "Abrió", "Cerró", "Cerró quien", "Fondo inicial", "Debía haber", "Se contó", "Diferencia", "Notas", "Correcciones"]];
    for (const t of ts) {
      filas.push([t.fechaOperativa, horaCorta(t.abiertoEn, zona), t.cerradoEn ? horaCorta(t.cerradoEn, zona) : "", t.cerradoPor ?? "", pesos(t.fondoInicial),
        pesos(t.efectivoEsperado ?? 0), pesos(t.efectivoContado ?? 0), pesos(t.diferencia ?? 0), t.notasCierre ?? "",
        aj.filter((a) => a.turnoId === t.id).map((a) => `${pesos(a.monto)} ${a.motivo}`).join("; ")]);
    }
    nombre = `cortes_de_caja.csv`;
  } else {
    return new Response("Tipo de reporte no válido.", { status: 400 });
  }
  return new Response(csv(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}
