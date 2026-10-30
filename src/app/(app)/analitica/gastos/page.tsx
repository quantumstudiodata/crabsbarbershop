import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { categoriasGasto, turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";
import { Egresos, type DiaEgresos } from "./Egresos";

export const metadata = { title: "Egresos" };

export default async function PaginaEgresos({ searchParams }: { searchParams: Promise<ConsultaPeriodo> }) {
  const s = await requerirSesion();
  if (!s.puede("gastos.registrar") && !s.puede("reportes.ver")) redirect("/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy, "mes");
  const g = schema.gastos;
  const quien = alias(schema.usuarios, "quien");
  const cancelo = alias(schema.usuarios, "cancelo");
  const [filas, cats, turno] = await Promise.all([
    db.select({ g, quien: quien.nombre, cancelo: cancelo.nombre }).from(g)
      .innerJoin(quien, eq(quien.id, g.usuarioId)).leftJoin(cancelo, eq(cancelo.id, g.canceladoPor))
      .where(and(eq(g.barberiaId, s.barberia.id), gte(g.fecha, p.desde), lte(g.fecha, p.hasta)))
      .orderBy(desc(g.fecha), desc(g.creadoEn)),
    categoriasGasto(s.barberia.id, false),
    turnoAbierto(s.barberia.id),
  ]);
  const vigentes = filas.filter((f) => !f.g.canceladoEn);
  const total = vigentes.reduce((a, f) => a + f.g.monto, 0);
  const porMetodo = (m: string) => vigentes.filter((f) => f.g.metodo === m).reduce((a, f) => a + f.g.monto, 0);
  const porCat = new Map<string, number>();
  for (const f of vigentes) porCat.set(f.g.categoria, (porCat.get(f.g.categoria) ?? 0) + f.g.monto);

  const dias: DiaEgresos[] = [];
  for (const f of filas) {
    let d = dias.find((x) => x.fecha === f.g.fecha);
    if (!d) { d = { fecha: f.g.fecha, titulo: f.g.fecha === hoy ? "Hoy" : fechaLarga(f.g.fecha), total: 0, filas: [] }; dias.push(d); }
    if (!f.g.canceladoEn) d.total += f.g.monto;
    const cerrado = !!f.g.turnoId && f.g.turnoId !== turno?.id;
    d.filas.push({
      id: f.g.id, concepto: f.g.concepto, categoria: f.g.categoria, metodo: f.g.metodo, monto: f.g.monto, cancelado: !!f.g.canceladoEn,
      puedeCancelar: s.puede("gastos.registrar") && !f.g.canceladoEn && !cerrado,
      detalle: [
        ["Registró", `${f.quien.split(" ")[0]}, ${horaCorta(f.g.creadoEn, zona)}`],
        ["Se pagó", f.g.metodo === "transferencia" ? "Por transferencia" : f.g.turnoId ? "En efectivo, de la caja" : "En efectivo, fuera de la caja"],
        ...(f.g.descripcion ? [["Descripción", f.g.descripcion] as [string, string]] : []),
        ...(f.g.canceladoEn ? [["Cancelado", `${f.cancelo?.split(" ")[0] ?? ""}: ${f.g.motivoCancelacion ?? ""}`] as [string, string]] : []),
      ],
    });
  }

  return (
    <>
      <div className="entre" style={{ flexWrap: "wrap", gap: 12 }}>
        <SelectorPeriodo p={p} hoy={hoy} />
      </div>
      <Egresos
        dias={dias} hoy={hoy} cajaAbierta={!!turno} puede={s.puede("gastos.registrar")}
        categorias={cats} resumen={{ total, efectivo: porMetodo("efectivo"), transferencia: porMetodo("transferencia"), movimientos: vigentes.length }}
        porCategoria={[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([n, m]) => ({ nombre: n, monto: m, texto: formatoDinero(m) }))}
        etiqueta={p.etiqueta}
      />
    </>
  );
}
