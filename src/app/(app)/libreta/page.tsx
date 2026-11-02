import Link from "next/link";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { requerirSesion } from "@/lib/auth";
import { fechaLocal } from "@/lib/fechas";
import { libretaAnio, libretaBarberos, libretaMes, mesesConDatos } from "@/lib/libreta";
import { formatoDinero } from "@/lib/money";
import { NavLibreta } from "./NavLibreta";

export const metadata = { title: "Libreta" };

const $ = (c: number) => formatoDinero(c);
const vacio = (c: number) => (c ? $(c) : "-");

export default async function Libreta({ searchParams }: { searchParams: Promise<{ vista?: string; mes?: string; anio?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.exportar")) redirect("/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const vista = q.vista === "anio" || q.vista === "barberos" ? q.vista : "mes";
  const mes = /^20\d\d-(0[1-9]|1[0-2])$/.test(q.mes ?? "") && q.mes! <= hoy.slice(0, 7) ? q.mes! : hoy.slice(0, 7);
  const anio = /^20\d\d$/.test(q.anio ?? "") && q.anio! <= hoy.slice(0, 4) ? q.anio! : hoy.slice(0, 4);
  const descarga = vista === "mes" ? `/api/libreta?tipo=mes&mes=${mes}` : vista === "anio" ? "/api/libreta?tipo=anual" : "/api/libreta?tipo=barberos";

  return (
    <>
      <div>
        <h1 className="titulo">Control financiero</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: 620 }}>Ingresos y egresos del negocio. Se llenan solos con los cobros y gastos del sistema.</p>
      </div>
      <NavLibreta vista={vista} mes={mes} anio={anio} hoy={hoy} descarga={descarga} conDatos={await mesesConDatos(s.barberia.id, zona)} />
      {vista === "mes" ? <Mes barberiaId={s.barberia.id} mes={mes} hoy={hoy} zona={zona} puedeEgresos={s.puede("gastos.registrar")} />
        : vista === "anio" ? <Anio barberiaId={s.barberia.id} anio={anio} zona={zona} />
        : <Barberos barberiaId={s.barberia.id} anio={anio} zona={zona} />}
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function Mes({ barberiaId, mes, hoy, zona, puedeEgresos }: { barberiaId: string; mes: string; hoy: string; zona: string; puedeEgresos: boolean }) {
  const m = await libretaMes(barberiaId, mes, zona);
  const com = m.columnas.filter((c) => c.comision);
  const fij = m.columnas.filter((c) => !c.comision);
  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1];
  const utilidad = m.total - m.egresosTotal;
  const firma = (c: number) => (c < 0 ? `−${$(-c)}` : $(c));
  const cabeza = (primera: string) => (
    <tr><th>{primera}</th>{com.map((c) => <th key={c.clave}>{c.nombre}</th>)}<th className="sub">Subtotal</th>{fij.map((c) => <th key={c.clave}>{c.nombre}</th>)}<th className="tot">Total</th></tr>
  );
  const dia = (f: string) => Number(f.slice(8, 10));
  // Se abre la semana de hoy; en meses pasados, la última semana con ventas.
  const abierta = m.semanas.find((x) => x.dias.some((d) => d.fecha === hoy))?.numero
    ?? [...m.semanas].reverse().find((x) => x.total > 0)?.numero ?? m.semanas[0]?.numero;
  const maxSem = Math.max(1, ...m.semanas.map((x) => x.total));
  return (
    <>
      {m.historico && <p className="aviso">Este mes se llevó en Excel. Aquí solo están sus totales.</p>}
      <section className="glass hero-lib subir">
        <div className="hero-lib-izq">
          <span className="lab">Utilidad de {nombreMes}</span>
          <b className="big-mv num">{firma(utilidad)}</b>
          <div className="tres-fin">
            <div><span className="lab">Ingresos</span><b className="num">{$(m.total)}</b><small>{m.subtotal !== m.total ? `${$(m.subtotal)} de comisión` : "del mes"}</small></div>
            <div><span className="lab">Egresos</span><b className="num">{$(m.egresosTotal)}</b><small>{m.egresos.length} {m.egresos.length === 1 ? "concepto" : "conceptos"}</small></div>
            <div><span className="lab">Margen</span><b className="num">{m.total > 0 ? `${Math.round((utilidad / m.total) * 100)}%` : "Sin datos"}</b><small>de cada peso vendido</small></div>
          </div>
        </div>
        {!m.historico && m.semanas.length > 0 && (
          <div className="semanas-mini">
            <span className="lab">Por semana</span>
            <div className="barras-lib">
              {m.semanas.map((sem, i) => (
                <div key={sem.numero}>
                  <b className="num">{$(sem.total)}</b>
                  <i style={{ height: `${Math.max((sem.total / maxSem) * 100, 3)}%`, animationDelay: `${0.2 + i * 0.08}s` }} className={sem.total ? "" : "vacia"} />
                  <small>Sem {sem.numero}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="dos-lib subir d1">
        {!m.historico && (
          <div className="glass panel">
            <span className="lab">Día por día</span>
            <div className="plegables">
              {m.semanas.map((sem) => (
                <details key={sem.numero} open={sem.numero === abierta}>
                  <summary>
                    <b>Semana {sem.numero}, {dia(sem.dias[0].fecha)} al {dia(sem.dias[sem.dias.length - 1].fecha)} de {nombreMes}</b>
                    <span className="der-p"><span className="muted">{sem.dias.length} {sem.dias.length === 1 ? "día" : "días"}</span><b className="num">{$(sem.total)}</b></span>
                  </summary>
                  <div className="desliza tabla-l"><table>
                    <thead>{cabeza("Fecha")}</thead>
                    <tbody>
                      {sem.dias.map((d) => (
                        <tr key={d.fecha} className={d.fecha === hoy ? "hoy-l" : ""}><td className="f">{d.etiqueta}</td>{com.map((c) => <td key={c.clave}>{vacio(d.valores[c.clave] ?? 0)}</td>)}<td className="sub">{vacio(d.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{vacio(d.valores[c.clave] ?? 0)}</td>)}<td className="tot">{vacio(d.total)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td className="f">Total</td>{com.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="sub">{$(sem.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="tot">{$(sem.total)}</td></tr></tfoot>
                  </table></div>
                </details>
              ))}
            </div>
          </div>
        )}
        <div className="col-lib">
          <div className="glass panel">
            <span className="lab">Resultado del mes</span>
            <div className="datos">
              <div><span>Ingresos</span><b className="num">{$(m.total)}</b></div>
              <div><span>Egresos</span><b className="num">{m.egresosTotal ? `−${$(m.egresosTotal)}` : $(0)}</b></div>
              <div className="fuerte-l"><span>Utilidad</span><b className="num">{firma(utilidad)}</b></div>
              {m.subtotal !== m.total && <div><span>Utilidad solo de comisión<Ayuda titulo="Solo de comisión">Cuenta solo lo que cobraron quienes ganan por comisión.</Ayuda></span><b className="num">{firma(m.subtotal - m.egresosTotal)}</b></div>}
            </div>
            {!m.historico && m.comisionesGeneradas > 0 && <p className="ayuda-txt">Comisiones generadas en el mes: {$(m.comisionesGeneradas)}. Cuentan como egreso cuando se pagan al equipo.</p>}
          </div>
          <div className="glass panel">
            <div className="entre"><span className="lab">Egresos</span>{puedeEgresos && <Link className="enlace" href={`/analitica/gastos?periodo=mes&mes=${m.mes}`}>Registrar o ver detalle</Link>}</div>
            <div className="datos">
              {m.egresos.length ? m.egresos.map((e) => <div key={e.concepto}><span>{e.concepto}</span><b className="num">{$(e.monto)}</b></div>) : <div><span className="muted">Sin egresos registrados</span><b>-</b></div>}
              <div className="fuerte-l"><span>Total</span><b className="num">{$(m.egresosTotal)}</b></div>
            </div>
          </div>
        </div>
      </section>

      {!m.historico && (
        <section className="glass tabla-l subir d2">
          <span className="lab">Resumen por semana</span>
          <div className="desliza"><table>
            <thead>{cabeza("Semana")}</thead>
            <tbody>{m.semanas.map((sem) => <tr key={sem.numero}><td className="f">Semana {sem.numero} <small className="muted">{dia(sem.dias[0].fecha)} al {dia(sem.dias[sem.dias.length - 1].fecha)}</small></td>{com.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="sub">{$(sem.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="tot">{$(sem.total)}</td></tr>)}</tbody>
            <tfoot><tr><td className="f">Total</td>{com.map((c) => <td key={c.clave}>{$(m.semanas.reduce((a, x) => a + (x.valores[c.clave] ?? 0), 0))}</td>)}<td className="sub">{$(m.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(m.semanas.reduce((a, x) => a + (x.valores[c.clave] ?? 0), 0))}</td>)}<td className="tot">{$(m.total)}</td></tr></tfoot>
          </table></div>
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
