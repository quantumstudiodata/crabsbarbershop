import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema as t } from "@/lib/db";
import { fechaLocal, fechaLarga } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { NOMBRE_ROL } from "@/lib/permisos";
import { solicitudes } from "@/lib/plataforma";
import { hace } from "@/lib/soporte";
import { CabezaSoporte, ListaSolicitudes } from "../../Comunes";

export const metadata = { title: "Diagnóstico de negocio" };

/**
 * Diagnóstico de un negocio: si las ventas se guardaron, si hubo errores, quién hizo qué,
 * si hay problemas de permisos y si los datos están bien asociados. Solo lectura.
 */
export default async function Diagnostico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [b] = await db.select().from(t.barberias).where(eq(t.barberias.id, id)).limit(1);
  if (!b) notFound();
  const hace7 = new Date(Date.now() - 7 * 864e5);
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  const [porDia, errores, actividad, gente, reglas, sesiones, [chk], turnosViejos, abiertas] = await Promise.all([
    db.select({ d: sql<string>`to_char((${t.ventas.creadoEn} at time zone ${b.zonaHoraria})::date, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${t.ventas.total}) filter (where ${t.ventas.estado} = 'pagada'), 0)::int`, canceladas: sql<number>`count(*) filter (where ${t.ventas.estado} = 'cancelada')::int` })
      .from(t.ventas).where(and(eq(t.ventas.barberiaId, id), gte(t.ventas.creadoEn, hace7))).groupBy(sql`1`).orderBy(sql`1 desc`),
    db.select({ e: t.erroresSistema, quien: t.usuarios.nombre }).from(t.erroresSistema).leftJoin(t.usuarios, eq(t.usuarios.id, t.erroresSistema.usuarioId))
      .where(and(eq(t.erroresSistema.barberiaId, id), gte(t.erroresSistema.creadoEn, hace7))).orderBy(desc(t.erroresSistema.creadoEn)).limit(10),
    db.select({ h: t.historial, quien: t.usuarios.nombre }).from(t.historial).leftJoin(t.usuarios, eq(t.usuarios.id, t.historial.usuarioId))
      .where(eq(t.historial.barberiaId, id)).orderBy(desc(t.historial.creadoEn)).limit(12),
    db.select({ u: t.usuarios, puesto: t.puestos.nombre, puestoActivo: t.puestos.activo }).from(t.usuarios).leftJoin(t.puestos, eq(t.puestos.id, t.usuarios.puestoId))
      .where(and(eq(t.usuarios.barberiaId, id), sql`${t.usuarios.usuario} not like 'BORRADO-%'`)),
    db.select({ id: t.reglasComision.barberoId }).from(t.reglasComision).where(and(eq(t.reglasComision.barberiaId, id), isNull(t.reglasComision.vigenteHasta))),
    db.select({ id: t.sesiones.usuarioId, hasta: sql<Date>`max(${t.sesiones.expiraEn})` }).from(t.sesiones).groupBy(t.sesiones.usuarioId),
    // Revisiones de integridad: cada número debería ser cero.
    db.select({
      descuadradas: sql<number>`(select count(*) from ventas v where v.barberia_id = ${id} and v.estado = 'pagada' and v.total <> coalesce((select sum(p.monto) from pagos p where p.venta_id = v.id), 0))::int`,
      sinConceptos: sql<number>`(select count(*) from ventas v where v.barberia_id = ${id} and not exists (select 1 from conceptos c where c.venta_id = v.id))::int`,
      otroNegocio: sql<number>`(select count(*) from conceptos c join usuarios u on u.id = c.barbero_id where c.barberia_id = ${id} and u.barberia_id <> ${id})::int`,
      pagosOtroNegocio: sql<number>`(select count(*) from pagos p join ventas v on v.id = p.venta_id where p.barberia_id = ${id} and v.barberia_id <> ${id})::int`,
    }).from(sql`(select 1) x`),
    db.select({ id: t.turnosCaja.id, f: t.turnosCaja.fechaOperativa }).from(t.turnosCaja).where(and(eq(t.turnosCaja.barberiaId, id), eq(t.turnosCaja.estado, "abierto"), lt(t.turnosCaja.fechaOperativa, hoy))),
    solicitudes({ negocioId: id, limite: 5 }),
  ]);
  const vigentes = new Set(reglas.map((r) => r.id));
  const activos = gente.filter((g) => g.u.activo);
  const avisosPermisos = [
    ...activos.filter((g) => (g.u.rol === "barbera" || g.u.rol === "encargada") && !vigentes.has(g.u.id)).map((g) => `${g.u.nombre} atiende clientes y no tiene forma de pago definida`),
    ...activos.filter((g) => g.puesto && g.puestoActivo === false).map((g) => `${g.u.nombre} tiene un puesto desactivado: no puede entrar`),
    ...activos.filter((g) => g.u.debeCambiar).map((g) => `${g.u.nombre} todavía debe cambiar su contraseña temporal`),
    ...(activos.some((g) => g.u.rol === "duena") ? [] : ["El negocio no tiene titular activo"]),
  ];
  const integridad: [string, number][] = [
    ["Ventas cuyo total no coincide con lo pagado", chk.descuadradas], ["Ventas sin servicios", chk.sinConceptos],
    ["Servicios asignados a personas de otro negocio", chk.otroNegocio], ["Pagos ligados a ventas de otro negocio", chk.pagosOtroNegocio],
    ["Cajas abiertas de días anteriores", turnosViejos.length],
  ];
  const ventas7 = porDia.reduce((a, d) => a + d.n, 0);
  return (
    <>
      <CabezaSoporte titulo={b.nombre} sub={`Diagnóstico del negocio${b.esPrueba ? ", negocio de prueba" : ""}. Identificador ${b.id}`} />
      <section className="datos-s">
        <div><b className="num">{ventas7}</b><span>Ventas en 7 días</span></div>
        <div><b className="num">{errores.length}</b><span>Errores en 7 días</span></div>
        <div><b className="num">{activos.length}</b><span>Cuentas activas</span></div>
        <div><b className="num">{integridad.reduce((a, [, n]) => a + n, 0)}</b><span>Datos por revisar</span></div>
      </section>
      <div className="mosaico-s">
        <section className="glass panel-s">
          <span className="lab">1. ¿Las ventas se registraron?</span>
          {porDia.length ? porDia.map((d) => <div key={d.d} className="fila-d"><span>{d.d === hoy ? "Hoy" : fechaLarga(d.d)}</span><span className="muted">{d.n} {d.n === 1 ? "venta" : "ventas"}{d.canceladas ? `, ${d.canceladas} ${d.canceladas === 1 ? "cancelada" : "canceladas"}` : ""}</span><b className="num">{formatoDinero(d.total)}</b></div>)
            : <p className="muted chico-t">No hay ventas en los últimos 7 días.</p>}
        </section>
        <section className="glass panel-s">
          <span className="lab">2. ¿Hubo errores al guardar?</span>
          {errores.length ? errores.map(({ e, quien }) => <div key={e.id} className="error-s"><small>{hace(e.creadoEn)}, {e.ruta}{quien ? `, ${quien.split(" ")[0]}` : ""}</small><code>{e.mensaje}</code></div>)
            : <p className="muted chico-t">Sin errores registrados en los últimos 7 días.</p>}
        </section>
        <section className="glass panel-s">
          <span className="lab">3. ¿Quién hizo qué?</span>
          {actividad.length ? actividad.map(({ h, quien }) => <div key={h.id} className="fila-d"><span>{h.accion}</span><small className="muted">{quien?.split(" ")[0] ?? "Sistema"}, {hace(h.creadoEn)}</small></div>)
            : <p className="muted chico-t">Sin actividad registrada.</p>}
        </section>
        <section className="glass panel-s">
          <span className="lab">4. ¿Hay problemas de permisos?</span>
          {avisosPermisos.length ? avisosPermisos.map((a) => <p key={a} className="aviso-fila">{a}</p>) : <p className="muted chico-t">No se encontraron problemas de permisos.</p>}
          <div className="tabla-mini">
            {gente.map(({ u, puesto }) => {
              const ses = sesiones.find((x) => x.id === u.id);
              return <div key={u.id} className={u.activo ? "" : "inactiva"}><span>{u.nombre}</span><small>{puesto ?? NOMBRE_ROL[u.rol]}</small><small>{!u.activo ? "Desactivada" : ses && new Date(ses.hasta) > new Date() ? "Con sesión abierta" : "Sin sesión"}</small></div>;
            })}
          </div>
        </section>
        <section className="glass panel-s">
          <span className="lab">5. ¿Los datos están bien asociados?</span>
          {integridad.map(([t2, n]) => <div key={t2} className="fila-d"><span>{t2}</span>{n ? <span className="chip-p alerta">{n}</span> : <span className="chip-p">Correcto</span>}</div>)}
          {turnosViejos.length > 0 && <small className="muted">Cajas abiertas desde: {turnosViejos.map((x) => fechaLarga(x.f)).join(", ")}</small>}
        </section>
        <section className="glass panel-s">
          <span className="lab">Configuración</span>
          <div className="fila-d"><span>Estado de la cuenta</span><b>{b.estadoCuenta}</b></div>
          <div className="fila-d"><span>Plan</span><b>{b.plan}</b></div>
          <div className="fila-d"><span>Zona horaria</span><b>{b.zonaHoraria}</b></div>
          <div className="fila-d"><span>Caja</span><b>{b.modeloCaja}, {b.aperturaManual ? "apertura manual" : "apertura automática"}{b.corteObligatorio ? ", corte obligatorio" : ""}</b></div>
          <div className="fila-d"><span>Funciones</span><b>{[b.usaPropinas && "propinas", b.usaDescuentos && "descuentos", b.usaMetas && "metas", b.usaDividirPago && "dividir pago", b.usaRentaSilla && "renta de silla"].filter(Boolean).join(", ") || "ninguna"}</b></div>
        </section>
      </div>
      <div className="tit-fuera"><span className="lab">Solicitudes de este negocio</span></div>
      <section className="glass panel-s"><ListaSolicitudes filas={abiertas} vacio="Este negocio no ha enviado solicitudes." /></section>
    </>
  );
}
