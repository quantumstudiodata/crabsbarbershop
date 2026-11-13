import Link from "next/link";
import { Vacio } from "../Vacio";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { NOMBRE_FORMA_PAGO, NOMBRE_FRECUENCIA, cuentaDe, frecuenciaDe, modalidadCorta, periodoDePago, rendimiento } from "@/lib/equipo";
import { elegirRegla } from "@/lib/comisiones";
import { reglasDe } from "@/lib/datos";
import { sql } from "drizzle-orm";
import { formatoDinero } from "@/lib/money";
import { fechaLarga, fechaLocal } from "@/lib/fechas";
import { NOMBRE_ROL, type Rol } from "@/lib/permisos";
import { MesEquipo } from "../Partes";
import { cuentasEnCurso, mesElegido, sesionEquipo } from "../datos";
import { RegistrarPago } from "../Pago";
import { CuentaFicha, type VistaCuenta } from "../CuentaFicha";
import { Ayuda } from "@/components/Ayuda";

export const metadata = { title: "Equipo" };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "Lunes a sábado, 10:00 a 20:00" a partir del horario por día. */
function resumenHorario(h: Record<string, [string, string]>) {
  const dias = Object.keys(h).map(Number).filter((d) => d >= 0 && d <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!dias.length) return { dias: "Sin días laborales", horas: "" };
  const seguidos = dias.every((d, i) => i === 0 || (d + 6) % 7 === ((dias[i - 1] + 6) % 7) + 1);
  const may = (t: string) => t[0].toUpperCase() + t.slice(1);
  const txtDias = seguidos && dias.length > 2 ? `${may(DIAS[dias[0]])} a ${DIAS[dias[dias.length - 1]]}` : may(dias.map((d) => DIAS[d]).join(", "));
  const grupos = new Map<string, number[]>();
  for (const d of dias) { const k = `${h[d][0]} a ${h[d][1]}`; grupos.set(k, [...(grupos.get(k) ?? []), d]); }
  const horas = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, ds], i) => (i === 0 ? k : `${DIAS[ds[0]]} ${k}`)).join("; ");
  return { dias: txtDias, horas };
}

