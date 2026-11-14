import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { ocultarSensibles, resumenError } from "@/lib/sensibles";
import { notFound } from "next/navigation";
import { db, schema as t } from "@/lib/db";
import { fechaLocal, fechaLarga } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { NOMBRE_ROL } from "@/lib/permisos";
import { solicitudes } from "@/lib/plataforma";
import Link from "next/link";
import { hace } from "@/lib/soporte";
import { CabezaSoporte, ListaSolicitudes } from "../../Comunes";
import { conteoMovimientos } from "@/lib/pruebas";
import { EmpezarDeCero } from "./EmpezarDeCero";

export const metadata = { title: "Ficha del negocio" };

const PESTANAS: [string, string][] = [["info", "Información"], ["usuarios", "Usuarios y puestos"], ["config", "Configuración"], ["actividad", "Actividad"], ["ventas", "Ventas"], ["solicitudes", "Solicitudes de soporte"], ["diagnostico", "Diagnóstico"]];

/** Ficha administrativa de un negocio. Todo es de solo lectura. */
export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const { id } = await params;
  const pedido = (await searchParams).ver;
  const ver = PESTANAS.some(([k]) => k === pedido) ? pedido! : "info";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [b] = await db.select().from(t.barberias).where(eq(t.barberias.id, id)).limit(1);
  if (!b) notFound();
  const [[duena], [cuentas], [ventas], [ultima]] = await Promise.all([
    db.select({ nombre: t.usuarios.nombre }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, id), eq(t.usuarios.rol, "duena"), eq(t.usuarios.activo, true))).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, id), eq(t.usuarios.activo, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(t.ventas).where(eq(t.ventas.barberiaId, id)),
    db.select({ t: sql<Date | null>`max(${t.historial.creadoEn})` }).from(t.historial).where(eq(t.historial.barberiaId, id)),
  ]);
  const activo = b.estadoCuenta === "activa";
  return (
    <>
      <CabezaSoporte titulo={b.nombre} />
      <section className="glass ficha-n">
        <div className="cab-ficha-n">
          <span className="mono">{identificador(b)}</span>
          <span className={`chip-p ${activo ? "si" : "alerta"}`}>{activo ? "Activo" : b.estadoCuenta}</span>
          {b.esPrueba && <span className="chip-p">Negocio de prueba</span>}
        </div>
        <div className="ficha-datos">
          <div><span>Propietario</span><b>{duena?.nombre ?? "Sin titular activo"}</b></div>
          <div><span>Usuarios</span><b>{cuentas.n} {cuentas.n === 1 ? "cuenta" : "cuentas"}</b></div>
          <div><span>Última actividad</span><b>{ultima?.t ? hace(ultima.t) : "Sin actividad"}</b></div>
          <div><span>Ventas registradas</span><b>{ventas.n} <Link className="enlace" href={`/soporte/negocios/${id}?ver=ventas`}>Consultar</Link></b></div>
        </div>
      </section>
      <nav className="chips-s grande" aria-label="Apartados">{PESTANAS.map(([k, v]) => <Link key={k} href={`/soporte/negocios/${id}?ver=${k}`} aria-current={ver === k ? "page" : undefined}>{v}</Link>)}</nav>
      {ver === "info" && <Info b={b} />}
      {ver === "info" && <EmpezarDeCero id={b.id} nombre={b.nombre} conteo={await conteoMovimientos(b.id)} />}
      {ver === "usuarios" && <Usuarios id={id} />}
      {ver === "config" && <Config b={b} />}
      {ver === "actividad" && <Actividad id={id} />}
      {ver === "ventas" && <Ventas b={b} />}
      {ver === "solicitudes" && <section className="glass panel-s"><ListaSolicitudes filas={await solicitudes({ negocioId: id, estado: "" })} vacio="Este negocio no ha enviado solicitudes." /></section>}
      {ver === "diagnostico" && <Diagnostico b={b} />}
      <p className="ayuda-txt">Consulta de solo lectura, salvo Empezar de cero. Para modificar la configuración o intervenir en una cuenta real se necesita un permiso específico y la autorización del propietario.</p>
    </>
  );
}

type Negocio = typeof t.barberias.$inferSelect;
const identificador = (b: Negocio) => `${b.folioPrefijo}-${b.id.slice(0, 5).toUpperCase()}`;
const $ = formatoDinero;
const si = (v: boolean) => (v ? "Sí" : "No");

