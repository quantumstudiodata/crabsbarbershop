import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo } from "@/lib/datos";
import { diasEntre, esFechaValida, fechaCorta, fechaLocal, finDeMes, inicioDeMes, lunesDe, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";

export const metadata = { title: "Reportes" };

const TONOS = ["#4b6274", "#8ea5b8", "#c3cfd9", "#a5b0ba", "#6d7a86"];
const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export default async function Reportes({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const s = await requerirSesion("reportes.ver");
  const q = await searchParams;
  const hoy = fechaLocal(new Date(), s.barberia.zonaHoraria);
  const periodo = q.periodo === "mes" || q.periodo === "rango" ? q.periodo : "semana";
  let desde: string, hasta: string, etiqueta: string, nombre: string;
  if (periodo === "mes") {
    desde = inicioDeMes(hoy); hasta = finDeMes(hoy); nombre = "Este mes"; etiqueta = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  } else if (periodo === "rango" && esFechaValida(q.desde) && esFechaValida(q.hasta) && q.desde <= q.hasta && diasEntre(q.desde, q.hasta) <= 366) {
    desde = q.desde; hasta = q.hasta; nombre = "En esas fechas"; etiqueta = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  } else {
    desde = lunesDe(hoy); hasta = sumarDias(desde, 6); nombre = "Esta semana"; etiqueta = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  }
  const largo = diasEntre(desde, hasta) + 1;
  // Si el periodo no ha terminado, se compara contra el mismo número de días del periodo anterior.
  const corte = hasta > hoy ? hoy : hasta;
  const tramo = diasEntre(desde, corte) + 1;
  const [r, previo] = await Promise.all([
    resumenPeriodo(s.barberia.id, desde, hasta),
    resumenPeriodo(s.barberia.id, sumarDias(desde, -largo), sumarDias(desde, -largo + tramo - 1)),
  ]);
  const comparacion = tramo < largo ? `que los primeros ${tramo} ${tramo === 1 ? "día" : "días"} del periodo anterior` : "que el periodo anterior";
  const v = cambio(r.netas, previo.netas);
  const dias = Array.from({ length: Math.min(largo, 31) }, (_, i) => sumarDias(desde, i));
  const maxDia = Math.max(...dias.map((d) => r.porDia.get(d) ?? 0), 1);
  const mejor = dias.reduce((m, d) => ((r.porDia.get(d) ?? 0) > (r.porDia.get(m) ?? 0) ? d : m), dias[0]);
  const totalMetodos = r.porMetodo.reduce((a, [, x]) => a + x, 0);
  const queda = r.netas - r.comisiones - r.gastos;
  const exportar = (tipo: string) => `/api/exportar?tipo=${tipo}&desde=${desde}&hasta=${hasta}`;

  return (
    <>
      <Encabezado
        etiqueta={etiqueta}
        titulo={`${nombre} entraron ${formatoDinero(r.netas)}`}
        sub={v === null ? `De ${r.clientes} clientes.` : <><span style={{ color: "var(--accent)", fontWeight: 600 }}>{Math.abs(v)}% {v >= 0 ? "más" : "menos"}</span> {comparacion}.</>}
      >
        <nav className="opciones" aria-label="Periodo">
          {[["semana", "Semana"], ["mes", "Mes"]].map(([k, t]) => (
            <Link key={k} href={`/reportes?periodo=${k}`} className="btn chico" style={periodo === k ? { background: "var(--ink)", color: "#fff" } : undefined}>{t}</Link>
          ))}
        </nav>
      </Encabezado>

      <form className="fila" action="/reportes">
        <input type="hidden" name="periodo" value="rango" />
        <label className="campo"><span>Desde</span><input className="input" type="date" name="desde" defaultValue={desde} max={hoy} /></label>
        <label className="campo"><span>Hasta</span><input className="input" type="date" name="hasta" defaultValue={hasta} /></label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Ver esas fechas</button>
      </form>

      <section className="cuatro">
        <Mini l="Clientes" v={String(r.clientes)} c={`${r.servicios} servicios`} />
        <Mini l="Por cliente" v={formatoDinero(Math.round(r.ticket / 100) * 100)} c="Lo que deja cada visita" />
        <Mini l="Descuentos" v={formatoDinero(r.descuentos)} c={r.canceladas ? `${r.canceladas} ${r.canceladas === 1 ? "venta cancelada" : "ventas canceladas"}` : "Sin cancelaciones"} />
        <Mini l="Propinas" v={formatoDinero(r.propinas)} c="Son del equipo" />
      </section>

      <section className="dos">
        <div className="glass panel">
          <span className="lab">Día por día</span>
          <div className="barras" aria-label="Ventas por día">
            {dias.map((d) => {
              const val = r.porDia.get(d) ?? 0;
              const top = d === mejor && val > 0;
              return (
                <div key={d} className={top ? "top" : ""} title={`${fechaCorta(d)}: ${formatoDinero(val)}`}>
                  {top && <em>{formatoDinero(val)}</em>}
                  <i style={{ height: `${Math.max(Math.round((val / maxDia) * 140), val ? 4 : 2)}px` }} />
                  <small>{largo <= 7 ? DIA_CORTO[new Date(`${d}T12:00:00Z`).getUTCDay()] : d.slice(8)}</small>
                </div>
              );
            })}
          </div>
          {r.netas > 0 && <span className="ctx">El mejor día fue el {fechaCorta(mejor)}.</span>}
        </div>
        <div className="pila">
          <div className="glass panel">
            <span className="lab">Lo que más se vendió</span>
            {r.porServicio.length === 0 ? <p className="muted">Sin ventas en estas fechas.</p> : (
              <div className="lista">
                {r.porServicio.slice(0, 4).map(([n, x]) => <div key={n}><span>{n}<small>{x.veces} {x.veces === 1 ? "vez" : "veces"}</small></span><span className="num">{formatoDinero(x.monto)}</span></div>)}
              </div>
            )}
          </div>
          {totalMetodos > 0 && (
            <div className="glass panel">
              <span className="lab">Cómo pagaron</span>
              <div className="reparto">{r.porMetodo.map(([n, x], i) => <span key={n} style={{ width: `${porcentaje(x, totalMetodos)}%`, background: TONOS[i % TONOS.length] }} />)}</div>
              <div className="lista">
                {r.porMetodo.map(([n, x], i) => (
                  <div key={n}><span className="fila" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: TONOS[i % TONOS.length] }} />{n}</span><span className="num">{porcentaje(x, totalMetodos)}% <small style={{ display: "inline" }}>{formatoDinero(x)}</small></span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {r.porBarbero.length > 0 && (
        <section className="glass panel tabla-wrap">
          <span className="lab">Por barbera</span>
          <table className="tabla">
            <thead><tr><th>Nombre</th><th className="der">Servicios</th><th className="der">Vendió</th></tr></thead>
            <tbody>{r.porBarbero.map((b) => <tr key={b.id}><td>{b.nombre}</td><td className="der num">{b.servicios}</td><td className="der num">{formatoDinero(b.monto)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="glass idea">
        <span className="punto" aria-hidden="true">≈</span>
        <p>
          <b>Después de comisiones y gastos registrados quedan cerca de {formatoDinero(queda)}.</b>
          <br />
          <span>Es un estimado, no la ganancia: solo resta las comisiones ({formatoDinero(r.comisiones)}) y los gastos anotados en el sistema ({formatoDinero(r.gastos)}).</span>
        </p>
        {s.puede("reportes.exportar") && (
          <div className="fila">
            <a className="btn" href={exportar("ventas")}>Descargar ventas</a>
            <a className="btn" href={exportar("gastos")}>Descargar gastos</a>
          </div>
        )}
      </section>
    </>
  );
}

function Mini({ l, v, c }: { l: string; v: string; c: string }) {
  return <div className="glass panel"><div><span className="lab">{l}</span><span className="fig">{v}</span><span className="ctx">{c}</span></div></div>;
}