export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const se = await sesionEquipo();
  const { id } = await params;
  const m = mesElegido(await searchParams, se.barberia.zonaHoraria);
  const [u] = await db.select().from(schema.usuarios).where(and(eq(schema.usuarios.id, id), eq(schema.usuarios.barberiaId, se.barberia.id))).limit(1);
  if (!u) notFound();
  const [{ ventas }, anterior] = await Promise.all([
    ventasEntre(se.barberia.id, m.desde, m.hasta, { zona: se.barberia.zonaHoraria, barberoId: u.id }),
    (async () => {
      const d = new Date(`${m.desde}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
      const ym = d.toISOString().slice(0, 7);
      const fin = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
      return { nombre: ym, r: rendimiento((await ventasEntre(se.barberia.id, `${ym}-01`, fin, { zona: se.barberia.zonaHoraria, barberoId: u.id })).ventas, u.id) };
    })(),
  ]);
  const r = rendimiento(ventas, u.id);
  const cuenta = await cuentaDe(se.barberia.id, u.id, m.desde, m.hasta, ventas.filter((v) => v.estado === "pagada"));
  const [neg] = await db.select({ horario: schema.barberias.horario }).from(schema.barberias).where(eq(schema.barberias.id, se.barberia.id)).limit(1);
  const h = resumenHorario(u.horario ?? neg.horario);
  const mesAnt = new Date(`${anterior.nombre}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" });
  const q = m.mes === m.hoy.slice(0, 7) ? "" : `?mes=${m.mes}`;
  const puesto = NOMBRE_ROL[u.rol as Rol] ?? "";
  const regla = cuenta.regla;
  const cal = elegirRegla(await reglasDe(se.barberia.id), u.id, null, new Date());
  const per = cal ? periodoDePago(cal, m.hoy) : null;
  const [res] = await db.select({ n: sql<number>`count(*)::int`, prom: sql<number>`coalesce(avg(${schema.resenas.calificacion}), 0)::float` })
    .from(schema.resenas).where(and(eq(schema.resenas.barberiaId, se.barberia.id), eq(schema.resenas.barberoId, u.id)));
  const DIAS_C = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  const pagosRecientes = await db.select({ id: schema.pagosComision.id, tipo: schema.pagosComision.tipo, monto: schema.pagosComision.monto, creadoEn: schema.pagosComision.creadoEn })
    .from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, se.barberia.id), eq(schema.pagosComision.barberoId, u.id)))
    .orderBy(desc(schema.pagosComision.creadoEn)).limit(4);
  const puedePagar = se.puede("equipo.pagar");
  const [enCurso] = u.activo ? await cuentasEnCurso(se.barberia.id, se.barberia.zonaHoraria, [{ id: u.id, nombre: u.nombre, avatar: u.avatar }], puedePagar) : [];
  const renta = regla?.tipo === "renta";
  const DIAS_PAGO = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
  const sePaga = cal && !renta ? (frecuenciaDe(cal) === "semana" && per ? `se paga los ${DIAS_PAGO[new Date(`${per.pago}T12:00:00Z`).getUTCDay()]}` : `se paga ${(NOMBRE_FRECUENCIA[frecuenciaDe(cal)] ?? "").toLowerCase()}`) : "";
  const fecha = (d: Date) => fechaLarga(fechaLocal(d, se.barberia.zonaHoraria));
  const enMes = m.mes === m.hoy.slice(0, 7) ? "en el mes" : `en ${m.nombre.toLowerCase().split(" ")[0]}`;
  const periodoActual = enCurso && !enCurso.sinRegla ? <>Periodo en curso: {enCurso.fila.monto}</> : undefined;
  const cifras: [string, string, React.ReactNode?, boolean?][] = renta
    ? [["Ventas atribuidas", formatoDinero(r.vendido)], ["Renta del mes", formatoDinero(cuenta.renta)], ["Recibido", formatoDinero(cuenta.rentaPagada)], [`Por cobrar ${enMes}`, formatoDinero(cuenta.rentaPendiente), periodoActual, cuenta.rentaPendiente > 0]]
    : [["Ventas atribuidas", formatoDinero(r.vendido)], [cuenta.sueldo ? "Le corresponde" : "Comisión generada", formatoDinero(cuenta.corresponde)], [se.barberia.pagosEquipoAuto ? "Liquidado" : "Pagado", formatoDinero(cuenta.pagado)], [se.barberia.pagosEquipoAuto ? `Por liquidar ${enMes}` : `Por pagar ${enMes}`, formatoDinero(cuenta.saldo), periodoActual, cuenta.saldo > 0]];
  cifras[0][2] = <>{r.servicios} {r.servicios === 1 ? "servicio" : "servicios"}{res.n ? <><br />★ {res.prom.toFixed(1)} en {res.n} {res.n === 1 ? "reseña" : "reseñas"}</> : null}</>;

  const sinActividad = r.servicios === 0 && cuenta.corresponde === 0 && cuenta.pagado === 0 && cuenta.renta === 0;
  const pendLabel = renta ? "Por cobrar" : "Por pagar";
  const detalle = enCurso?.fila.detalle ?? [];
  const dato = (k: string) => detalle.find(([a]) => a === k)?.[1] ?? "";
  const vistas: VistaCuenta[] = [
    { clave: "mes", titulo: m.nombre.split(" ")[0].replace(/^./, (x) => x.toUpperCase()), pendiente: formatoDinero(renta ? cuenta.rentaPendiente : cuenta.saldo), nota: `Lo acumulado ${enMes}`,
      renglones: renta ? [["Renta del mes", formatoDinero(cuenta.renta)], ["Recibido", formatoDinero(cuenta.rentaPagada)], ["Ventas atribuidas", formatoDinero(r.vendido)]]
        : [["Ventas atribuidas", formatoDinero(r.vendido)], [cuenta.sueldo ? "Le corresponde" : "Comisión generada", formatoDinero(cuenta.corresponde)], ["Pagado", formatoDinero(cuenta.pagado)]] },
    ...(enCurso && !enCurso.sinRegla ? [{ clave: "periodo", titulo: "Periodo en curso", pendiente: enCurso.fila.monto, nota: `${dato("Periodo")}${dato(renta ? "Fecha límite" : "Fecha de pago") ? `, ${renta ? "vence" : "se paga"} el ${dato(renta ? "Fecha límite" : "Fecha de pago").toLowerCase()}` : ""}`,
      renglones: detalle.filter(([a]) => !["Periodo", "Fecha de pago", "Fecha límite", "Saldo pendiente", "Pendiente", "Forma de pago"].includes(a)) }] : []),
  ];
  const auto = se.barberia.pagosEquipoAuto;
  const pagar = enCurso && enCurso.fila.puedePagar && !auto ? <RegistrarPago filas={[enCurso.fila]} regreso={`/equipo/${u.id}${q}`} texto={renta ? "Registrar cobro" : "Registrar pago"} clase="eq2-pri eqa-bt" /> : null;
  const info = (
    <dl className="fa-dl">
      <dt>Horario</dt><dd>{h.horas || "Sin horario"}</dd>
      <dt>Días</dt><dd>{h.dias}</dd>
      <dt>Modalidad</dt><dd>{modalidadCorta(regla)}{regla && (regla.tipo === "porcentaje" || regla.tipo === "mixto") && !modalidadCorta(regla).includes("%") ? `, ${regla.porcentaje / 100}%` : ""}</dd>
      {cal && <><dt>Periodicidad</dt><dd>{NOMBRE_FRECUENCIA[frecuenciaDe(cal)] ?? "Semanal"}{frecuenciaDe(cal) === "semana" ? `, corte el ${DIAS_C[cal.diaCorte ?? 0]}` : ""}</dd></>}
      {cal && <><dt>Forma de pago</dt><dd>{NOMBRE_FORMA_PAGO[cal.formaPago ?? "efectivo"]}</dd></>}
      {per && !renta && <><dt>Próximo pago</dt><dd>{fechaLarga(per.pago)}</dd></>}
      <dt>Mes anterior</dt><dd>{formatoDinero(anterior.r.vendido)} en {mesAnt}</dd>
    </dl>
  );

  return (
    <div className="eq2 fa">
      <div className="eq2-tit fa-vol"><Link href={`/equipo${q}`} className="eq2-atr" aria-label="Volver a Equipo"><Icono n="izquierda" /></Link><span><small>Equipo</small></span></div>
      <div className="fa-grid">
        <aside className="glass fa-perfil">
          <div className="fa-id">
            <Avatar avatar={u.avatar} nombre={u.nombre} t={72} />
            <span><span className="eq2-nom"><h1>{u.nombre}</h1></span><small>{puesto}{!u.activo && ", archivada"}</small><small className="fa-forma">{[cuenta.forma, sePaga].filter(Boolean).join(", ")}</small></span>
          </div>
          <div className="solo-escritorio fa-acc">{pagar}</div>
          <div className="fa-info solo-escritorio">{info}{se.puede("citas.horarios") && <Link href="/ajustes/citas?tab=horarios" className="eq2-link">Editar horario</Link>}</div>
        </aside>
        <div className="fa-main">
          <div className="entre fa-mes"><span className="lab">{m.nombre}</span><MesEquipo mes={m.mes} hoy={m.hoy} /></div>
          {sinActividad && !(enCurso && enCurso.saldo > 0) ? (
            <Vacio icono="calendario" titulo={`Sin actividad ${enMes}`} texto="No tiene servicios, pagos ni saldo pendiente en este mes. Elige otro mes para ver su historial." />
          ) : (
            <>
              <section className="glass fa-cifras solo-escritorio">
                {cifras.map(([t, v, sub, pend]) => <span key={t}><small className={`${pend ? "pend" : ""} lab-ay`}>{t}{t === "Ventas atribuidas" && <Ayuda titulo="Ventas atribuidas">Total cobrado por los servicios que realizó, con cualquier forma de pago. Sobre esto se calcula su comisión.</Ayuda>}</small><b>{v}</b>{sub && <em>{sub}</em>}</span>)}
              </section>
              <div className="solo-movil fa-mov"><CuentaFicha vistas={vistas} etiqueta={pendLabel}>{pagar}</CuentaFicha>
                <small className="fa-ayuda">Ventas atribuidas: total cobrado por sus servicios con cualquier forma de pago. Sobre esto se calcula su comisión.{res.n ? ` Calificación de clientes: ★ ${res.prom.toFixed(1)} en ${res.n} ${res.n === 1 ? "reseña" : "reseñas"}.` : ""}</small></div>
            </>
          )}
          <div className="fa-dos">
            <section className="glass fa-card">
              <div className="entre"><span className="lab">Servicios cobrados</span>{r.servicios > 0 && <small className="muted">{r.servicios} en total</small>}</div>
              {r.top.length ? (
                <div className="eq2-tabla fa-serv">
                  <div className="cab"><span>Servicio</span><span>Cantidad</span><span>Cobrado</span></div>
                  {r.top.map((t) => <div key={t.nombre}><span>{t.nombre}</span><b>{t.veces}</b><span className="num">{formatoDinero(t.monto)}</span></div>)}
                </div>
              ) : <Vacio icono="lista" titulo="Sin servicios este mes" texto="Cuando cobre su primer servicio del mes, aquí aparecerá con su cantidad." />}
            </section>
            <section className="glass fa-card">
              <div className="entre"><span className="lab">{auto ? "Comisiones liquidadas" : "Pagos"}</span>{(puedePagar || auto) && pagosRecientes.length > 0 && <Link className="eq2-link" href={`/equipo/pagos?persona=${u.id}`}>Ver todos</Link>}</div>
              {pagosRecientes.length ? <div className="eq2-tabla">{pagosRecientes.map((x) => <div key={x.id}><span>{fecha(x.creadoEn)}{x.tipo === "renta" ? ", renta" : ""}</span><b>{formatoDinero(x.monto)}</b></div>)}</div> : <Vacio icono="efectivo" titulo={auto ? "Sin comisiones liquidadas" : "Sin pagos registrados"} texto={auto ? "Cada periodo liquidado aparecerá aquí con su fecha y monto." : "Cada pago que le registres aparecerá aquí con su fecha y monto."} />}
            </section>
          </div>
          <details className="eq2-mas solo-movil fa-det">
            <summary>Horario y forma de pago<Icono n="abajo" /></summary>
            {info}
            {se.puede("citas.horarios") && <Link href="/ajustes/citas?tab=horarios" className="eq2-link">Editar horario</Link>}
          </details>
        </div>
      </div>
    </div>
  );
}