function Filas({ filas }: { filas: [string, React.ReactNode][] }) {
  return <>{filas.map(([k, v]) => <div key={k} className="fila-d"><span>{k}</span><b>{v}</b></div>)}</>;
}

async function Info({ b }: { b: Negocio }) {
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  const [[mes], [cortes]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${t.ventas.total}), 0)::int` }).from(t.ventas)
      .where(and(eq(t.ventas.barberiaId, b.id), eq(t.ventas.estado, "pagada"), sql`to_char((${t.ventas.creadoEn} at time zone ${b.zonaHoraria})::date, 'YYYY-MM') = ${hoy.slice(0, 7)}`)),
    db.select({ ultimo: sql<string | null>`max(${t.turnosCaja.fechaOperativa})::text` }).from(t.turnosCaja).where(and(eq(t.turnosCaja.barberiaId, b.id), eq(t.turnosCaja.estado, "cerrado"))),
  ]);
  return (
    <section className="glass panel-s">
      <span className="lab">Información del negocio</span>
      <Filas filas={[
        ["Nombre", b.nombre], ["Identificador", <span key="i" className="mono">{b.id}</span>], ["Tipo", b.esPrueba ? "Negocio de prueba" : "Negocio real"],
        ["Estado de la cuenta", b.estadoCuenta], ["Plan", b.plan], ["Alta en la plataforma", fechaLarga(fechaLocal(b.creadoEn, b.zonaHoraria))],
        ["Zona horaria", b.zonaHoraria], ["Folios", `${b.folioPrefijo}, siguiente número ${b.siguienteFolio}`],
        ["Ventas de este mes", `${mes.n}, ${$(mes.total)}`], ["Último corte de caja", cortes.ultimo ? fechaLarga(cortes.ultimo) : "Sin cortes"],
      ]} />
    </section>
  );
}

async function Usuarios({ id }: { id: string }) {
  const [gente, puestos, sesiones] = await Promise.all([
    db.select({ u: t.usuarios, puesto: t.puestos.nombre }).from(t.usuarios).leftJoin(t.puestos, eq(t.puestos.id, t.usuarios.puestoId))
      .where(and(eq(t.usuarios.barberiaId, id), sql`${t.usuarios.usuario} not like 'BORRADO-%'`)),
    db.select().from(t.puestos).where(eq(t.puestos.barberiaId, id)),
    db.select({ id: t.sesiones.usuarioId, hasta: sql<Date>`max(${t.sesiones.expiraEn})` }).from(t.sesiones).groupBy(t.sesiones.usuarioId),
  ]);
  return (
    <>
      <section className="glass tabla-l">
        <span className="lab">Usuarios</span>
        <div className="desliza"><table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Puesto</th><th>Permisos aparte</th><th>Estado</th></tr></thead>
          <tbody>{gente.map(({ u, puesto }) => {
            const ses = sesiones.find((x) => x.id === u.id);
            const aparte = u.permisosExtra.length + u.permisosQuitados.length;
            return (
              <tr key={u.id} className={u.activo ? "" : "vacia"}>
                <td className="f">{u.nombre}</td><td className="mono">{u.usuario}</td><td>{puesto ?? NOMBRE_ROL[u.rol]}{u.esSoporte ? ", soporte" : ""}</td>
                <td>{aparte ? `${u.permisosExtra.length} dados, ${u.permisosQuitados.length} quitados` : "Ninguno"}</td>
                <td>{!u.activo ? "Desactivada" : u.debeCambiar ? "Debe cambiar contraseña" : ses && new Date(ses.hasta) > new Date() ? "Con sesión abierta" : "Sin sesión"}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
      <section className="glass panel-s">
        <span className="lab">Puestos personalizados</span>
        {puestos.length ? <Filas filas={puestos.map((p) => [p.nombre, `${p.permisos.length} permisos, parte de ${NOMBRE_ROL[p.plantilla]}${p.activo ? "" : ", desactivado"}`])} />
          : <p className="muted chico-t" style={{ margin: 0 }}>Usa solo las plantillas: Titular, Administrador, Barbero y Soporte técnico.</p>}
      </section>
    </>
  );
}

async function Config({ b }: { b: Negocio }) {
  const metodos = await db.select().from(t.metodosPago).where(eq(t.metodosPago.barberiaId, b.id)).orderBy(t.metodosPago.orden);
  return (
    <div className="mosaico-s">
      <section className="glass panel-s"><span className="lab">Cobros</span><Filas filas={[
        ["Formas de pago", metodos.filter((m) => m.activo).map((m) => m.nombre).join(", ") || "Ninguna"],
        ["Descuentos", b.usaDescuentos ? `Sí, hasta ${b.limiteDescuentoPct}% sin autorización` : "No"], ["Propinas", si(b.usaPropinas)], ["Dividir pago", si(b.usaDividirPago)],
      ]} /></section>
      <section className="glass panel-s"><span className="lab">Caja</span><Filas filas={[
        ["Modelo", b.modeloCaja], ["Apertura", b.aperturaManual ? "Manual" : "Automática"], ["Fondo sugerido", $(b.fondoPredeterminado)],
        ["Diferencia permitida", $(b.limiteDiferenciaCaja)], ["Cierre obligatorio", si(b.corteObligatorio)],
      ]} /></section>
      <section className="glass panel-s"><span className="lab">Metas</span><Filas filas={[["Metas", si(b.usaMetas)], ["Meta diaria", $(b.metaDiaria)], ["Meta mensual", $(b.metaMensual)]]} /></section>
      <section className="glass panel-s"><span className="lab">Egresos y equipo</span><Filas filas={[
        ["Comprobantes", si(b.usaComprobantes)], ["Periodicidad", si(b.usaPeriodicidad)], ["Métodos de egreso", b.metodosEgreso.join(", ")], ["Renta de silla", si(b.usaRentaSilla)],
      ]} /></section>
    </div>
  );
}

async function Actividad({ id }: { id: string }) {
  const filas = await db.select({ h: t.historial, quien: t.usuarios.nombre }).from(t.historial).leftJoin(t.usuarios, eq(t.usuarios.id, t.historial.usuarioId))
    .where(eq(t.historial.barberiaId, id)).orderBy(desc(t.historial.creadoEn)).limit(80);
  return (
    <section className="glass panel-s">
      {!filas.length ? <p className="muted vacio-s">Sin actividad registrada.</p> : (
        <div className="lista-s">{filas.map(({ h, quien }) => (
          <div key={h.id} className="fila-s plana"><span className="t-s"><b>{h.accion}</b><small>{quien ?? "Sistema"}</small></span><span className="meta-s"><span className="chip-p">{h.tipo}</span><small>{hace(h.creadoEn)}</small></span></div>
        ))}</div>
      )}
    </section>
  );
}

async function Ventas({ b }: { b: Negocio }) {
  const filas = await db.select({ v: t.ventas, quien: t.usuarios.nombre }).from(t.ventas).innerJoin(t.usuarios, eq(t.usuarios.id, t.ventas.registradaPor))
    .where(eq(t.ventas.barberiaId, b.id)).orderBy(desc(t.ventas.creadoEn)).limit(60);
  return (
    <section className="glass tabla-l">
      <span className="lab">Últimas 60 ventas</span>
      {!filas.length ? <p className="muted vacio-s">Sin ventas registradas.</p> : (
        <div className="desliza"><table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Registró</th><th>Estado</th><th>Total</th></tr></thead>
          <tbody>{filas.map(({ v, quien }) => (
            <tr key={v.id} className={v.estado === "cancelada" ? "vacia" : ""}><td className="f mono">{v.folio}</td>
              <td>{v.creadoEn.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: b.zonaHoraria })}</td>
              <td>{quien.split(" ")[0]}</td><td>{v.estado === "pagada" ? "Pagada" : "Cancelada"}</td><td className="tot">{$(v.total)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

/**
 * Diagnóstico de un negocio: si las ventas se guardaron, si hubo errores, quién hizo qué,
 * si hay problemas de permisos y si los datos están bien asociados. Solo lectura.
 */
async function Diagnostico({ b }: { b: typeof t.barberias.$inferSelect }) {
  const id = b.id;
  const hace7 = new Date(Date.now() - 7 * 864e5);
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  const [porDia, errores, actividad, gente, reglas, sesiones, [chk], turnosViejos] = await Promise.all([
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
          {errores.length ? errores.map(({ e, quien }) => <div key={e.id} className="error-s"><small>{hace(e.creadoEn)}, {e.ruta}{quien ? `, ${quien.split(" ")[0]}` : ""}</small><b className="error-tit">{resumenError(ocultarSensibles(e.mensaje))}</b><details className="error-det"><summary>Ver el mensaje técnico</summary><code>{ocultarSensibles(e.mensaje)}</code></details></div>)
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
    </>
  );
}
