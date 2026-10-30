import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { Avatar } from "@/components/Avatar";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo, turnosCerrados } from "@/lib/datos";
import { db, schema as t } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Finanzas" };

const $ = formatoDinero;
const SUELDO = new Set(["sueldo", "mixto"]);

export default async function Finanzas({ searchParams }: { searchParams: Promise<ConsultaPeriodo> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.ver")) redirect("/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy, "mes");
  const bId = s.barberia.id;
  const enRango = (col: unknown) => sql`(${col} at time zone ${zona})::date between ${p.desde}::date and ${p.hasta}::date`;
  const [r, porBarbero, pagos, gastos, cortes, gente, reglas] = await Promise.all([
    resumenPeriodo(bId, p.desde, p.hasta, zona),
    db.select({ id: t.conceptos.barberoId, servicios: sql<number>`count(*)::int`, monto: sql<number>`sum(${t.conceptos.precioCobrado})::int`, comision: sql<number>`sum(${t.conceptos.comision})::int` })
      .from(t.conceptos).innerJoin(t.ventas, eq(t.ventas.id, t.conceptos.ventaId))
      .where(and(eq(t.ventas.barberiaId, bId), eq(t.ventas.estado, "pagada"), enRango(t.ventas.creadoEn)))
      .groupBy(t.conceptos.barberoId),
    db.select({ id: t.pagosComision.barberoId, tipo: t.pagosComision.tipo, monto: sql<number>`sum(${t.pagosComision.monto})::int` })
      .from(t.pagosComision).where(and(eq(t.pagosComision.barberiaId, bId), enRango(t.pagosComision.creadoEn)))
      .groupBy(t.pagosComision.barberoId, t.pagosComision.tipo),
    db.select({ categoria: t.gastos.categoria, monto: sql<number>`sum(${t.gastos.monto})::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn)))
      .groupBy(t.gastos.categoria),
    turnosCerrados(bId, 1000, { desde: p.desde, hasta: p.hasta }),
    db.select({ id: t.usuarios.id, nombre: t.usuarios.nombre, avatar: t.usuarios.avatar }).from(t.usuarios).where(eq(t.usuarios.barberiaId, bId)),
    db.select({ id: t.reglasComision.barberoId, tipo: t.reglasComision.tipo }).from(t.reglasComision)
      .where(and(eq(t.reglasComision.barberiaId, bId), isNull(t.reglasComision.vigenteHasta), isNull(t.reglasComision.servicioId))),
  ]);
  const persona = (id: string) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  const esSueldo = (id: string) => SUELDO.has(reglas.find((x) => x.id === id)?.tipo ?? "");
  const pagado = (f: (id: string) => boolean) => pagos.filter((x) => x.tipo === "pago" && f(x.id)).reduce((a, x) => a + x.monto, 0);
  const sueldosPagados = pagado(esSueldo);
  const comisionesPagadas = pagado((id) => !esSueldo(id));
  const rentas = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const comisionesGeneradas = porBarbero.reduce((a, x) => a + x.comision, 0);
  const totalGastos = gastos.reduce((a, x) => a + x.monto, 0);
  const faltantes = cortes.filter((c) => (c.diferencia ?? 0) < 0);
  const sobrantes = cortes.filter((c) => (c.diferencia ?? 0) > 0);
  const neto = cortes.reduce((a, c) => a + (c.diferencia ?? 0), 0);
  const resultado = r.netas + rentas - totalGastos - sueldosPagados - comisionesPagadas;
  const maxB = Math.max(1, ...porBarbero.map((x) => x.monto));
  const maxS = Math.max(1, ...r.porServicio.map(([, x]) => x.monto));
  const maxG = Math.max(1, ...gastos.map((x) => x.monto));

  return (
    <>
      <SelectorPeriodo p={p} hoy={hoy} />
      <section className="glass panel resultado-f subir">
        <div>
          <span className="lab">Resultado del negocio, {p.nombre.toLowerCase()}</span>
          <b className={`big num ${resultado < 0 ? "neg" : ""}`}>{$(resultado)}</b>
          <small className="muted">Lo que queda después de pagar gastos y al equipo.</small>
        </div>
        <div className="cuenta-f">
          <div><span>Ventas</span><b className="num">{$(r.netas)}</b></div>
          {rentas > 0 && <div><span>Rentas de silla cobradas</span><b className="num">+{$(rentas)}</b></div>}
          <div><span>Egresos</span><b className="num">−{$(totalGastos)}</b></div>
          <div><span>Comisiones pagadas</span><b className="num">−{$(comisionesPagadas)}</b></div>
          <div><span>Sueldos pagados</span><b className="num">−{$(sueldosPagados)}</b></div>
        </div>
      </section>

      <section className="fin-g subir d1">
        <div className="glass panel">
          <span className="lab">Ventas por trabajador</span>
          {porBarbero.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
            <div className="ranking">
              {[...porBarbero].sort((a, b) => b.monto - a.monto).map((x, i) => (
                <div key={x.id}>
                  <Avatar avatar={persona(x.id).avatar} nombre={persona(x.id).nombre} t={22} />
                  <span><span className="entre"><b>{persona(x.id).nombre.split(" ").slice(0, 2).join(" ")}</b><span className="num">{$(x.monto)}</span></span>
                    <span className="barra-s"><i style={{ width: `${(x.monto / maxB) * 100}%`, animationDelay: `${0.3 + i * 0.08}s` }} /></span>
                    <small className="muted">{x.servicios} {x.servicios === 1 ? "servicio" : "servicios"}, comisión generada {$(x.comision)}</small></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Ventas por servicio</span>
          {r.porServicio.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
            <div className="ranking">
              {r.porServicio.slice(0, 8).map(([n, x], i) => (
                <div key={n}>
                  <span className="rank">{i + 1}</span>
                  <span><span className="entre"><b>{n}</b><span className="num">{$(x.monto)}</span></span>
                    <span className="barra-s"><i style={{ width: `${(x.monto / maxS) * 100}%`, animationDelay: `${0.3 + i * 0.08}s` }} /></span>
                    <small className="muted">{x.veces} {x.veces === 1 ? "vez" : "veces"}</small></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Ventas por método de pago</span>
          <div className="datos">{r.porMetodo.length ? r.porMetodo.map(([m, v]) => <div key={m}><span>{m}</span><b className="num">{$(v)}</b></div>) : <p className="muted">Sin cobros.</p>}</div>
        </div>
        <div className="glass panel">
          <span className="lab">Equipo</span>
          <div className="datos">
            <div><span>Comisiones generadas<Ayuda titulo="Comisiones generadas">Lo que le corresponde al equipo por los servicios de estas fechas.</Ayuda></span><b className="num">{$(comisionesGeneradas)}</b></div>
            <div><span>Comisiones pagadas</span><b className="num">{$(comisionesPagadas)}</b></div>
            <div><span>Sueldos pagados</span><b className="num">{$(sueldosPagados)}</b></div>
          </div>
        </div>
        <div className="glass panel">
          <span className="lab">Egresos por categoría</span>
          {gastos.length === 0 ? <p className="muted">Sin egresos en estas fechas.</p> : (
            <div className="ranking">
              {[...gastos].sort((a, b) => b.monto - a.monto).map((x, i) => (
                <div key={x.categoria}>
                  <span className="rank">{i + 1}</span>
                  <span><span className="entre"><b>{x.categoria}</b><span className="num">{$(x.monto)}</span></span>
                    <span className="barra-s"><i style={{ width: `${(x.monto / maxG) * 100}%`, animationDelay: `${0.3 + i * 0.08}s` }} /></span></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass panel">
          <span className="lab">Diferencias de caja</span>
          <div className="datos">
            <div><span>Cortes realizados</span><b className="num">{cortes.length}</b></div>
            <div><span>Con faltante</span><b className="num">{faltantes.length}{faltantes.length > 0 && <small className="muted"> ({$(-faltantes.reduce((a, c) => a + (c.diferencia ?? 0), 0))})</small>}</b></div>
            <div><span>Con sobrante</span><b className="num">{sobrantes.length}{sobrantes.length > 0 && <small className="muted"> ({$(sobrantes.reduce((a, c) => a + (c.diferencia ?? 0), 0))})</small>}</b></div>
            <div><span>Diferencia neta</span><b className={`num ${neto < 0 ? "neg" : ""}`}>{neto === 0 ? "Sin diferencias" : `${neto > 0 ? "+" : "−"}${$(Math.abs(neto))}`}</b></div>
          </div>
        </div>
      </section>
    </>
  );
}
