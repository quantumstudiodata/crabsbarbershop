import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo } from "@/lib/datos";
import { diasEntre, fechaCorta, fechaLocal, sumarDias } from "@/lib/fechas";
import { leerPeriodo } from "@/lib/periodo";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";

export const metadata = { title: "Analítica" };

const TONOS = ["#4b6274", "#8ea5b8", "#c3cfd9", "#a5b0ba", "#6d7a86"];
const DIA_CORTO = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export default async function Resumen({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.ver")) redirect(s.puede("ventas.ver_todas") ? "/analitica/ventas" : "/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy);
  const largo = diasEntre(p.desde, p.hasta) + 1;
  // Si el periodo no ha terminado, se compara contra el mismo número de días del periodo anterior.
  const corte = p.hasta > hoy ? hoy : p.hasta;
  const tramo = diasEntre(p.desde, corte) + 1;
  const [r, previo] = await Promise.all([
    resumenPeriodo(s.barberia.id, p.desde, p.hasta, zona),
    resumenPeriodo(s.barberia.id, sumarDias(p.desde, -largo), sumarDias(p.desde, -largo + tramo - 1), zona),
  ]);
  const v = cambio(r.netas, previo.netas);
  const comparacion = tramo < largo ? `que los primeros ${tramo} ${tramo === 1 ? "día" : "días"} del periodo anterior` : "que el periodo anterior";
  const dias = Array.from({ length: Math.min(largo, 31) }, (_, i) => sumarDias(p.desde, i));
  const maxDia = Math.max(...dias.map((d) => r.porDia.get(d) ?? 0), 1);
  const mejor = dias.reduce((m, d) => ((r.porDia.get(d) ?? 0) > (r.porDia.get(m) ?? 0) ? d : m), dias[0]);
  const totalMetodos = r.porMetodo.reduce((a, [, x]) => a + x, 0);
  const queda = r.netas - r.comisiones - r.gastos;
  const exportar = (tipo: string) => `/api/exportar?tipo=${tipo}&desde=${p.desde}&hasta=${p.hasta}`;

  return (
    <>
      <section className="hero subir">
        <div>
          <SelectorPeriodo ruta="/analitica" p={p} hoy={hoy} />
          <p className="muted" style={{ margin: "26px 0 6px" }}>{p.tipo === "rango" ? `Ventas ${p.etiqueta.toLowerCase()}` : p.tipo === "semana" ? "Ventas de esta semana" : p.tipo === "mes" ? "Ventas de este mes" : `Ventas, ${p.etiqueta}`}</p>
          <div className="big"><Cuenta valor={r.netas} /></div>
          <p className="muted" style={{ marginTop: 12 }}>
            {v === null ? `De ${r.clientes} ${r.clientes === 1 ? "cliente" : "clientes"}.` : (
              <><b style={{ color: v >= 0 ? "var(--ok)" : "var(--warn)" }}>{v >= 0 ? "↗" : "↘"} {Math.abs(v)}% {v >= 0 ? "más" : "menos"}</b> {comparacion}</>
            )}
          </p>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Clientes atendidos</span><b>{r.clientes}</b></div>
            <div><span>Promedio por cliente</span><b>{r.clientes ? formatoDinero(r.ticket) : "Sin datos"}</b></div>
            <div><span>Descuentos dados</span><b>{formatoDinero(r.descuentos)}</b></div>
            <div><span>Propinas<Ayuda titulo="Propinas" izq>Son del equipo. No se suman a las ventas.</Ayuda></span><b>{formatoDinero(r.propinas)}</b></div>
          </div>
        </div>
      </section>

      <section className="dos subir d2">
        <div className="glass panel">
          <span className="lab">Día por día</span>
          <div className="barras" aria-label="Ventas por día">
            {dias.map((d, i) => {
              const val = r.porDia.get(d) ?? 0;
              const top = d === mejor && val > 0;
              return (
                <div key={d} className={top ? "top" : ""} title={`${fechaCorta(d)}: ${formatoDinero(val)}`}>
                  {top && <em>{formatoDinero(val)}</em>}
                  <i style={{ height: `${Math.max(Math.round((val / maxDia) * 140), val ? 4 : 2)}px`, animationDelay: `${i * 0.04}s` }} />
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
                  <div key={n}><span className="fila" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: TONOS[i % TONOS.length] }} />{n}</span><span className="num">{porcentaje(x, totalMetodos)}%<small style={{ display: "inline", marginLeft: 8 }}>{formatoDinero(x)}</small></span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="glass panel subir d3">
        <div className="entre">
          <div>
            <span className="lab">Después de comisiones y gastos<Ayuda titulo="¿Qué es este número?">Es un estimado, no la ganancia.<br />A las ventas solo se les restan las comisiones ({formatoDinero(r.comisiones)}) y los gastos anotados en el sistema ({formatoDinero(r.gastos)}). Faltan gastos como luz, renta del local o impuestos si no se registraron.</Ayuda></span>
            <span className="fig">Quedan cerca de {formatoDinero(queda)}</span>
          </div>
          {s.puede("reportes.exportar") && (
            <div className="fila">
              <a className="bt sec solo" href={exportar("ventas")}><Icono n="descargar" />Ventas</a>
              <a className="bt sec solo" href={exportar("gastos")}><Icono n="descargar" />Gastos</a>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
