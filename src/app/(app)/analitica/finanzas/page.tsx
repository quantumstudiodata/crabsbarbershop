import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { Avatar } from "@/components/Avatar";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo, turnosCerrados } from "@/lib/datos";
import { db, schema as t } from "@/lib/db";
import { diasEntre, fechaLocal, sumarDias } from "@/lib/fechas";
import { Grafica } from "@/components/Grafica";
import { describirRegla } from "@/lib/comisiones";
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
  const [r, porBarbero, pagos, gastos, cortes, gente, reglas, gastoDia, pagoDia] = await Promise.all([
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
    db.select({ id: t.reglasComision.barberoId, tipo: t.reglasComision.tipo, porcentaje: t.reglasComision.porcentaje, montoFijo: t.reglasComision.montoFijo, montoSemanal: t.reglasComision.montoSemanal, periodo: t.reglasComision.periodo }).from(t.reglasComision)
      .where(and(eq(t.reglasComision.barberiaId, bId), isNull(t.reglasComision.vigenteHasta), isNull(t.reglasComision.servicioId))),
    db.select({ d: sql<string>`to_char(${t.gastos.fecha}, 'YYYY-MM-DD')`, monto: sql<number>`sum(${t.gastos.monto})::int` }).from(t.gastos)
      .where(and(eq(t.gastos.barberiaId, bId), gte(t.gastos.fecha, p.desde), lte(t.gastos.fecha, p.hasta), isNull(t.gastos.canceladoEn))).groupBy(sql`1`),
    db.select({ d: sql<string>`to_char(${t.pagosComision.creadoEn} at time zone ${zona}, 'YYYY-MM-DD')`, monto: sql<number>`sum(${t.pagosComision.monto})::int` }).from(t.pagosComision)
      .where(and(eq(t.pagosComision.barberiaId, bId), eq(t.pagosComision.tipo, "pago"), enRango(t.pagosComision.creadoEn))).groupBy(sql`1`),
  ]);
  const persona = (id: string) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  const regla = (id: string) => reglas.find((x) => x.id === id) ?? null;
  const esSueldo = (id: string) => SUELDO.has(regla(id)?.tipo ?? "");
  const pagado = (f: (id: string) => boolean) => pagos.filter((x) => x.tipo === "pago" && f(x.id)).reduce((a, x) => a + x.monto, 0);
  const sueldosPagados = pagado(esSueldo);
  const comisionesPagadas = pagado((id) => !esSueldo(id));
  const rentas = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const comisionesGeneradas = porBarbero.reduce((a, x) => a + x.comision, 0);
  const totalGastos = gastos.reduce((a, x) => a + x.monto, 0);
  const conDif = cortes.filter((c) => (c.diferencia ?? 0) !== 0);
  const neto = cortes.reduce((a, c) => a + (c.diferencia ?? 0), 0);
  const entro = r.netas + rentas;
  const salio = totalGastos + sueldosPagados + comisionesPagadas;
  const quedo = entro - salio;
  const totalEquipo = Math.max(1, porBarbero.reduce((a, x) => a + x.monto, 0));
  const firma = (c: number) => (c < 0 ? `−${$(-c)}` : $(c));

  // Ventas y salidas por día (por mes en el año), para la gráfica de la tarjeta principal.
  const anual = p.tipo === "anio";
  const dias = Array.from({ length: diasEntre(p.desde, p.hasta) + 1 }, (_, i) => sumarDias(p.desde, i));
  const claves = anual ? Array.from({ length: 12 }, (_, i) => `${p.desde.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`) : dias;
  const deClave = (d: string) => (anual ? d.slice(0, 7) : d);
  const ventasK = claves.map((k) => [...r.porDia.entries()].filter(([d]) => deClave(d) === k).reduce((a, [, x]) => a + x, 0));
  const salidasK = claves.map((k) => [...gastoDia, ...pagoDia].filter((x) => deClave(x.d) === k).reduce((a, x) => a + x.monto, 0));
  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const etiquetas = anual ? MES : claves.map((d) => (claves.length <= 7 ? ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"][new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8)))));
  const pasos: [string, number][] = [["Ventas", entro], ["Comisiones pagadas", -comisionesPagadas], ["Sueldos pagados", -sueldosPagados], ["Egresos", -totalGastos], ["Resultado", quedo]];
  const maxPaso = Math.max(1, ...pasos.map(([, v]) => Math.abs(v)));

  return (
    <>
      <SelectorPeriodo p={p} hoy={hoy} conSemana />
      <section className="glass hero-fin subir">
        <div className="tres-fin">
          <div><span className="lab">Entró</span><b className="num">{$(entro)}</b><small>ventas{rentas ? " y rentas de silla" : ""}</small></div>
          <div><span className="lab">Salió</span><b className="num">{$(salio)}</b><small>egresos y pagos al equipo</small></div>
          <div className="quedo"><span className="lab">Quedó</span><b className="num">{firma(quedo)}</b><small>resultado del negocio</small></div>
        </div>
        {p.tipo !== "dia" && claves.filter((k) => k.slice(0, anual ? 7 : 10) <= hoy.slice(0, anual ? 7 : 10)).length >= 3 && (
          <div className="graf-fin">
            <Grafica id="finanzas" actual={claves.map((k, i) => (k.slice(0, anual ? 7 : 10) > hoy.slice(0, anual ? 7 : 10) ? null : ventasK[i]))} previo={salidasK} etiquetas={etiquetas} cadaEtiqueta={anual ? 1 : claves.length <= 7 ? 1 : 5} alto={110}
              descripcion="Ventas contra salidas del periodo" vacio="Sin movimientos en estas fechas"
              globos={claves.map((k, i) => [anual ? MES[i] : etiquetas[i], `Entró ${$(ventasK[i])}`, `Salió ${$(salidasK[i])}`] as [string, string, string])} />
            <div className="leyenda-mv"><span><i className="l-act" />Ventas</span><span><i className="l-prev" />Salidas</span></div>
          </div>
        )}
      </section>

      <section className="dos-fin subir d1">
        <div className="glass panel">
          <span className="lab">De las ventas al resultado</span>
          <div className="pasos-fin">
            {pasos.map(([n, v], i) => (
              <div key={n} className={i === pasos.length - 1 ? "total" : ""}>
                <span>{n}</span>
                <span className="pista-fin"><i style={{ width: `${(Math.abs(v) / maxPaso) * 100}%`, animationDelay: `${0.2 + i * 0.08}s` }} /></span>
                <b className="num">{i === 0 || i === pasos.length - 1 ? firma(v) : v ? `−${$(-v)}` : $(0)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="glass panel">
          <span className="lab">Equipo y caja</span>
          <div className="datos">
            <div><span>Comisiones generadas<Ayuda titulo="Comisiones generadas">Lo que le corresponde al equipo por los servicios de estas fechas.</Ayuda></span><b className="num">{$(comisionesGeneradas)}</b></div>
            <div><span>Comisiones pagadas</span><b className="num">{$(comisionesPagadas)}</b></div>
            <div><span>Por pagar</span><b className="num">{$(Math.max(comisionesGeneradas - comisionesPagadas, 0))}</b></div>
            <div><span>Sueldos pagados</span><b className="num">{$(sueldosPagados)}</b></div>
            <div><span>Diferencias de caja</span><b className="num">{neto === 0 ? "Sin diferencias" : `${neto < 0 ? "−" : "+"}${$(Math.abs(neto))}`}{conDif.length > 0 && <small className="muted"> en {conDif.length} {conDif.length === 1 ? "corte" : "cortes"}</small>}</b></div>
          </div>
        </div>
      </section>

      {porBarbero.length > 0 && (
        <section className="barberos-fin subir d2">
          {[...porBarbero].sort((a, b) => b.monto - a.monto).map((x, i) => {
            const pct = Math.round((x.monto / totalEquipo) * 100);
            return (
              <div key={x.id} className="glass barbero-fin" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
                <Avatar avatar={persona(x.id).avatar} nombre={persona(x.id).nombre} t={44} />
                <span className="nom-fin"><b>{persona(x.id).nombre.split(" ").slice(0, 2).join(" ")}</b><small>{describirRegla(regla(x.id), $)}</small></span>
                <span className="anillo-fin" style={{ ["--p" as string]: `${pct}` }}><span>{pct}%</span></span>
                <span className="cifras-fin"><b className="num">{$(x.monto)}</b><small>{x.servicios} {x.servicios === 1 ? "servicio" : "servicios"}</small></span>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
