import { and, count, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal, lunesDe } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { Descargar } from "./Descargar";

export const metadata = { title: "Cierres y descargas" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function Cierres({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.exportar")) redirect("/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy, "mes");
  const bId = s.barberia.id;
  const [r, cortes, [gastos], pagos] = await Promise.all([
    resumenPeriodo(bId, p.desde, p.hasta, zona),
    turnosCerrados(bId, 1000, { desde: p.desde, hasta: p.hasta }),
    db.select({ n: count() }).from(schema.gastos).where(and(eq(schema.gastos.barberiaId, bId), gte(schema.gastos.fecha, p.desde), lte(schema.gastos.fecha, p.hasta))),
    db.select({ monto: schema.pagosComision.monto, tipo: schema.pagosComision.tipo }).from(schema.pagosComision)
      .where(and(eq(schema.pagosComision.barberiaId, bId), gte(schema.pagosComision.semana, lunesDe(p.desde)), lte(schema.pagosComision.semana, p.hasta))),
  ]);
  const pagadoEquipo = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const nombrePaquete = p.tipo === "mes" ? MESES[Number(p.desde.slice(5, 7)) - 1] : p.tipo === "anio" ? `${p.desde.slice(0, 4)}` : p.etiqueta.toLowerCase();
  const url = `/api/exportar?tipo=todo&desde=${p.desde}&hasta=${p.hasta}`;
  const hojas = [
    { tipo: "ventas", titulo: "Ventas", cuenta: `${r.servicios} ${r.servicios === 1 ? "renglón" : "renglones"}` },
    { tipo: "gastos", titulo: "Gastos", cuenta: `${gastos.n} ${gastos.n === 1 ? "renglón" : "renglones"}` },
    { tipo: "cortes", titulo: "Cortes de caja", cuenta: `${cortes.length} ${cortes.length === 1 ? "cierre" : "cierres"}` },
    { tipo: "pagos", titulo: "Pagos al equipo", cuenta: `${pagos.length} ${pagos.length === 1 ? "pago" : "pagos"}` },
  ];

  return (
    <>
      <SelectorPeriodo ruta="/cierres" p={p} hoy={hoy} conAnio />
      <div>
        <span className="lab">{p.etiqueta}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>Cierres y descargas</h1>
      </div>
      <section className="cierres subir">
        <div className="glass panel" style={{ gap: 0 }}>
          <div className="datos">
            <div><span>Ingresos por servicios<Ayuda titulo="Ingresos por servicios">Lo cobrado por servicios, ya con descuentos. Sin propinas ni ventas canceladas.</Ayuda></span><b>{formatoDinero(r.netas)}</b></div>
            {r.porMetodo.map(([m, v]) => (
              <div key={m} className="sub-dato"><span>{m}</span><span className="num">{formatoDinero(v)}</span></div>
            ))}
            <div><span>Pagos al equipo</span><b>{formatoDinero(pagadoEquipo)}</b></div>
            <div><span>Comisiones generadas</span><b>{formatoDinero(r.comisiones)}</b></div>
            <div><span>Gastos registrados</span><b>{formatoDinero(r.gastos)}</b></div>
            <div><span>Descuentos dados</span><b>{formatoDinero(r.descuentos)}</b></div>
            <div><span>Propinas<Ayuda titulo="Propinas">Son del equipo. No son ingreso del negocio.</Ayuda></span><b>{formatoDinero(r.propinas)}</b></div>
          </div>
        </div>
        <div className="glass panel paquete">
          <span className="lab">Paquete de {nombrePaquete}</span>
          <div className="pila-arch">
            {hojas.map((h, i) => (
              <a key={h.tipo} className={`hoja h${i + 1}`} href={`/api/exportar?tipo=${h.tipo}&desde=${p.desde}&hasta=${p.hasta}`} title={`Descargar solo ${h.titulo}`}>
                <span className="lab">Archivo</span>
                <b>{h.titulo}</b>
                <span className="fila" style={{ justifyContent: "space-between" }}><small className="muted">{h.cuenta}</small><Icono n="descargar" className="ic" /></span>
              </a>
            ))}
          </div>
          <Descargar url={url} nombre={`cierre_${p.desde}_${p.hasta}.xlsx`} />
          <p className="ayuda-txt" style={{ textAlign: "center" }}>Un solo archivo de Excel con una hoja por tema.<br />Pasa el cursor por las hojas para bajar solo una.</p>
        </div>
      </section>
    </>
  );
}
