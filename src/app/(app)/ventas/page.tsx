import Link from "next/link";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { ventasEntre } from "@/lib/datos";
import { esFechaValida, fechaLarga, fechaLocal, horaCorta, sumarDias } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { cancelarVenta } from "./actions";

export const metadata = { title: "Ventas" };

export default async function Ventas({ searchParams }: { searchParams: Promise<{ dia?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const dia = esFechaValida(q.dia) && q.dia <= hoy ? q.dia : hoy;
  const todas = s.puede("ventas.ver_todas");
  const { ventas } = await ventasEntre(s.barberia.id, dia, dia, todas ? {} : { barberoId: s.usuario.id });
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const total = todas
    ? pagadas.reduce((a, v) => a + v.total, 0)
    : pagadas.reduce((a, v) => a + v.conceptos.filter((c) => c.barberoId === s.usuario.id).reduce((b, c) => b + c.precioCobrado, 0), 0);
  const a = q.aviso ? AVISOS[q.aviso] : undefined;

  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado
        etiqueta={fechaLarga(dia)}
        titulo={todas ? `${pagadas.length} ${pagadas.length === 1 ? "venta" : "ventas"}, ${formatoDinero(total)}` : `Tus servicios: ${formatoDinero(total)}`}
        sub={ventas.length - pagadas.length > 0 ? `${ventas.length - pagadas.length} canceladas, siguen visibles abajo.` : "Las canceladas nunca se borran: quedan tachadas con su motivo."}
      >
        <Link className="btn" href={`/ventas?dia=${sumarDias(dia, -1)}`}>Día anterior</Link>
        {dia < hoy && <Link className="btn" href={`/ventas?dia=${sumarDias(dia, 1)}`}>Día siguiente</Link>}
        {dia < hoy && <Link className="btn" href="/ventas">Hoy</Link>}
      </Encabezado>

      {ventas.length === 0 ? (
        <p className="muted">No hay ventas este día.</p>
      ) : (
        <div className="glass panel tabla-wrap">
          <table className="tabla">
            <thead><tr><th>Hora</th><th>Folio</th><th>Servicios</th><th>Pago</th><th className="der">Total</th><th></th></tr></thead>
            <tbody>
              {ventas.map((v) => {
                const cancelada = v.estado === "cancelada";
                return (
                  <tr key={v.id}>
                    <td className={cancelada ? "tachado" : ""}>{horaCorta(v.creadoEn, zona)}</td>
                    <td><span className={cancelada ? "tachado" : ""} style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{v.folio}</span></td>
                    <td className={cancelada ? "tachado" : ""}>
                      {v.conceptos.map((c, i) => <div key={i}>{c.nombre} <small className="muted">con {c.barbero.split(" ")[0]}{c.descuento ? `, descuento ${formatoDinero(c.descuento)}` : ""}</small></div>)}
                      {v.propinas.map((p, i) => <small key={i} className="muted" style={{ display: "block" }}>Propina {formatoDinero(p.monto)}</small>)}
                    </td>
                    <td className={cancelada ? "tachado" : ""}>{v.pagos.map((p) => p.metodo).join(" y ")}</td>
                    <td className={`der num ${cancelada ? "tachado" : ""}`}>{formatoDinero(v.total)}</td>
                    <td>
                      {cancelada ? (
                        <span className="chip warn" title={v.motivoCancelacion ?? ""}>Cancelada: {v.motivoCancelacion}</span>
                      ) : s.puede("ventas.cancelar") ? (
                        <details>
                          <summary className="enlace">Cancelar</summary>
                          <form action={cancelarVenta} className="pila-chica" style={{ marginTop: 8, minWidth: 220 }}>
                            <input type="hidden" name="ventaId" value={v.id} />
                            <input type="hidden" name="regreso" value={`/ventas?dia=${dia}`} />
                            <input className="input" name="motivo" placeholder="Motivo, por ejemplo: se cobró dos veces" required />
                            <button className="btn chico peligro">Confirmar cancelación</button>
                          </form>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
