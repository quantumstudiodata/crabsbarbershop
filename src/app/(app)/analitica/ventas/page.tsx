import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { and, eq, gte, lte } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { describirRegla, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, reglasDe, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, lunesDe } from "@/lib/fechas";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { CancelarVenta } from "./CancelarVenta";
import { Pagar } from "./Pagar";
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
  const elegida = equipo.find((e) => e.id === persona);
  const cuenta = elegida ? await cuentaDe(s.barberia.id, elegida.id, p.desde, p.hasta > hoy ? hoy : p.hasta, pagadas) : null;
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

      {elegida && cuenta && (
        <section className="glass panel subir">
          <div className="entre">
            <span className="persona"><Avatar avatar={elegida.avatar} nombre={elegida.nombre} t={44} /><span><b>{elegida.nombre}</b><small className="muted" style={{ display: "block" }}>{cuenta.forma}</small></span></span>
            {s.puede("equipo.pagar") && <Pagar id={elegida.id} nombre={elegida.nombre} semana={lunesDe(p.hasta > hoy ? hoy : p.hasta)} renta={cuenta.renta > 0} pendiente={formatoDinero(cuenta.renta > 0 ? cuenta.rentaPendiente : cuenta.saldo)} regreso={regreso} />}
          </div>
          <div className="cifras">
            <div><span className="lab">Ventas generadas</span><b>{formatoDinero(cuenta.vendido)}</b></div>
            {cuenta.renta > 0 ? (
              <>
                <div><span className="lab">Renta de silla</span><b>{formatoDinero(cuenta.renta)}</b></div>
                <div><span className="lab">Renta pagada</span><b>{formatoDinero(cuenta.rentaPagada)}</b></div>
                <div><span className="lab">Estado</span>{cuenta.rentaPendiente > 0 ? <b style={{ color: "var(--warn)" }}>Faltan {formatoDinero(cuenta.rentaPendiente)}</b> : <span className="cubierto"><i>✓</i>Renta cubierta</span>}</div>
              </>
            ) : (
              <>
                <div><span className="lab">Le corresponde<Ayuda titulo="Le corresponde">Su comisión en estas fechas, más su sueldo si tiene uno.</Ayuda></span><b>{formatoDinero(cuenta.corresponde)}</b></div>
                <div><span className="lab">Pagado</span><b>{formatoDinero(cuenta.pagado)}</b></div>
                <div><span className="lab">Por pagar</span>{cuenta.saldo > 0 ? <b>{formatoDinero(cuenta.saldo)}</b> : <span className="cubierto"><i>✓</i>Al corriente</span>}</div>
              </>
            )}
          </div>
        </section>
      )}

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

/** Cuenta de una persona en el periodo: lo que le corresponde, lo pagado y su renta. */
async function cuentaDe(barberiaId: string, id: string, desde: string, hasta: string, pagadas: Awaited<ReturnType<typeof ventasEntre>>["ventas"]) {
  const [reglas, pagos] = await Promise.all([
    reglasDe(barberiaId),
    db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, barberiaId), eq(schema.pagosComision.barberoId, id), gte(schema.pagosComision.semana, lunesDe(desde)), lte(schema.pagosComision.semana, hasta))),
  ]);
  const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === id));
  const regla = copiaRegla(elegirRegla(reglas, id, null, new Date()));
  const semanas = Math.max(1, Math.ceil((diasEntre(lunesDe(desde), hasta) + 1) / 7));
  const sueldo = regla && (regla.tipo === "sueldo" || regla.tipo === "mixto") ? regla.montoSemanal * semanas : 0;
  const renta = regla?.tipo === "renta" ? regla.montoSemanal * semanas : 0;
  const comision = regla?.tipo === "renta" ? 0 : cs.reduce((a, c) => a + c.comision, 0);
  const pagado = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentaPagada = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  return {
    forma: describirRegla(regla, formatoDinero), vendido: cs.reduce((a, c) => a + c.precioCobrado, 0),
    corresponde: comision + sueldo, pagado, saldo: Math.max(comision + sueldo - pagado, 0),
    renta, rentaPagada, rentaPendiente: Math.max(renta - rentaPagada, 0),
  };
}
