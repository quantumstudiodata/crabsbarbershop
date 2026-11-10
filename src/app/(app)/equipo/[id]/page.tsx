import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { NOMBRE_FORMA_PAGO, NOMBRE_FRECUENCIA, cuentaDe, frecuenciaDe, modalidadCorta, periodoDePago, rendimiento } from "@/lib/equipo";
import { elegirRegla } from "@/lib/comisiones";
import { reglasDe } from "@/lib/datos";
import { sql } from "drizzle-orm";
import { formatoDinero } from "@/lib/money";
import { fechaLarga } from "@/lib/fechas";
import { NOMBRE_ROL, type Rol } from "@/lib/permisos";
import { MesEquipo } from "../Partes";
import { mesElegido, sesionEquipo } from "../datos";

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
  const cambio = anterior.r.vendido ? Math.round(((r.vendido - anterior.r.vendido) / anterior.r.vendido) * 100) : null;
  const mesAnt = new Date(`${anterior.nombre}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" });
  const max = Math.max(1, ...r.top.map((t) => t.veces));
  const q = m.mes === m.hoy.slice(0, 7) ? "" : `?mes=${m.mes}`;
  const puesto = NOMBRE_ROL[u.rol as Rol] ?? "";
  const regla = cuenta.regla;
  const cal = elegirRegla(await reglasDe(se.barberia.id), u.id, null, new Date());
  const per = cal ? periodoDePago(cal, m.hoy) : null;
  const [res] = await db.select({ n: sql<number>`count(*)::int`, prom: sql<number>`coalesce(avg(${schema.resenas.calificacion}), 0)::float` })
    .from(schema.resenas).where(and(eq(schema.resenas.barberiaId, se.barberia.id), eq(schema.resenas.barberoId, u.id)));
  const DIAS_C = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  return (
    <div className="eq eq-ficha">
      <div className="eq-volver"><Link href={`/equipo${q}`} className="icb" aria-label="Volver a Equipo"><Icono n="izquierda" /></Link><b>Perfil</b></div>
      <div className="eq-asim">
        <aside className="eq-perfil">
          <div className="eq-id">
            <Avatar avatar={u.avatar} nombre={u.nombre} t={52} />
            <div>
              <h2>{u.nombre}</h2>
              <small>{puesto}{puesto ? ", " : ""}<i className={`eq-dot ${u.activo ? "on" : ""}`} />{u.activo ? "Activa" : "Archivada"}</small>
              <small className="eq-pago"><Icono n="efectivo" /><span>{cuenta.forma}</span></small>
            </div>
          </div>
          {se.puede("usuarios.editar") && <Link href="/ajustes/usuarios" className="eq-bt"><Icono n="editar" />Editar perfil</Link>}
          <div className="eq-lab">
            <div>
              <span className="eq-sup">Horario</span>
              <dl><dt>Horario habitual</dt><dd>{h.horas || "Sin horario"}</dd><dt>Días laborales</dt><dd>{h.dias}</dd></dl>
              {se.puede("citas.horarios") && <Link href="/citas" className="eq-bt">Editar horario<Icono n="derecha" /></Link>}
            </div>
            <div>
              <span className="eq-sup">Remuneración</span>
              <dl>
                <dt>Modalidad</dt><dd>{modalidadCorta(regla)}</dd>
                {regla && (regla.tipo === "porcentaje" || regla.tipo === "mixto") && <><dt>Porcentaje</dt><dd>{regla.porcentaje / 100}%</dd></>}
                {cal && <><dt>Periodicidad</dt><dd>{NOMBRE_FRECUENCIA[frecuenciaDe(cal)] ?? "Semanal"}{frecuenciaDe(cal) === "semana" ? `, corte el ${DIAS_C[cal.diaCorte ?? 0]}` : ""}</dd></>}
                {cal && <><dt>Forma de pago</dt><dd>{NOMBRE_FORMA_PAGO[cal.formaPago ?? "efectivo"]}</dd></>}
                {per && regla?.tipo !== "renta" && <><dt>Próximo pago</dt><dd>{fechaLarga(per.pago)}</dd></>}
              </dl>
              {se.puede("equipo.pagar") && <Link href="/equipo/pagos" className="eq-bt">Consultar pagos<Icono n="derecha" /></Link>}
            </div>
          </div>
        </aside>
        <div className="eq-princ">
          <div className="eq-tit"><span>Rendimiento mensual</span><MesEquipo mes={m.mes} hoy={m.hoy} /></div>
          <div className="glass eq-card eq-metricas">
            <div className="pri"><small>Ventas atribuidas</small><b>{formatoDinero(r.vendido)}</b>{cambio !== null && <span className="eq-comp">{cambio >= 0 ? "+" : ""}{cambio}% vs. {mesAnt}</span>}</div>
            <div className="solo-esc"><small>Servicios</small><b>{r.servicios}</b></div>
            <div><small>Calificación</small><b className="eq-cal">{res.n ? <><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" /></svg>{res.prom.toFixed(1)}</> : "Sin reseñas"}</b>{res.n > 0 && <span className="eq-comp">{res.n} {res.n === 1 ? "reseña" : "reseñas"}</span>}</div>
            <div className="solo-esc"><small>Transacciones</small><b>{r.transacciones}</b></div>
            <div className="solo-esc"><small>Ticket promedio</small><b>{formatoDinero(r.ticket)}</b></div>
          </div>
          <div className="eq-tit"><span>Actividad</span><small>{r.servicios} {r.servicios === 1 ? "servicio" : "servicios"}</small></div>
          <div className="glass eq-card eq-act">
            {r.top.length ? r.top.slice(0, 5).map((t) => (
              <div key={t.nombre} className="eq-barra">
                <span>{t.nombre}</span><i><em style={{ width: `${(t.veces / max) * 100}%` }} /></i><b>{t.veces}</b><small className="solo-esc">{formatoDinero(t.monto)}</small>
              </div>
            )) : <p className="muted">Sin servicios en este mes.</p>}
            {r.servicios > 0 && <Link className="eq-ver" href={`/analitica/ventas?persona=${u.id}&periodo=mes&mes=${m.mes}`}>Ver toda la actividad<Icono n="derecha" /></Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
