import { Grafica } from "./Grafica";
import { resumenPeriodo } from "@/lib/datos";
import { diasEntre, fechaCorta, inicioDeMes, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero } from "@/lib/money";
import { leerPeriodo, type Periodo } from "@/lib/periodo";

/**
 * El periodo del encabezado: el elegido en el historial o, si no hay filtro, el mes en curso.
 * El día 1 todavía no hay datos del mes, así que se muestra el mes anterior.
 */
export function periodoEncabezado(p: Periodo | null, hoy: string): { p: Periodo; anterior: boolean } {
  if (p) return { p, anterior: false };
  if (hoy.slice(8) === "01") return { p: leerPeriodo({ periodo: "mes", mes: sumarDias(hoy, -1).slice(0, 7) }, hoy), anterior: true };
  return { p: leerPeriodo({ periodo: "mes" }, hoy), anterior: false };
}

const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Encabezado compacto de Ventas: total, una gráfica pequeña y tres conclusiones del periodo. */
export async function CabeceraVentas({ barberiaId, zona, hoy, p, anterior, persona }: { barberiaId: string; zona: string; hoy: string; p: Periodo; anterior: boolean; persona?: string }) {
  const largo = diasEntre(p.desde, p.hasta) + 1;
  const tramo = diasEntre(p.desde, p.hasta > hoy ? hoy : p.hasta) + 1;
  const prevDesde = p.tipo === "mes" ? inicioDeMes(sumarDias(p.desde, -1)) : sumarDias(p.desde, -largo);
  const [r, prev] = await Promise.all([
    resumenPeriodo(barberiaId, p.desde, p.hasta, zona, persona),
    resumenPeriodo(barberiaId, prevDesde, sumarDias(prevDesde, tramo - 1), zona, persona),
  ]);
  const v = cambio(r.netas, prev.netas);
  const dias = Array.from({ length: Math.min(largo, 62) }, (_, i) => sumarDias(p.desde, i));
  const conVentas = dias.filter((d) => d <= hoy);
  const mejor = conVentas.reduce((m, d) => ((r.porDia.get(d) ?? 0) > (r.porDia.get(m) ?? 0) ? d : m), conVentas[0] ?? p.desde);
  const sinVentas = conVentas.filter((d) => !(r.porDia.get(d) ?? 0)).length;
  const masPedido = [...r.porServicio].sort((a, b) => b[1].veces - a[1].veces)[0];
  const textoComp = p.tipo === "mes" ? "el mes anterior" : "el periodo anterior";
  return (
    <>
      <section className="cab-v glass subir">
        <div className="cv-num">
          <span className="lab">Ventas {p.tipo === "mes" ? `de ${p.etiqueta.split(" ")[0].toLowerCase()}` : p.tipo === "dia" ? `del ${fechaCorta(p.desde)}` : p.etiqueta.toLowerCase()}</span>
          <b className="num">{formatoDinero(r.netas)}</b>
          {v !== null && <span className="chip-p si">{v === 0 ? "Igual" : `${Math.abs(v)}% ${v > 0 ? "más" : "menos"}`} que {textoComp}</span>}
        </div>
        {largo > 1 && largo <= 62 && (
          <div className="cv-graf">
            <Grafica id="cab-ventas" actual={dias.map((d) => (d <= hoy ? r.porDia.get(d) ?? 0 : null))} etiquetas={dias.map(() => "")} alto={84} ancho={420} descripcion="Ventas por día" vacio="Sin ventas" />
          </div>
        )}
        <div className="cv-concl">
          {r.servicios > 0 && <span><b>{r.servicios} {r.servicios === 1 ? "servicio" : "servicios"}</b>, {formatoDinero(Math.round(r.netas / r.servicios / 100) * 100)} en promedio</span>}
          {masPedido && <span><b>{masPedido[0]}</b> lo más pedido</span>}
          {largo > 1 && r.netas > 0 && <span><b>{DIA[new Date(`${mejor}T12:00:00Z`).getUTCDay()]} {Number(mejor.slice(8))}</b> el mejor día</span>}
          {largo > 1 && sinVentas > 0 && <span><b>{sinVentas} {sinVentas === 1 ? "día" : "días"}</b> sin ventas</span>}
          {!masPedido && <span className="muted">Sin ventas en estas fechas</span>}
        </div>
      </section>
      {anterior && <p className="aviso-sutil">Mostrando {p.etiqueta.split(" ")[0].toLowerCase()} hasta que empiece el mes.</p>}
    </>
  );
}
