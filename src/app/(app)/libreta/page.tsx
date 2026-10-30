import Link from "next/link";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { requerirSesion } from "@/lib/auth";
import { fechaLocal } from "@/lib/fechas";
import { libretaAnio, libretaBarberos, libretaMes } from "@/lib/libreta";
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
        <span className="lab">Contabilidad</span>
        <h1 className="titulo" style={{ marginTop: 6 }}>Libreta</h1>
        <p className="muted" style={{ marginTop: 4 }}>Lo mismo que el Excel de siempre, pero se llena solo con los cobros y egresos.</p>
      </div>
      <NavLibreta vista={vista} mes={mes} anio={anio} hoy={hoy} descarga={descarga} />
      {vista === "mes" ? <Mes barberiaId={s.barberia.id} mes={mes} zona={zona} puedeEgresos={s.puede("gastos.registrar")} />
        : vista === "anio" ? <Anio barberiaId={s.barberia.id} anio={anio} zona={zona} />
        : <Barberos barberiaId={s.barberia.id} anio={anio} zona={zona} />}
    </>
  );
}

async function Mes({ barberiaId, mes, zona, puedeEgresos }: { barberiaId: string; mes: string; zona: string; puedeEgresos: boolean }) {
  const m = await libretaMes(barberiaId, mes, zona);
  const com = m.columnas.filter((c) => c.comision);
  const fij = m.columnas.filter((c) => !c.comision);
  const cabeza = (primera: string) => (
    <tr><th>{primera}</th>{com.map((c) => <th key={c.clave}>{c.nombre}</th>)}<th className="sub">Subtotal</th>{fij.map((c) => <th key={c.clave}>{c.nombre}</th>)}<th className="tot">Total</th></tr>
  );
  return (
    <>
      {m.historico && <p className="aviso">Este mes se llevó en Excel. Aquí solo están sus totales.</p>}
      {!m.historico && (
        <section className="semanas-l subir">
          {m.semanas.map((sem) => (
            <div key={sem.numero} className="glass tabla-l">
              <span className="lab">Semana {sem.numero}</span>
              <div className="desliza"><table>
                <thead>{cabeza("Fecha")}</thead>
                <tbody>
                  {sem.dias.map((d) => (
                    <tr key={d.fecha}><td className="f">{d.etiqueta}</td>{com.map((c) => <td key={c.clave}>{vacio(d.valores[c.clave] ?? 0)}</td>)}<td className="sub">{vacio(d.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{vacio(d.valores[c.clave] ?? 0)}</td>)}<td className="tot">{vacio(d.total)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="f">Total</td>{com.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="sub">{$(sem.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="tot">{$(sem.total)}</td></tr></tfoot>
              </table></div>
            </div>
          ))}
        </section>
      )}
      <section className="cierre-l subir d1">
        {!m.historico && (
          <div className="glass tabla-l">
            <span className="lab">Resumen por semana</span>
            <div className="desliza"><table>
              <thead>{cabeza("Semana")}</thead>
              <tbody>{m.semanas.map((sem) => <tr key={sem.numero}><td className="f">{sem.numero}</td>{com.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="sub">{$(sem.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(sem.valores[c.clave] ?? 0)}</td>)}<td className="tot">{$(sem.total)}</td></tr>)}</tbody>
              <tfoot><tr><td className="f">Total</td>{com.map((c) => <td key={c.clave}>{$(m.semanas.reduce((a, x) => a + (x.valores[c.clave] ?? 0), 0))}</td>)}<td className="sub">{$(m.subtotal)}</td>{fij.map((c) => <td key={c.clave}>{$(m.semanas.reduce((a, x) => a + (x.valores[c.clave] ?? 0), 0))}</td>)}<td className="tot">{$(m.total)}</td></tr></tfoot>
            </table></div>
          </div>
        )}
        <div className="glass tabla-l">
          <div className="entre"><span className="lab">Egresos</span>{puedeEgresos && <Link className="enlace" href={`/analitica/gastos?periodo=mes&mes=${m.mes}`}>Registrar o ver detalle</Link>}</div>
          <table>
            <tbody>{m.egresos.length ? m.egresos.map((e) => <tr key={e.concepto}><td className="f">{e.concepto}</td><td>{$(e.monto)}</td></tr>) : <tr><td className="f muted">Sin egresos registrados</td><td>-</td></tr>}</tbody>
            <tfoot><tr><td className="f">Total</td><td>{$(m.egresosTotal)}</td></tr></tfoot>
          </table>
        </div>
        <div className="glass tabla-l resultado-l">
          <span className="lab">Resultado del mes</span>
          <table>
            <thead><tr><th /><th className="sub">Subtotal<Ayuda titulo="Subtotal">Solo lo que cobraron quienes ganan por comisión.</Ayuda></th><th className="tot">Total<Ayuda titulo="Total">Todo lo cobrado, incluido quien tiene pago fijo.</Ayuda></th></tr></thead>
            <tbody>
              <tr><td className="f">Ingresos</td><td className="sub">{$(m.subtotal)}</td><td className="tot">{$(m.total)}</td></tr>
              <tr><td className="f">Egresos</td><td className="sub">{$(m.egresosTotal)}</td><td className="tot">{$(m.egresosTotal)}</td></tr>
            </tbody>
            <tfoot><tr><td className="f">Utilidad</td><td className={`sub ${m.subtotal - m.egresosTotal < 0 ? "neg" : ""}`}>{$(m.subtotal - m.egresosTotal)}</td><td className={`tot ${m.total - m.egresosTotal < 0 ? "neg" : ""}`}>{$(m.total - m.egresosTotal)}</td></tr></tfoot>
          </table>
          {!m.historico && m.comisionesGeneradas > 0 && <p className="ayuda-txt">Comisiones generadas en el mes: {$(m.comisionesGeneradas)}. Se cuentan como egreso cuando se registran como pago al equipo.</p>}
        </div>
      </section>
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
