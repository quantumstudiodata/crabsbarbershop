import Link from "next/link";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { elegirRegla } from "@/lib/comisiones";
import { reglasDe, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { NOMBRE_FORMA_PAGO, NOMBRE_FRECUENCIA, cuentaDe, frecuenciaDe, modalidadCorta, periodoDePago } from "@/lib/equipo";
import { faltantesEnRevision } from "@/lib/faltantes";
import { fechaCorta, fechaLarga, sumarDias } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { PestanasEquipo } from "../Partes";
import { personasEquipo, sesionEquipo, mesElegido } from "../datos";
import { decidirFaltante } from "../actions";
import { FilaPago, type DatosFila } from "./FilaPago";

export const metadata = { title: "Pagos del equipo" };

const diaCorto = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");

export default async function Pagos({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const se = await sesionEquipo();
  const q = await searchParams;
  const { hoy } = mesElegido({}, se.barberia.zonaHoraria);
  const personas = (await personasEquipo(se.barberia.id)).filter((p) => p.activo);
  const reglas = await reglasDe(se.barberia.id);
  const periodos = new Map(personas.map((p) => { const r = elegirRegla(reglas, p.id, null, new Date()); return [p.id, { r, per: periodoDePago(r, hoy) }]; }));
  // Una sola consulta de ventas que cubre el periodo más largo en curso.
  const inicio = [...[...periodos.values()].map((x) => x.per.desde), hoy].sort()[0];
  const [{ ventas }, revision, sinAsignar] = await Promise.all([
    ventasEntre(se.barberia.id, inicio, hoy, { zona: se.barberia.zonaHoraria }),
    faltantesEnRevision(se.barberia.id),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.turnosCaja)
      .where(and(eq(schema.turnosCaja.barberiaId, se.barberia.id), eq(schema.turnosCaja.estado, "cerrado"), lt(schema.turnosCaja.diferencia, 0), isNull(schema.turnosCaja.faltanteRegla), gte(schema.turnosCaja.fechaOperativa, sumarDias(hoy, -60)))),
  ]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const puedePagar = se.puede("equipo.pagar");
  const puedeAutorizar = se.puede("equipo.autorizar");

  const cuentas = await Promise.all(personas.map(async (p) => {
    const { r, per } = periodos.get(p.id)!;
    const hasta = per.hasta > hoy ? hoy : per.hasta;
    const c = await cuentaDe(se.barberia.id, p.id, per.desde, hasta, pagadas.filter((v) => v.fecha >= per.desde && v.fecha <= hasta));
    const renta = c.regla?.tipo === "renta";
    const saldo = renta ? c.rentaPendiente : c.saldo;
    const pagado = renta ? c.rentaPagada : c.pagado;
    const periodo = per.desde === per.hasta ? fechaLarga(per.desde) : `Del ${fechaCorta(per.desde)} al ${fechaCorta(per.hasta)}`;
    const fila: DatosFila = {
      id: p.id, nombre: p.nombre, avatar: p.avatar, modalidad: modalidadCorta(c.regla), frecuencia: NOMBRE_FRECUENCIA[frecuenciaDe(r)] ?? "Semanal",
      periodo, semana: hoy, renta, monto: formatoDinero(saldo), parcial: pagado > 0 && saldo > 0,
      estado: saldo <= 0 ? (renta ? "Cubierta" : "Al corriente") : pagado > 0 ? "Pago parcial" : "Pendiente",
      puedePagar: puedePagar && saldo > 0,
      detalle: renta
        ? [["Periodo", periodo], ["Fecha límite", fechaLarga(per.pago)], ["Renta del periodo", formatoDinero(c.renta)], ["Recibido", formatoDinero(c.rentaPagada)], ["Pendiente", formatoDinero(c.rentaPendiente)]]
        : [["Periodo", periodo], ["Fecha de pago", fechaLarga(per.pago)], ["Forma de pago", NOMBRE_FORMA_PAGO[r?.formaPago ?? "efectivo"] ?? "Efectivo de caja"], ["Ventas atribuidas", formatoDinero(c.vendido)],
          ...(c.comision ? [["Comisión generada", formatoDinero(c.comision)] as [string, string]] : []), ...(c.sueldo ? [["Sueldo del periodo", formatoDinero(c.sueldo)] as [string, string]] : []),
          ["Pagos registrados", formatoDinero(c.pagado)], ...(c.faltantes ? [["Faltantes autorizados", `−${formatoDinero(c.faltantes)}`] as [string, string]] : []), ["Saldo pendiente", formatoDinero(c.saldo)]],
    };
    return { renta, saldo, fila, sinRegla: !c.regla, pago: per.pago };
  }));
  const equipo = cuentas.filter((c) => !c.renta && !c.sinRegla);
  const rentas = cuentas.filter((c) => c.renta);
  const porPagar = equipo.filter((c) => c.saldo > 0);
  const porCobrar = rentas.filter((c) => c.saldo > 0);
  const alCorriente = [...equipo, ...rentas].filter((c) => c.saldo <= 0);
  const suma = (xs: typeof cuentas) => xs.reduce((a, c) => a + c.saldo, 0);
  const proximo = porPagar.map((c) => c.pago).filter((f) => f >= hoy).sort()[0];
  const nSinAsignar = sinAsignar[0]?.n ?? 0;

  return (
    <div className="eq">
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <PestanasEquipo pagos={puedePagar} />
      <div className="glass eq-card eq-resumen">
        <div className="eq-res-cifras">
          {equipo.length > 0 && <div className="pri"><small>Por pagar al equipo</small><b>{formatoDinero(suma(porPagar))}</b><span>{porPagar.length} {porPagar.length === 1 ? "persona" : "personas"}</span></div>}
          {rentas.length > 0 && <div><small>Por cobrar de rentas</small><b>{formatoDinero(suma(porCobrar))}</b><span>{porCobrar.length} {porCobrar.length === 1 ? "renta" : "rentas"}</span></div>}
          {!equipo.length && !rentas.length && <p className="muted">Configura la forma de pago de cada persona en Ajustes, Usuarios.</p>}
        </div>
        {proximo && <p className="eq-prox">Próximo pago: {diaCorto(proximo)}</p>}
      </div>
      <div className="eq-2col">
        {equipo.length > 0 && (
          <section>
            <div className="eq-h"><b>Por pagar al equipo</b><small>{porPagar.length} {porPagar.length === 1 ? "pendiente" : "pendientes"}</small></div>
            {porPagar.length ? <div className="glass eq-card">{porPagar.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div> : <p className="muted eq-vacio">Nadie tiene saldo pendiente.</p>}
          </section>
        )}
        {rentas.length > 0 && (
          <section>
            <div className="eq-h"><b>Por cobrar</b><small>{porCobrar.length} {porCobrar.length === 1 ? "renta pendiente" : "rentas pendientes"}</small></div>
            {porCobrar.length ? <div className="glass eq-card">{porCobrar.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div> : <p className="muted eq-vacio">Todas las rentas están cubiertas.</p>}
          </section>
        )}
      </div>
      {alCorriente.length > 0 && (
        <details className="eq-sec">
          <summary><Icono n="palomita" />Sin saldo pendiente<Icono n="abajo" /></summary>
          <div className="glass eq-card">{alCorriente.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div>
        </details>
      )}
      {(revision.length > 0 || nSinAsignar > 0) && (
        <section className="eq-falt">
          <div className="eq-h"><b>Faltantes de caja</b><small>{revision.length} en revisión</small></div>
          {nSinAsignar > 0 && se.puede("cortes.ver") && (
            <Link href="/analitica/cortes" className="eq-aviso"><Icono n="caja" /><span><b>{nSinAsignar} {nSinAsignar === 1 ? "corte con faltante detectado" : "cortes con faltante detectado"}</b><small>Falta decidir quién lo cubre</small></span><Icono n="derecha" /></Link>
          )}
          {revision.length > 0 && (
            <div className="glass eq-card">
              {revision.map((f) => (
                <div key={f.id} className="eq-fila eq-ffila">
                  <span className="eq-m"><b>{f.nombre}</b><small>Corte del {fechaCorta(f.fecha)}, en revisión</small></span>
                  <b className="eq-monto">{formatoDinero(f.monto)}</b>
                  {puedeAutorizar && (
                    <div className="eq-facc">
                      <form action={decidirFaltante}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="decision" value="descartar" /><button className="eq-bt">Descartar</button></form>
                      <form action={decidirFaltante}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="decision" value="autorizar" /><button className="eq-bt osc">Autorizar</button></form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="eq-nota">Un faltante en revisión no afecta el saldo. Solo se descuenta si se autoriza y la persona lo acepta por escrito (Ley Federal del Trabajo, art. 110).</p>
        </section>
      )}
    </div>
  );
}
