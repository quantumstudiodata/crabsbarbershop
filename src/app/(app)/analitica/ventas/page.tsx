import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { equipoQueAtiende, ventasEntre } from "@/lib/datos";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { CancelarVenta } from "./CancelarVenta";
import { FiltroPersona } from "./FiltroPersona";

export const metadata = { title: "Ventas" };

type Q = { periodo?: string; desde?: string; hasta?: string; persona?: string; aviso?: string; error?: string };

export default async function Ventas({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  if (!s.puede("ventas.ver_todas")) redirect("/mis-ventas");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "dia");
  const equipo = await equipoQueAtiende(s.barberia.id);
  const persona = equipo.some((e) => e.id === q.persona) ? q.persona! : "";
  const { ventas } = await ventasEntre(s.barberia.id, p.desde, p.hasta, { zona, barberoId: persona || undefined });
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const total = pagadas.reduce((a, v) => a + v.conceptos.filter((c) => !persona || c.barberoId === persona).reduce((b, c) => b + c.precioCobrado, 0), 0);
  const dias = [...new Set(ventas.map((v) => v.fecha))];
  const extra = persona ? `&persona=${persona}` : "";
  const qs = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "aviso" && k !== "error") as [string, string][]).toString();
  const regreso = `/analitica/ventas${qs ? `?${qs}` : ""}`;

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="entre">
        <SelectorPeriodo ruta="/analitica/ventas" p={p} hoy={hoy} conDia extra={extra} />
        <FiltroPersona personas={equipo} actual={persona} />
      </div>
      <div className="subir">
        <span className="lab">{p.etiqueta}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>{pagadas.length} {pagadas.length === 1 ? "venta" : "ventas"}, {formatoDinero(total)}</h1>
        <p className="sub">Cada venta aparece en el día y la hora en que se cobró.<br />Las canceladas no se borran: quedan tachadas con su motivo.</p>
      </div>

      {ventas.length === 0 ? <p className="muted">No hay ventas en estas fechas.</p> : dias.map((d) => {
        const delDia = ventas.filter((v) => v.fecha === d);
        const totalDia = delDia.filter((v) => v.estado === "pagada").reduce((a, v) => a + v.total, 0);
        return (
          <section key={d} className="glass panel tabla-wrap subir">
            <div className="entre"><span className="lab">{fechaLarga(d)}</span><b className="num">{formatoDinero(totalDia)}</b></div>
            <table className="tabla">
              <thead><tr><th>Hora</th><th>Folio</th><th>Servicios</th><th>Pago</th><th className="der">Total</th><th></th></tr></thead>
              <tbody>
                {delDia.map((v) => {
                  const cancelada = v.estado === "cancelada";
                  const c = cancelada ? "tachado" : "";
                  return (
                    <tr key={v.id}>
                      <td className={c}>{horaCorta(v.creadoEn, zona)}</td>
                      <td><span className={c} style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>{v.folio}</span></td>
                      <td className={c}>
                        {v.conceptos.map((x, i) => <div key={i}>{x.nombre} <small className="muted">con {x.barbero.split(" ")[0]}{x.descuento ? `, descuento ${formatoDinero(x.descuento)}` : ""}</small></div>)}
                        {v.propinas.map((x, i) => <small key={i} className="muted" style={{ display: "block" }}>Propina {formatoDinero(x.monto)}</small>)}
                      </td>
                      <td className={c}>{v.pagos.map((x) => x.metodo).join(" y ")}</td>
                      <td className={`der num ${c}`}>{formatoDinero(v.total)}</td>
                      <td className="der">
                        {cancelada ? <span className="est off" title={v.motivoCancelacion ?? ""}><span className="d" />Cancelada: {v.motivoCancelacion}</span>
                          : s.puede("ventas.cancelar") ? <CancelarVenta id={v.id} folio={v.folio} total={formatoDinero(v.total)} regreso={regreso} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
