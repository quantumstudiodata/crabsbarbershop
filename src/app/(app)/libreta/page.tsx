import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotonCajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaLocal, finDeMes } from "@/lib/fechas";
import { libretaAnio, libretaBarberos, libretaMes, mesesConDatos } from "@/lib/libreta";
import { formatoDinero } from "@/lib/money";
import { NavLibreta } from "./NavLibreta";
import { DeslizaSemana } from "./HojaSemana";
import { liquidarAutomaticos } from "@/lib/pagosAuto";
import { asentarCitasPagadas } from "@/lib/pagos";

export const metadata = { title: "Datos" };

const $ = (c: number) => formatoDinero(c);
/** Montos de la hoja sin signo, como se anotan en la libreta. */
const n = (c: number) => formatoDinero(c).replace("$", "");

export default async function Libreta({ searchParams }: { searchParams: Promise<{ vista?: string; mes?: string; anio?: string; semana?: string }> }) {
  const s = await requerirSesion();
  await liquidarAutomaticos(s.barberia.id);
  await asentarCitasPagadas(s.barberia.id);
  if (!s.puede("reportes.exportar")) redirect("/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const vista = q.vista === "anio" || q.vista === "barberos" ? q.vista : "mes";
  const mes = /^20\d\d-(0[1-9]|1[0-2])$/.test(q.mes ?? "") && q.mes! <= hoy.slice(0, 7) ? q.mes! : hoy.slice(0, 7);
  const anio = /^20\d\d$/.test(q.anio ?? "") && q.anio! <= hoy.slice(0, 4) ? q.anio! : hoy.slice(0, 4);
  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1];
  const ini = `${mes}-01`, fin = finDeMes(ini);
  const descargas = (
    <div className="descargas-l">
      <span className="lab">Reportes</span>
      <a href={`/api/libreta?tipo=mes&mes=${mes}`}><Icono n="descargar" /><span><b>{nombreMes[0].toUpperCase() + nombreMes.slice(1)}, semana por semana</b><small>Lo de cada barbero por día, con egresos y utilidad</small></span></a>
      <a href="/api/libreta?tipo=anual"><Icono n="descargar" /><span><b>Resumen del año</b><small>Ingresos, egresos y utilidad de cada mes</small></span></a>
      <a href="/api/libreta?tipo=barberos"><Icono n="descargar" /><span><b>Ventas por barbero</b><small>Lo de cada barbero mes por mes</small></span></a>
      <span className="lab" style={{ marginTop: 16 }}>Respaldo completo de {nombreMes}</span>
      <a href={`/api/exportar?tipo=todo&desde=${ini}&hasta=${fin}`}><Icono n="descargar" /><span><b>Todo en un archivo</b><small>Ventas, egresos, cortes, equipo y pagos, una hoja por tema</small></span></a>
      <div className="hojas-l">
        {[["ventas", "Ventas"], ["gastos", "Egresos"], ["cortes", "Cortes"], ["pagos", "Pagos al equipo"]].map(([k, t]) => <a key={k} className="hoja-b" href={`/api/exportar?tipo=${k}&desde=${ini}&hasta=${fin}`}>{t}</a>)}
      </div>
    </div>
  );

  return (
    <>
      <NavLibreta vista={vista} mes={mes} anio={anio} hoy={hoy} conDatos={await mesesConDatos(s.barberia.id, zona)}
        descargas={<BotonCajon className="chipf" texto={<><Icono n="descargar" />Descargas</>} titulo="Descargas">{descargas}</BotonCajon>} />
      {vista === "mes" ? <Mes barberiaId={s.barberia.id} mes={mes} hoy={hoy} zona={zona} semana={Number(q.semana) || undefined} />
        : vista === "anio" ? <Anio barberiaId={s.barberia.id} anio={anio} zona={zona} />
        : <Barberos barberiaId={s.barberia.id} anio={anio} zona={zona} />}
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function Mes({ barberiaId, mes, hoy, zona, semana }: { barberiaId: string; mes: string; hoy: string; zona: string; semana?: number }) {
  const ini = `${mes}-01`, fin = finDeMes(ini);
  const [m, rentas] = await Promise.all([
    libretaMes(barberiaId, mes, zona),
    db.select({ id: schema.pagosComision.barberoId, monto: sql<number>`sum(${schema.pagosComision.monto})::int` }).from(schema.pagosComision)
      .where(and(eq(schema.pagosComision.barberiaId, barberiaId), eq(schema.pagosComision.tipo, "renta"),
        sql`(${schema.pagosComision.creadoEn} at time zone ${zona})::date between ${ini}::date and ${fin}::date`))
      .groupBy(schema.pagosComision.barberoId),
  ]);
  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1];
  const utilidad = m.total - m.egresosTotal;
  const firma = (c: number) => (c < 0 ? `−${$(-c)}` : $(c));
  const dia = (f: string) => Number(f.slice(8, 10));
  const rango = (sem: { dias: { fecha: string }[] }) => { const a = dia(sem.dias[0].fecha), b = dia(sem.dias[sem.dias.length - 1].fecha); return `${a === b ? a : `${a} al ${b}`} ${nombreMes.slice(0, 3)}`; };
  // Lo que aún no pasa se deja en blanco; "Sin datos" es solo para días que ya pasaron sin cobros.
  const futuro = (f: string) => f > hoy;
  const maxSem = Math.max(1, ...m.semanas.map((x) => x.total));
  const conRenta = rentas.some((r) => r.monto > 0);
  const renta = (id: string) => rentas.find((r) => r.id === id)?.monto ?? 0;
  const celda = (v: number, f: string) => (v ? $(v) : futuro(f) ? "" : <span className="chip-p">Sin datos</span>);
  const elegida = m.semanas.find((x) => x.numero === semana);
  // La hoja abre en la semana pedida, si no en la de hoy, si no en la última con ventas.
  const enHoja = elegida ?? m.semanas.find((x) => x.dias.some((d) => d.fecha === hoy)) ?? [...m.semanas].reverse().find((x) => x.total > 0) ?? m.semanas[0];
  const iHoja = enHoja ? m.semanas.indexOf(enHoja) : -1;
  const url = (n?: number) => `/libreta?vista=mes&mes=${mes}${n ? `&semana=${n}` : ""}`;
  const egresos = (
    <div className="cuenta-c">
      {m.egresos.length ? m.egresos.map((e) => <div key={e.concepto} className="paso-c"><span>{e.concepto}</span><span className="num">{$(e.monto)}</span></div>) : <p className="muted">Sin egresos registrados.</p>}
      <div className="paso-c total"><span><b>Total</b></span><b className="num">{$(m.egresosTotal)}</b></div>
      {!m.historico && m.comisionesGeneradas > 0 && <p className="ayuda-txt">Comisiones generadas en el mes: {$(m.comisionesGeneradas)}. Cuentan como egreso cuando se pagan al equipo.</p>}
    </div>
  );
  return (
    <>
      {m.historico && <p className="aviso-sutil">Este mes se llevó en Excel. Aquí solo están sus totales.</p>}
      <section className="glass hero-lib subir">
        <div className="hero-lib-izq">
          <span className="lab">Utilidad de {nombreMes}</span>
          <b className="big-mv num">{firma(utilidad)}</b>
          <span className="formula-l">Ingresos <b className="num">{$(m.total)}</b> − Egresos <BotonCajon texto={<b className="num">{$(m.egresosTotal)}</b>} titulo={`Egresos de ${nombreMes}`}>{egresos}</BotonCajon></span>
        </div>
        {!m.historico && m.semanas.length > 0 && (
          <div className="barras-lib">
            {m.semanas.map((sem, i) => (
              <Link key={sem.numero} href={url(sem.numero === semana ? undefined : sem.numero)} scroll={false} className={sem.numero === semana ? "activa" : ""}>
                <b className="num">{futuro(sem.dias[0].fecha) ? "" : $(sem.total)}</b>
                <i style={{ height: `${Math.max((sem.total / maxSem) * 100, 3)}%`, animationDelay: `${0.2 + i * 0.08}s` }} className={sem.total ? "" : "vacia"} />
                <small>Sem {sem.numero}</small>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!m.historico && (
        <section className="glass tabla-l pivote-l subir d1 solo-escritorio">
          <div className="entre"><span className="lab">Por barbero y semana</span><span className="muted chico-t">Toca una semana para abrir su hoja</span></div>
          <div className="desliza"><table>
            <thead><tr><th>Barbero</th>
              {m.semanas.map((sem) => <th key={sem.numero} className={sem.numero === enHoja?.numero ? "activa" : ""}><Link href={url(sem.numero)} scroll={false}>Semana {sem.numero}<small>{rango(sem)}</small></Link></th>)}
              {conRenta && <th>Renta silla</th>}<th className="tot">Total</th></tr></thead>
            <tbody>{m.columnas.map((c) => (
              <tr key={c.clave}><td className="f">{c.nombre}{!c.comision && <small className="muted"> sueldo</small>}</td>
                {m.semanas.map((sem) => <td key={sem.numero} className={sem.numero === enHoja?.numero ? "activa" : ""}>{celda(sem.valores[c.clave] ?? 0, sem.dias[0].fecha)}</td>)}
                {conRenta && <td>{renta(c.clave) ? $(renta(c.clave)) : ""}</td>}
                <td className="tot">{$(m.semanas.reduce((a, x) => a + (x.valores[c.clave] ?? 0), 0))}</td></tr>
            ))}</tbody>
            <tfoot>
              {m.subtotal !== m.total && <tr><td className="f">Subtotal comisión</td>{m.semanas.map((sem) => <td key={sem.numero}>{futuro(sem.dias[0].fecha) ? "" : $(sem.subtotal)}</td>)}{conRenta && <td />}<td className="tot">{$(m.subtotal)}</td></tr>}
              <tr><td className="f">Total</td>{m.semanas.map((sem) => <td key={sem.numero}>{futuro(sem.dias[0].fecha) ? "" : $(sem.total)}</td>)}{conRenta && <td>{$(rentas.reduce((a, r) => a + r.monto, 0))}</td>}<td className="tot">{$(m.total)}</td></tr>
            </tfoot>
          </table></div>
        </section>
      )}

      {!m.historico && enHoja && (
        <section className="glass lb subir d1" id="hoja" aria-label={`Libreta de la semana ${enHoja.numero}`}>
          <div className="lb-cab">
            <span className="tx"><small>Libreta de la semana</small><b>Semana {enHoja.numero}, {enHoja.dias.length > 1 ? "del " : ""}{rango(enHoja)}</b></span>
            <span className="lb-nav">
              {iHoja > 0 ? <Link href={url(m.semanas[iHoja - 1].numero)} scroll={false} aria-label="Semana anterior"><Icono n="izquierda" /></Link> : <span aria-hidden="true"><Icono n="izquierda" /></span>}
              {iHoja < m.semanas.length - 1 ? <Link href={url(m.semanas[iHoja + 1].numero)} scroll={false} aria-label="Semana siguiente"><Icono n="derecha" /></Link> : <span aria-hidden="true"><Icono n="derecha" /></span>}
            </span>
          </div>
          <DeslizaSemana anterior={iHoja > 0 ? url(m.semanas[iHoja - 1].numero) : undefined} siguiente={iHoja < m.semanas.length - 1 ? url(m.semanas[iHoja + 1].numero) : undefined}>
            <div className="lb-hoja"><div className="lb-desliza"><table className="lb-t">
              <thead><tr><th>Día</th>{m.columnas.map((c) => <th key={c.clave}>{c.nombre}{!c.comision && <small>sueldo</small>}</th>)}<th className="tt">Total</th></tr></thead>
              <tbody>{enHoja.dias.map((d) => (
                <tr key={d.fecha} className={d.fecha === hoy ? "hoy" : ""}>
                  <td>{d.etiqueta.slice(0, 3)}<small>{dia(d.fecha)} {nombreMes.slice(0, 3)}</small></td>
                  {m.columnas.map((c) => { const v = d.valores[c.clave] ?? 0; return futuro(d.fecha) ? <td key={c.clave} className="fu" /> : <td key={c.clave} className={v ? "" : "v"}>{v ? n(v) : "0"}</td>; })}
                  <td className="tt">{futuro(d.fecha) ? "" : n(d.total)}</td>
                </tr>
              ))}</tbody>
              <tfoot>
                {enHoja.subtotal !== enHoja.total && <tr className="sub"><td>Subtotal comisión</td>{m.columnas.map((c) => <td key={c.clave}>{c.comision ? n(enHoja.valores[c.clave] ?? 0) : ""}</td>)}<td className="tt">{n(enHoja.subtotal)}</td></tr>}
                <tr><td>Total</td>{m.columnas.map((c) => <td key={c.clave}>{n(enHoja.valores[c.clave] ?? 0)}</td>)}<td className="tt">{$(enHoja.total)}</td></tr>
              </tfoot>
            </table></div></div>
          </DeslizaSemana>
          <div className="lb-pie"><span className="solo-movil">Desliza para cambiar de semana</span><span className="solo-escritorio">Usa las flechas para cambiar de semana</span>
            <span className="lb-dots">{m.semanas.map((x) => <Link key={x.numero} href={url(x.numero)} scroll={false} aria-label={`Semana ${x.numero}`} className={x.numero === enHoja.numero ? "on" : ""} />)}</span></div>
        </section>
      )}
    </>
  );
}

async function Anio({ barberiaId, anio, zona }: { barberiaId: string; anio: string; zona: string }) {
  const filas = await libretaAnio(barberiaId, anio, zona);
  const con = filas.filter((f) => f.origen !== "vacio");
  const t = (k: "subtotal" | "egresos" | "total") => con.reduce((a, f) => a + f[k], 0);
  const max = Math.max(1, ...con.map((f) => Math.abs(f.total - f.egresos)));
  return (
    <div className="glass tabla-l subir">
      <span className="lab">Año {anio}</span>
      <div className="desliza"><table>
        <thead><tr><th>{anio}</th><th>Subtotal</th><th>Egresos</th><th>Utilidad</th><th>Total</th><th>Utilidad neta</th></tr></thead>
        <tbody>
          {filas.map((f, i) => f.origen === "vacio" ? (
            <tr key={f.mes} className="vacia"><td className="f">{f.nombre}</td><td colSpan={5} /></tr>
          ) : (
            <tr key={f.mes}>
              <td className="f">{f.nombre}{f.origen === "historico" && <small className="tag-x">Excel</small>}</td>
              <td>{$(f.subtotal)}</td><td>{$(f.egresos)}</td><td className={f.subtotal - f.egresos < 0 ? "neg" : ""}>{$(f.subtotal - f.egresos)}</td>
              <td>{$(f.total)}</td>
              <td className="tot"><span className="barra-n"><i style={{ width: `${(Math.max(0, f.total - f.egresos) / max) * 100}%`, animationDelay: `${0.2 + i * 0.05}s` }} /></span>{$(f.total - f.egresos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td className="f">Total</td><td>{$(t("subtotal"))}</td><td>{$(t("egresos"))}</td><td>{$(t("subtotal") - t("egresos"))}</td><td>{$(t("total"))}</td><td className="tot">{$(t("total") - t("egresos"))}</td></tr></tfoot>
      </table></div>
    </div>
  );
}

async function Barberos({ barberiaId, anio, zona }: { barberiaId: string; anio: string; zona: string }) {
  const { columnas, meses } = await libretaBarberos(barberiaId, anio, zona);
  const tot = (k: string) => meses.reduce((a, m) => a + (m.valores[k] ?? 0), 0);
  if (!columnas.length) return <p className="muted">No hay cobros en {anio}.</p>;
  return (
    <div className="glass tabla-l subir">
      <span className="lab">Lo de cada barbero en {anio}</span>
      <div className="desliza"><table>
        <thead><tr><th>Mes/año</th>{columnas.map((c) => <th key={c.clave}>{c.clave.startsWith("hist:") ? `Barbero ${c.nombre}` : c.nombre}</th>)}<th className="tot">ST</th></tr></thead>
        <tbody>{meses.map((m) => <tr key={m.mes} className={m.total ? "" : "vacia"}><td className="f">{m.nombre}</td>{columnas.map((c) => <td key={c.clave}>{m.valores[c.clave] !== undefined ? $(m.valores[c.clave]) : ""}</td>)}<td className="tot">{m.total ? $(m.total) : ""}</td></tr>)}</tbody>
        <tfoot><tr><td className="f">Total</td>{columnas.map((c) => <td key={c.clave}>{$(tot(c.clave))}</td>)}<td className="tot">{$(meses.reduce((a, m) => a + m.total, 0))}</td></tr></tfoot>
      </table></div>
      {columnas.some((c) => c.clave.startsWith("hist:")) && <p className="ayuda-txt">Barbero A y Barbero B son las columnas del Excel de la contadora.</p>}
    </div>
  );
}
