import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { VentasPorBarbero } from "./VentasPorBarbero";
import { UltimosServicios } from "./UltimosServicios";
import { AvisoCajaEmergente } from "./AvisoCaja";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { cajaDe, diasConVentas, equipoQueAtiende, foliosCorte, metasDelMes, turnosCerrados, movimientosDeTurno, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, fechaLarga, fechaLocal, finDeMes, horaCorta, inicioDeMes, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
import { calcularMeta } from "@/lib/metas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { serieHoy, serieSemana, type Movimiento } from "@/lib/series";

type Q = { aviso?: string; error?: string; grafica?: string };
/** Misma altura y comportamiento de la gráfica para el administrador y el barbero. */
const ALTO_GRAFICA = 200;
type Sesion = Awaited<ReturnType<typeof requerirSesion>>;

/** "↗ 12% más que el martes pasado a esta hora" */
function Comparacion({ hoy, previo, dia }: { hoy: number; previo: number; dia: string }) {
  const v = cambio(hoy, previo);
  if (v === null) return <span className="pill gris">{hoy ? `El ${dia} pasado a esta hora no había ventas` : "Todavía no hay ventas hoy"}</span>;
  return <span className={`pill ${v >= 0 ? "ok" : "warn"}`}>{v >= 0 ? "↗" : "↘"} {Math.abs(v)}% {v >= 0 ? "más" : "menos"} que el {dia} pasado a esta hora</span>;
}

/** Al abrir: hoy si ya hay ventas hoy; si no, la semana; si tampoco, el mes. */
function modoIdeal(fechas: string[], hoy: string, lunes: string, inicioMes: string): "hoy" | "semana" | "mes" {
  if (fechas.includes(hoy)) return "hoy";
  if (fechas.some((f) => f >= lunes && f <= hoy)) return "semana";
  if (fechas.some((f) => f >= inicioMes && f <= hoy)) return "mes";
  return "hoy";
}

function SelectorGrafica({ modo, conMes }: { modo: "hoy" | "semana" | "mes"; conMes?: boolean }) {
  return (
    <nav className="seg chico" aria-label="Ver gráfica">
      <Link href="/?grafica=hoy" aria-current={modo === "hoy" ? "page" : undefined} scroll={false}>Hoy</Link>
      <Link href="/?grafica=semana" aria-current={modo === "semana" ? "page" : undefined} scroll={false}>Semana</Link>
      {conMes && <Link href="/?grafica=mes" aria-current={modo === "mes" ? "page" : undefined} scroll={false}>Mes</Link>}
    </nav>
  );
}

export default async function Inicio({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  // El aviso de corte pendiente: para quien ve todo, cualquier caja abierta; para el barbero, la suya.
  const turno = s.puede("reportes.ver") ? await turnoAbierto(s.barberia.id) : await cajaDe(s);
  const avisos = (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      {turno && turno.fechaOperativa < hoy && s.puede("reportes.ver") && (
        <div className="alerta-caja subir">
          <span className="icono-alerta grande"><Icono n="reloj" /></span>
          <span><b>Tienes un corte de caja pendiente</b><small>La jornada del {fechaLarga(turno.fechaOperativa).toLowerCase()} aún no se ha cerrado. Realiza el corte para registrar el efectivo y finalizar el día.</small></span>
          <Link className="bt chico solo" href="/cobrar?caja=cerrar"><Icono n="candado" />Realizar corte de caja</Link>
        </div>
      )}
      {turno && turno.fechaOperativa < hoy && s.barberia.corteObligatorio && !s.puede("reportes.ver") && s.puede("caja.operar") && <AvisoCajaEmergente dia={fechaLarga(turno.fechaOperativa).toLowerCase()} />}
    </>
  );
  if (!s.puede("reportes.ver")) return <InicioBarbero s={s} hoy={hoy} zona={zona} q={q} avisos={avisos} />;

  const lunes = lunesDe(hoy);
  const [{ ventas }, equipo, historia] = await Promise.all([
    ventasEntre(s.barberia.id, inicioDeMes(sumarDias(inicioDeMes(hoy), -1)) < sumarDias(hoy, -35) ? inicioDeMes(sumarDias(inicioDeMes(hoy), -1)) : sumarDias(hoy, -35), hoy, { zona }),
    equipoQueAtiende(s.barberia.id),
    diasConVentas(s.barberia.id, zona),
  ]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const movs: Movimiento[] = pagadas.map((v) => ({ creadoEn: v.creadoEn, fecha: v.fecha, monto: v.total }));
  const deHoy = pagadas.filter((v) => v.fecha === hoy);
  const netas = deHoy.reduce((a, v) => a + v.total, 0);
  const servicios = deHoy.reduce((a, v) => a + v.conceptos.length, 0);
  const limite = Date.now() - 7 * 86400000;
  const previoMismaHora = pagadas.filter((v) => v.fecha === sumarDias(hoy, -7) && v.creadoEn.getTime() <= limite).reduce((a, v) => a + v.total, 0);
  // Al abrir: si ya hay ventas hoy se ve el día; si no, la semana. Se puede cambiar a Hoy, Semana o Mes.
  const inicioMes = inicioDeMes(hoy);
  const modo = q.grafica === "hoy" || q.grafica === "semana" || q.grafica === "mes" ? q.grafica : modoIdeal(pagadas.map((v) => v.fecha), hoy, lunes, inicioMes);
  const diasMes = Array.from({ length: Number(finDeMes(hoy).slice(8)) }, (_, i) => sumarDias(inicioMes, i));
  const mesAnt = inicioDeMes(sumarDias(inicioMes, -1));
  const totalDe = (f: string) => movs.filter((m) => m.fecha === f).reduce((x, m) => x + m.monto, 0);
  const serie = modo === "hoy" ? serieHoy(movs, hoy, zona)
    : modo === "semana" ? { ...serieSemana(movs, lunes, hoy), enCurso: diasEntre(lunes, hoy) }
    : { actual: diasMes.map((d) => (d <= hoy ? totalDe(d) : null)), previo: diasMes.map((_, i) => totalDe(sumarDias(mesAnt, i))), etiquetas: diasMes.map((d) => String(Number(d.slice(8)))), cada: 5, enCurso: diasMes.indexOf(hoy) };
  // Total y comparación del periodo elegido, contra el mismo tramo del periodo anterior.
  const tramo = modo === "semana" ? { desde: lunes, prev: sumarDias(lunes, -7), n: diasEntre(lunes, hoy) } : { desde: inicioMes, prev: mesAnt, n: diasEntre(inicioMes, hoy) };
  const totalPeriodo = modo === "hoy" ? netas : pagadas.filter((v) => v.fecha >= tramo.desde && v.fecha <= hoy).reduce((a, v) => a + v.total, 0);
  const previoPeriodo = modo === "hoy" ? previoMismaHora : pagadas.filter((v) => v.fecha >= tramo.prev && v.fecha <= sumarDias(tramo.prev, tramo.n)).reduce((a, v) => a + v.total, 0);
  const varPeriodo = cambio(totalPeriodo, previoPeriodo);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  // Con meta mensual del negocio, la meta del día es la suma de lo que le toca a cada barbero.
  const delMes = await metasDelMes(s.barberia.id, s.barberia.metaMensual, zona, hoy);
  const meta = delMes ? { monto: Math.max(delMes.diaria, 1), origen: "asignada" as const } : calcularMeta(s.barberia.metaDiaria, [7, 14, 21, 28].map((d) => pagadas.filter((v) => v.fecha === sumarDias(hoy, -d)).reduce((a, v) => a + v.total, 0)));
  const avance = Math.min(netas / meta.monto, 1);
  const recientes = ventas.slice(0, 10);

  return (
    <>
      {avisos}
      <div className="subir">
        <span className="lab">{fechaLarga(hoy)}</span>
        <h1 className="titulo brillo" style={{ fontSize: 30, marginTop: 8 }}>Hola, {s.usuario.nombre.split(" ")[0]}</h1>
      </div>
      <section className="inicio-b">
        <div className="hero-sin subir d1">
          <span className="lab">{modo === "hoy" ? "Ventas de hoy" : modo === "semana" ? "Ventas de la semana" : "Ventas del mes"}</span>
          <div className="big big-ini"><Cuenta valor={totalPeriodo} /></div>
          <div className="entre" style={{ marginTop: 10 }}><span>{modo === "hoy" ? <Comparacion hoy={netas} previo={previoMismaHora} dia={dia} />
            : varPeriodo === null ? <span className="pill gris">Sin registros en el periodo anterior</span>
            : <span className={`pill ${varPeriodo >= 0 ? "ok" : "warn"}`}>{varPeriodo >= 0 ? "↗" : "↘"} {Math.abs(varPeriodo)}% {varPeriodo >= 0 ? "más" : "menos"} que {modo === "semana" ? "la semana pasada" : "el mes pasado"} a estas alturas</span>}</span><SelectorGrafica modo={modo} conMes /></div>
          <div className="pila-chica" style={{ marginTop: 16 }}>
            <span className="fila" style={{ gap: 16, fontSize: 12 }}>
              <span className="fila" style={{ gap: 6 }}><i className="ley-l" />{modo === "hoy" ? "Hoy" : modo === "semana" ? "Esta semana" : "Este mes"}</span>
              <span className="fila muted" style={{ gap: 6 }}><i className="ley-p" />{modo === "hoy" ? `El ${dia} pasado` : modo === "semana" ? "La semana pasada" : "El mes pasado"}</span>
            </span>
            <Grafica key={modo} id={`inicio-${modo}`} actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={ALTO_GRAFICA} enCurso={serie.enCurso}
              puntos={modo !== "hoy"} globos={serie.actual.map((v, i) => (v === null ? null : [modo === "hoy" ? `A las ${serie.etiquetas[i]}` : modo === "semana" ? nombreDia(new Date(`${sumarDias(lunes, i)}T12:00:00Z`).getUTCDay()) : `${serie.etiquetas[i]} de ${fechaLarga(hoy).split(" ").pop()}`, formatoDinero(v), modo === "hoy" ? "acumulado" : ""] as [string, string, string]))}
              descripcion={modo === "hoy" ? "Ventas acumuladas de hoy por hora contra el mismo día de la semana pasada" : modo === "semana" ? "Ventas por día de esta semana contra la semana pasada" : "Ventas por día de este mes contra el mes pasado"}
              vacio="Aquí se dibujarán las ventas en cuanto se cobre la primera" />
          </div>
        </div>
        <div className="glass panel subir d2">
          <span className="lab">Hoy</span>
          <div className="datos">
            <div><span>Clientes atendidos</span><b><Cuenta valor={deHoy.length} formato="entero" /></b></div>
            <div><span>Servicios</span><b><Cuenta valor={servicios} formato="entero" /></b></div>
            <div><span>Promedio por cliente</span><b>{deHoy.length ? formatoDinero(Math.round(netas / deHoy.length)) : "Sin datos"}</b></div>
            {s.barberia.usaMetas && <div className="meta-hoy">
              <div className="entre"><span>{delMes ? "Meta del día, todo el equipo" : "Meta diaria"}</span><b className="num">{formatoDinero(meta.monto)}</b></div>
              <div className="pista-meta"><i style={{ width: `${Math.min(avance * 100, 100)}%` }} /></div>
              <div className="entre"><small className="muted">{porcentaje(netas, meta.monto)}% alcanzado</small>{delMes && <small className="muted">Meta del mes {formatoDinero(s.barberia.metaMensual)}</small>}</div>
              {delMes && delMes.porBarbero.filter((b) => b.aplica).length > 0 && (
                <div className="metas-eq">
                  {delMes.porBarbero.filter((b) => b.aplica).map((b) => <span key={b.id}>{b.nombre.split(" ")[0]}<b className="num">{formatoDinero(b.diaria)}</b></span>)}
                </div>
              )}
            </div>}
          </div>
        </div>
      </section>

      <section className="tira subir d3">
        <span className="lab">Equipo hoy</span>
        {equipo.length === 0 && <span className="muted">Todavía no hay barberos dados de alta.</span>}
        {equipo.map((e) => {
          const cs = deHoy.flatMap((v) => v.conceptos.filter((c) => c.barberoId === e.id));
          const monto = cs.reduce((a, c) => a + c.precioCobrado, 0);
          return (
            <div key={e.id} className="persona">
              <Avatar avatar={e.avatar} nombre={e.nombre} t={42} />
              <span><b style={{ fontWeight: 600 }}>{e.nombre.split(" ")[0]}</b><small>{cs.length ? `${cs.length} ${cs.length === 1 ? "servicio" : "servicios"}, ${formatoDinero(monto)}` : "Sin servicios"}</small></span>
            </div>
          );
        })}
      </section>

      <section className="ultimos-s subir d3">
        <div className="entre">
          <h2 className="sub-t">Últimos servicios</h2>
          {s.puede("ventas.ver_todas") && <Link className="bt-ver" href="/analitica/ventas">Ver todas las ventas<span><Icono n="derecha" /></span></Link>}
        </div>
        <UltimosServicios filas={recientes.map((v) => {
          const quien = equipo.find((e) => e.id === v.conceptos[0]?.barberoId);
          return {
            id: v.id, folio: v.folio, cancelada: v.estado === "cancelada", monto: formatoDinero(v.total),
            t: v.fecha === hoy ? horaCorta(v.creadoEn, zona) : v.fecha === sumarDias(hoy, -1) ? "Ayer" : `${v.fecha.slice(8)}/${v.fecha.slice(5, 7)}`,
            servicios: v.conceptos.map((c) => c.nombre).join(", "), quien: v.conceptos[0]?.barbero ?? "", avatar: quien?.avatar ?? "iniciales",
            metodo: v.pagos.map((pg) => pg.metodo).join(" y ").toLowerCase() || "sin pago",
            detalle: [
              ["Servicios", v.conceptos.map((c) => `${c.nombre} con ${c.barbero.split(" ")[0]}, ${formatoDinero(c.precioCobrado)}`).join("; ")],
              ...(v.conceptos.some((c) => c.descuento) ? [["Descuento", v.conceptos.filter((c) => c.descuento).map((c) => `${formatoDinero(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
              ...(v.propinas.length ? [["Propina", v.propinas.map((x) => formatoDinero(x.monto)).join(" y ")] as [string, string]] : []),
              ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(pg.monto)}`).join(" y ") || "Sin pago"],
              ["Registró", v.registradaPor.split(" ")[0]],
              ["Cuándo", `${fechaLarga(v.fecha)}, ${horaCorta(v.creadoEn, zona)}`],
              ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
            ] as [string, string][],
          };
        })} />
      </section>
    </>
  );
}

async function InicioBarbero({ s, hoy, zona, q, avisos }: { s: Sesion; hoy: string; zona: string; q: Q; avisos: React.ReactNode }) {
  const yo = s.usuario.id;
  const lunes = lunesDe(hoy);
  const [{ ventas }, [u], historia] = await Promise.all([
    ventasEntre(s.barberia.id, inicioDeMes(sumarDias(inicioDeMes(hoy), -1)) < sumarDias(lunes, -28) ? inicioDeMes(sumarDias(inicioDeMes(hoy), -1)) : sumarDias(lunes, -28), hoy, { barberoId: yo, zona }),
    db.select({ meta: schema.usuarios.metaSemanal }).from(schema.usuarios).where(eq(schema.usuarios.id, yo)),
    diasConVentas(s.barberia.id, zona, yo),
  ]);
  const mios = ventas.filter((v) => v.estado === "pagada").flatMap((v) =>
    v.conceptos.filter((c) => c.barberoId === yo).map((c) => ({ ...c, fecha: v.fecha, creadoEn: v.creadoEn, metodos: v.pagos.map((p) => p.metodo.toLowerCase()) })));
  const movs: Movimiento[] = mios.map((c) => ({ creadoEn: c.creadoEn, fecha: c.fecha, monto: c.precioCobrado }));
  const deHoy = mios.filter((c) => c.fecha === hoy);
  const recientes = [...mios].sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime()).slice(0, 10);
  // Las ventas de todo el equipo en el periodo de la gráfica, para ver cuánto lleva cada barbero.
  const inicioMesEq = inicioDeMes(hoy);
  const [{ ventas: todas }, gente] = await Promise.all([
    ventasEntre(s.barberia.id, inicioMesEq < lunes ? inicioMesEq : lunes, hoy, { zona }),
    equipoQueAtiende(s.barberia.id),
  ]);
  const totalHoy = deHoy.reduce((a, c) => a + c.precioCobrado, 0);
  const semana = mios.filter((c) => c.fecha >= lunes).reduce((a, c) => a + c.precioCobrado, 0);
  const limite = Date.now() - 7 * 86400000;
  const previo = mios.filter((c) => c.fecha === sumarDias(hoy, -7) && c.creadoEn.getTime() <= limite).reduce((a, c) => a + c.precioCobrado, 0);
  // Al abrir: si ya hay ventas hoy se ve el día; si no, la semana. Se puede cambiar a Hoy, Semana o Mes.
  void historia;
  const inicioMes = inicioDeMes(hoy);
  const modo = q.grafica === "hoy" || q.grafica === "semana" || q.grafica === "mes" ? q.grafica : modoIdeal(mios.map((c) => c.fecha), hoy, lunes, inicioMes);
  const diasMes = Array.from({ length: Number(finDeMes(hoy).slice(8)) }, (_, i) => sumarDias(inicioMes, i));
  const mesAnt = inicioDeMes(sumarDias(inicioMes, -1));
  const totalDe = (f: string) => movs.filter((m) => m.fecha === f).reduce((x, m) => x + m.monto, 0);
  const serie = modo === "hoy" ? serieHoy(movs, hoy, zona) : modo === "semana" ? serieSemana(movs, lunes, hoy)
    : { actual: diasMes.map((d) => (d <= hoy ? totalDe(d) : null)), previo: diasMes.map((_, i) => totalDe(sumarDias(mesAnt, i))), etiquetas: diasMes.map((d) => String(Number(d.slice(8)))), cada: 5 };
  const semanas = [1, 2, 3, 4].map((k) => {
    const l = sumarDias(lunes, -7 * k);
    return mios.filter((c) => c.fecha >= l && c.fecha <= sumarDias(l, 6)).reduce((a, c) => a + c.precioCobrado, 0);
  });
  // Su meta diaria sale de la meta mensual del negocio; la semana son seis días de trabajo.
  const delMes = u?.meta ? null : await metasDelMes(s.barberia.id, s.barberia.metaMensual, zona, hoy);
  const mia = delMes?.porBarbero.find((x) => x.id === yo);
  const meta = mia?.aplica ? { monto: Math.max(mia.diaria * 6, 1), origen: "asignada" as const } : calcularMeta(u?.meta ?? 0, semanas);
  const metaHoy = mia?.aplica ? mia.diaria : Math.round(meta.monto / 6);
  // En su cuenta, el barbero ve solo su meta del día.
  const enHoy = true;
  const avance = Math.min((enHoy ? totalHoy : semana) / (enHoy ? Math.max(metaHoy, 1) : meta.monto), 1);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  // Ventas por barbero en el periodo de la gráfica (datos del equipo, visibles para todos).
  const desdeEq = modo === "hoy" ? hoy : modo === "semana" ? lunes : inicioMes;
  const delPeriodo = todas.filter((v) => v.estado === "pagada" && v.fecha >= desdeEq).flatMap((v) => v.conceptos);
  const porBarbero = gente.map((g) => {
    const cs = delPeriodo.filter((c) => c.barberoId === g.id);
    return { id: g.id, nombre: g.nombre, avatar: g.avatar, servicios: cs.length, monto: cs.reduce((a, c) => a + c.precioCobrado, 0) };
  }).sort((a, b) => b.monto - a.monto);
  // Últimos servicios: los suyos, con el mismo formato que ven los demás puestos.
  const ultimosPropios = ventas.slice(0, 10).map((v) => {
    const cs = v.conceptos.filter((c) => c.barberoId === yo);
    const propio = (cs.length ? cs : v.conceptos);
    return {
      id: v.id, folio: v.folio, cancelada: v.estado === "cancelada", monto: formatoDinero(propio.reduce((a, c) => a + c.precioCobrado, 0)),
      t: v.fecha === hoy ? horaCorta(v.creadoEn, zona) : v.fecha === sumarDias(hoy, -1) ? "Ayer" : `${v.fecha.slice(8)}/${v.fecha.slice(5, 7)}`,
      servicios: propio.map((c) => c.nombre).join(", "), quien: s.usuario.nombre, avatar: s.usuario.avatar,
      metodo: v.pagos.map((pg) => pg.metodo).join(" y ").toLowerCase() || "sin pago",
      detalle: [
        ["Servicios", propio.map((c) => `${c.nombre}, ${formatoDinero(c.precioCobrado)}`).join("; ")],
        ...(propio.some((c) => c.descuento) ? [["Descuento", propio.filter((c) => c.descuento).map((c) => `${formatoDinero(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
        ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(pg.monto)}`).join(" y ") || "Sin pago"],
        ["Registró", v.registradaPor.split(" ")[0]],
        ["Cuándo", `${fechaLarga(v.fecha)}, ${horaCorta(v.creadoEn, zona)}`],
        ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
      ] as [string, string][],
    };
  });

  return (
    <>
      {avisos}
      <div className="subir">
        <span className="lab">{fechaLarga(hoy)}</span>
        <h1 className="titulo brillo" style={{ fontSize: 30, marginTop: 8 }}>Hola, {s.usuario.nombre.split(" ")[0]}</h1>
      </div>
      <section className="inicio-b">
        <div className="hero-sin subir d1" style={{ display: "grid", gap: 14 }}>
          <div className="entre" style={{ alignItems: "flex-end" }}>
            <div><span className="lab">Hoy llevas</span><div className="big big-ini"><Cuenta valor={totalHoy} /></div></div>
            <div style={{ textAlign: "right" }}><span className="lab">Servicios</span><span className="fig" style={{ fontSize: 30 }}><Cuenta valor={deHoy.length} formato="entero" /></span></div>
          </div>
          <div className="entre"><Comparacion hoy={totalHoy} previo={previo} dia={dia} /><SelectorGrafica modo={modo} conMes /></div>
          <Grafica id={`barbero-${modo}`} actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={ALTO_GRAFICA}
            enCurso={"enCurso" in serie ? (serie.enCurso as number | undefined) : undefined}
            globos={serie.actual.map((v, i) => (v === null ? null : [modo === "hoy" ? `A las ${serie.etiquetas[i]}` : modo === "semana" ? nombreDia(new Date(`${sumarDias(lunes, i)}T12:00:00Z`).getUTCDay()) : `${serie.etiquetas[i]} de ${fechaLarga(hoy).split(" ").pop()}`, formatoDinero(v), modo === "hoy" ? "acumulado" : ""] as [string, string, string]))}
            descripcion={modo === "hoy" ? "Tus ventas de hoy por hora" : modo === "semana" ? "Tus ventas de la semana" : "Tus ventas del mes"} puntos={modo !== "hoy"} key={modo} vacio="Tu gráfica se dibuja con tu primer servicio" />
          {s.barberia.usaMetas ? <div className="pila-chica">
            <div className="entre">
              <span className="muted" style={{ fontSize: 13 }}>{enHoy ? "Meta de hoy" : "Meta de la semana"}: <b style={{ color: "var(--fg)" }}>{formatoDinero(enHoy ? metaHoy : meta.monto)}</b><Ayuda titulo={enHoy ? "Meta de hoy" : "Meta de la semana"}>{mia?.aplica ? "Sale de la meta mensual del negocio y de tu forma de pago." : "Refleja tu meta de ventas y cuánto llevas de ella."}</Ayuda></span>
              <b className="num">{porcentaje(enHoy ? totalHoy : semana, enHoy ? Math.max(metaHoy, 1) : meta.monto)}%</b>
            </div>
            <div className="meta grande"><i style={{ width: `${Math.max(avance * 100, 3)}%` }} /></div>
            <small className="muted">Llevas {formatoDinero(enHoy ? totalHoy : semana)} {enHoy ? "hoy" : "esta semana"}.</small>
          </div> : <small className="muted">Llevas {formatoDinero(semana)} esta semana.</small>}
        </div>
        <div className="glass panel subir d2">
          <div className="entre">
            <span className="lab">Ventas por barbero</span>
            <span className="muted" style={{ fontSize: 12 }}>{modo === "hoy" ? "Hoy" : modo === "semana" ? "Esta semana" : "Este mes"}</span>
          </div>
          <VentasPorBarbero filas={porBarbero} yo={yo} />
        </div>
      </section>

      <section className="ultimos-s subir d3">
        <div className="entre">
          <h2 className="sub-t">Últimos servicios</h2>
          <Link className="bt-ver" href="/analitica/ventas">Ver todas las ventas<span><Icono n="derecha" /></span></Link>
        </div>
        <UltimosServicios filas={ultimosPropios} />
      </section>
    </>
  );
}
