import Link from "next/link";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { ajustesDeTurnos, movimientosDeTurno, turnoAbierto, turnosCerrados } from "@/lib/datos";
import { fechaLarga, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { abrirCaja, cerrarCaja, corregirCierre, registrarGasto, registrarMovimiento } from "./actions";

export const metadata = { title: "Caja" };

const CATEGORIAS = ["Insumos", "Limpieza", "Servicios del local", "Renta", "Publicidad", "Mantenimiento", "Otros"];

export default async function Caja({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("caja.operar") && !s.puede("reportes.ver")) return <Aviso tipo="error">No tienes permiso para ver la caja.</Aviso>;
  const { aviso, error } = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const turno = await turnoAbierto(s.barberia.id);
  const datos = turno ? await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial) : null;
  const cerrados = await turnosCerrados(s.barberia.id, 20);
  const ajustes = await ajustesDeTurnos(s.barberia.id, cerrados.map((c) => c.id));
  const opera = s.puede("caja.operar");
  const a = aviso ? AVISOS[aviso] : undefined;

  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {!turno || !datos ? (
        <>
          <Encabezado etiqueta="Caja" titulo={<span className="vivo cerrada">La caja está cerrada</span>} sub="Ábrela con el efectivo que hay para dar cambio." />
          {opera && (
            <form action={abrirCaja} className="glass panel panel-grande" style={{ maxWidth: 460 }}>
              <label className="campo">
                <span>Fondo inicial en efectivo</span>
                <input className="input" name="fondo" inputMode="decimal" placeholder="Ejemplo: 500" required autoFocus />
              </label>
              <p className="ayuda">Si no hay efectivo para cambio, escribe 0.</p>
              <button className="btn pri grande">Abrir caja</button>
            </form>
          )}
        </>
      ) : (
        <>
          <Encabezado
            etiqueta={`Turno del ${fechaLarga(turno.fechaOperativa).toLowerCase()}`}
            titulo={<span className="vivo">La caja está abierta</span>}
            sub={`Se abrió a las ${horaCorta(turno.abiertoEn, zona)} con ${formatoDinero(turno.fondoInicial)} de fondo.`}
          />
          <section className="dos">
            <div className="pila">
              <div className="glass panel panel-grande">
                <div>
                  <span className="lab">Debe haber en efectivo</span>
                  <div className="big" style={{ marginTop: 12, fontSize: 64 }}><small>$</small>{(datos.esperado / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                  <span className="ctx">Es lo que deberías encontrar si cuentas ahora.</span>
                </div>
              </div>
              <div className="glass panel">
                <span className="lab">De dónde sale</span>
                <div className="lista">
                  <div><span>Fondo con que se abrió</span><span className="num">{formatoDinero(datos.m.fondoInicial)}</span></div>
                  <div><span>Cobros en efectivo</span><span className="num">{formatoDinero(datos.m.cobrosEfectivo)}</span></div>
                  <div><span>Propinas en efectivo<small>Son de las barberas; si se las entregas, regístralo como retiro</small></span><span className="num">{formatoDinero(datos.m.propinasEfectivo)}</span></div>
                  {datos.m.entradas > 0 && <div><span>Entradas</span><span className="num">{formatoDinero(datos.m.entradas)}</span></div>}
                  {datos.m.retiros > 0 && <div><span>Retiros</span><span className="num">−{formatoDinero(datos.m.retiros)}</span></div>}
                  {datos.m.gastosDeCaja > 0 && <div><span>Gastos pagados con la caja</span><span className="num">−{formatoDinero(datos.m.gastosDeCaja)}</span></div>}
                  {datos.m.devolucionesEfectivo > 0 && <div><span>Devoluciones en efectivo</span><span className="num">−{formatoDinero(datos.m.devolucionesEfectivo)}</span></div>}
                </div>
              </div>
              {(datos.movimientos.length > 0 || datos.gastos.length > 0) && (
                <div className="glass panel">
                  <span className="lab">Movimientos del turno</span>
                  <div className="lista">
                    {[
                      ...datos.movimientos.map((m) => ({ k: m.id, t: m.creadoEn, titulo: m.tipo === "retiro" ? "Retiro" : m.tipo === "entrada" ? "Entrada" : "Devolución", det: `${m.concepto}, ${m.usuario}`, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
                      ...datos.gastos.map((g) => ({ k: g.id, t: g.creadoEn, titulo: "Gasto de caja", det: `${g.concepto}, ${g.usuario}`, monto: -g.monto })),
                    ].sort((x, y) => y.t.getTime() - x.t.getTime()).map((m) => (
                      <div key={m.k}><span><b>{m.titulo}</b><small>{horaCorta(m.t, zona)}. {m.det}</small></span><span className="num">{formatoDinero(m.monto)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pila">
              <div className="glass panel"><div><span className="lab">Ventas del turno</span><span className="fig">{datos.ventas}</span><span className="ctx">Ventas cobradas desde que se abrió</span></div></div>
              <div className="glass panel"><div><span className="lab">Transferencia y tarjeta</span><span className="fig">{formatoDinero(datos.otrosCobros)}</span><span className="ctx">No entra a la caja física</span></div></div>
              {opera && (
                <>
                  <details className="glass panel">
                    <summary className="btn" style={{ width: "100%" }}>Registrar retiro o entrada</summary>
                    <form action={registrarMovimiento} className="pila" style={{ marginTop: 14 }}>
                      <div className="opciones">
                        <label className="opcion"><input type="radio" name="tipo" value="retiro" defaultChecked /><span>Retiro</span></label>
                        <label className="opcion"><input type="radio" name="tipo" value="entrada" /><span>Entrada</span></label>
                      </div>
                      <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
                      <label className="campo"><span>Para qué</span><input className="input" name="concepto" placeholder="Ejemplo: depósito al banco" required /></label>
                      <button className="btn pri">Guardar</button>
                    </form>
                  </details>
                  <details className="glass panel">
                    <summary className="btn" style={{ width: "100%" }}>Registrar gasto pagado con la caja</summary>
                    <form action={registrarGasto} className="pila" style={{ marginTop: 14 }}>
                      <input type="hidden" name="desdeCaja" value="si" />
                      <label className="campo"><span>Monto</span><input className="input" name="monto" inputMode="decimal" required /></label>
                      <label className="campo"><span>En qué se gastó</span><input className="input" name="concepto" placeholder="Ejemplo: toallas desechables" required /></label>
                      <label className="campo"><span>Tipo de gasto</span><select className="input" name="categoria">{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></label>
                      <button className="btn pri">Guardar gasto</button>
                    </form>
                  </details>
                  <form action={cerrarCaja} className="glass panel" style={{ boxShadow: "var(--sh1), inset 0 0 0 2px var(--accent)" }}>
                    <span className="lab">Cerrar la caja</span>
                    <label className="campo"><span>Efectivo que contaste</span><input className="input" name="contado" inputMode="decimal" required /></label>
                    <label className="campo"><span>Notas</span><textarea className="input" name="notas" placeholder="Si falta o sobra dinero, escribe qué pasó." /></label>
                    <p className="ayuda">Queda guardado con tu nombre y la hora.</p>
                    <button className="btn pri grande">Cerrar turno</button>
                  </form>
                </>
              )}
            </div>
          </section>
        </>
      )}

      <section className="pila">
        <div className="entre">
          <div><span className="lab">Cortes anteriores</span><h2 className="titulo" style={{ fontSize: 20 }}>Los últimos 20 cierres</h2></div>
          {s.puede("reportes.exportar") && <Link className="btn" href="/api/exportar?tipo=cortes">Descargar en Excel (CSV)</Link>}
        </div>
        {cerrados.length === 0 ? (
          <p className="muted">Todavía no hay cierres.</p>
        ) : (
          <div className="glass panel tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Día</th><th>Cerró</th><th className="der">Debía haber</th><th className="der">Se contó</th><th>Resultado</th><th>Notas</th></tr></thead>
              <tbody>
                {cerrados.map((c) => {
                  const aj = ajustes.filter((x) => x.turnoId === c.id);
                  const dif = c.diferencia ?? 0;
                  return (
                    <tr key={c.id}>
                      <td>{fechaLarga(c.fechaOperativa)}</td>
                      <td>{c.cerradoPor ?? ""}<br /><small className="muted">{c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}</small></td>
                      <td className="der num">{formatoDinero(c.efectivoEsperado ?? 0)}</td>
                      <td className="der num">{formatoDinero(c.efectivoContado ?? 0)}</td>
                      <td>
                        <span className={`chip ${dif === 0 ? "ok" : "warn"}`}>{dif === 0 ? "Cuadró" : dif > 0 ? `Sobró ${formatoDinero(dif)}` : `Faltó ${formatoDinero(-dif)}`}</span>
                        {aj.map((x, i) => <small key={i} className="muted" style={{ display: "block", marginTop: 6 }}>Corrección de {formatoDinero(x.monto)} por {x.usuario}: {x.motivo}</small>)}
                      </td>
                      <td>
                        <small className="muted">{c.notasCierre ?? ""}</small>
                        {s.puede("caja.corregir") && (
                          <details style={{ marginTop: 6 }}>
                            <summary className="enlace">Corregir</summary>
                            <form action={corregirCierre} className="pila-chica" style={{ marginTop: 8, minWidth: 220 }}>
                              <input type="hidden" name="turnoId" value={c.id} />
                              <select className="input" name="signo"><option value="mas">Apareció dinero</option><option value="menos">Faltó dinero</option></select>
                              <input className="input" name="monto" inputMode="decimal" placeholder="Monto" required />
                              <input className="input" name="motivo" placeholder="Motivo" required />
                              <button className="btn chico pri">Guardar corrección</button>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
