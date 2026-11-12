import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { asentarCitasPagadas } from "@/lib/pagos";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { cajaDe, equipoQueAtiende, metasDelMes, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
import { calcularMeta } from "@/lib/metas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { serieHoy, type Movimiento } from "@/lib/series";
import { AccionesEscritorio, AccionesMovil, type AccionInicio, type Acciones } from "./AccionesInicio";
import { AvisoCajaEmergente } from "./AvisoCaja";
import { RefrescarConVentas } from "./RefrescarConVentas";
import { UltimosServicios, type FilaUltimo } from "./UltimosServicios";
import { verificadosDe, type Verificado } from "@/lib/pagos";
import { Pendientes } from "./Pendientes";
import { pendientesDe, type Pendiente } from "./pendientes";

type Q = { aviso?: string; error?: string };
type Sesion = Awaited<ReturnType<typeof requerirSesion>>;
type Turno = Awaited<ReturnType<typeof turnoAbierto>>;
type Venta = Awaited<ReturnType<typeof ventasEntre>>["ventas"][number];
type Gente = Awaited<ReturnType<typeof equipoQueAtiende>>;

/** "12% más que el martes pasado a esta hora", en texto, sin colores de alarma. */
function comparacion(hoy: number, previo: number, dia: string) {
  const v = cambio(hoy, previo);
  if (v === null) return hoy ? `El ${dia} pasado a esta hora no había ventas` : "Todavía no hay ventas hoy";
  return `${Math.abs(v)}% ${v >= 0 ? "más" : "menos"} que el ${dia} pasado a esta hora`;
}

/** Lo último cobrado, con su detalle al tocarlo. */
function filasUltimos(ventas: Venta[], gente: Gente, hoy: string, zona: string, ver: Map<string, Verificado>): FilaUltimo[] {
  return ventas.map((v) => {
    const quien = gente.find((e) => e.id === v.conceptos[0]?.barberoId);
    const st = ver.get(v.id);
    return {
      verificado: st ? (st.estado === "reembolsado" ? "devuelto" : "si") : undefined,
      id: v.id, folio: v.folio, cancelada: v.estado === "cancelada", monto: formatoDinero(v.total),
      t: v.fecha === hoy ? horaCorta(v.creadoEn, zona) : v.fecha === sumarDias(hoy, -1) ? "Ayer" : `${v.fecha.slice(8)}/${v.fecha.slice(5, 7)}`,
      servicios: v.conceptos.map((c) => c.nombre).join(", "), quien: v.conceptos[0]?.barbero ?? "", avatar: quien?.avatar ?? "iniciales",
      metodo: v.pagos.map((pg) => pg.metodo).join(" y ").toLowerCase() || "sin pago",
      detalle: [
        ["Servicios", v.conceptos.map((c) => `${c.nombre} con ${c.barbero.split(" ")[0]}, ${formatoDinero(c.precioCobrado)}`).join("; ")],
        ...(v.conceptos.some((c) => c.descuento) ? [["Descuento", v.conceptos.filter((c) => c.descuento).map((c) => `${formatoDinero(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
        ...(v.propinas.length ? [["Propina", v.propinas.map((x) => formatoDinero(x.monto)).join(" y ")] as [string, string]] : []),
        ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(pg.monto)}`).join(" y ") || "Sin pago"],
        ...(st ? [["Verificado por Stripe", `${st.estado === "reembolsado" ? "Pago devuelto al cliente" : "Pago confirmado"}${st.tarjeta ? `, ${st.tarjeta}` : ""}${st.referencia ? `, referencia ${st.referencia}` : ""}`] as [string, string]] : []),
        ["Registró", v.registradaPor.split(" ")[0]],
        ["Cuándo", `${fechaLarga(v.fecha)}, ${horaCorta(v.creadoEn, zona)}`],
        ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
      ] as [string, string][],
    };
  });
}

/** Citas de hoy que todavía no llegan (de todo el negocio o de una persona). */
async function porLlegar(s: Sesion, hoy: string, zona: string, persona?: string) {
  if (!s.barberia.usaCitas || !s.puede("citas.ver")) return null;
  const filas = await db.select({ id: schema.citas.id, inicio: schema.citas.inicio, cliente: schema.citas.clienteNombre, servicios: schema.citas.servicios, barbero: schema.usuarios.nombre, indiferente: schema.citas.indiferente })
    .from(schema.citas).innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
    .where(and(eq(schema.citas.barberiaId, s.barberia.id), sql`(${schema.citas.inicio} at time zone ${zona})::date = ${hoy}::date`, gt(schema.citas.inicio, new Date()),
      or(eq(schema.citas.estado, "en_espera"), and(eq(schema.citas.estado, "apartada"), gt(schema.citas.expiraEn, new Date()))),
      ...(persona ? [eq(schema.citas.barberoId, persona)] : [])))
    .orderBy(asc(schema.citas.inicio));
  return filas.map((c) => ({ id: c.id, hora: horaCorta(c.inicio, zona), cliente: c.cliente, con: c.barbero.split(" ")[0], servicio: c.servicios.map((x) => x.nombre).join(" y ") }));
}

/**
 * Acciones rápidas según los permisos, en el orden que más usa cada rol. Cada persona puede reordenarlas u ocultarlas.
 * Cada una abre una pantalla que ya existe.
 */
async function accionesDe(s: Sesion, turno: Turno | null | undefined, hoy: string, zona: string, citasHoy: number | null, barbero: boolean): Promise<Acciones> {
  const yo = s.usuario.id;
  const corteAtrasado = !!turno && turno.fechaOperativa < hoy;
  const todas: (AccionInicio & { ok: boolean })[] = [
    { k: "cobrar", href: "/cobrar", texto: "Cobrar", corto: "Cobrar", icono: "cobro", principal: true, dato: turno ? `Caja abierta desde ${horaCorta(turno.abiertoEn, zona)}` : "Abre la caja al cobrar", ok: s.puede("ventas.registrar") || s.puede("ventas.registrar_otros") },
    { k: "mias", href: `/citas?vista=lista&persona=${yo}`, texto: "Mis citas de hoy", corto: "Mis citas", icono: "reloj", dato: citasHoy ? `${citasHoy} por llegar` : "Sin pendientes", ok: barbero && citasHoy !== null },
    { k: "corte", href: "/cobrar?caja=cerrar", texto: "Realizar corte de caja", corto: "Corte", icono: "candado", aviso: corteAtrasado, dato: corteAtrasado ? "Pendiente" : turno ? undefined : "Caja cerrada", ok: s.puede("caja.operar") && !!turno },
    { k: "retiro", href: "/cobrar?caja=retiro", texto: "Registrar retiro de caja", corto: "Retiro", icono: "salida", ok: s.puede("caja.retiros") && !!turno },
    { k: "cita", href: "/citas?nueva=1", texto: "Agendar cita a cliente", corto: "Nueva cita", icono: "calendario", dato: !barbero && citasHoy ? `${citasHoy} por llegar` : undefined, ok: s.barberia.usaCitas && s.puede("citas.modificar") },
    { k: "egreso", href: "/analitica/finanzas?egreso=1", texto: "Registrar un egreso", corto: "Egreso", icono: "archivo", ok: s.puede("gastos.registrar") },
    { k: "pago", href: "/equipo?pagar=1", texto: "Registrar pago o comisión", corto: "Pago al equipo", icono: "efectivo", ok: s.puede("equipo.pagar") },
    { k: "ventas", href: "/analitica/ventas", texto: barbero ? "Ver mis ventas" : "Ver ventas", corto: barbero ? "Mis ventas" : "Ventas", icono: "lista", ok: true },
    { k: "historial", href: "/equipo/pagos", texto: "Ver historial de pagos", corto: "Historial de pagos", icono: "historial", ok: s.puede("equipo.pagar") || s.puede("equipo.autorizar") },
    { k: "correccion", href: "/analitica/cortes", texto: "Corregir un corte de caja", corto: "Corregir corte", icono: "editar", ok: s.puede("caja.corregir") && s.puede("cortes.ver") },
    { k: "resenas", href: "/clientes/resenas", texto: "Ver reseñas", corto: "Reseñas", icono: "estrella", ok: s.barberia.usaCitas || s.puede("resenas.responder") },
  ];
  // Orden sugerido por rol: lo del día a día primero.
  const PRIORIDAD: Record<string, string[]> = {
    barbera: ["cobrar", "mias", "cita", "ventas", "resenas", "retiro", "corte"],
    encargada: ["cobrar", "corte", "retiro", "cita", "egreso", "ventas", "pago", "correccion", "historial", "resenas"],
    otro: ["cobrar", "corte", "egreso", "pago", "ventas", "cita", "retiro", "correccion", "historial", "resenas"],
  };
  const base = PRIORIDAD[barbero ? "barbera" : s.usuario.rol === "encargada" ? "encargada" : "otro"];
  const rango = (k: string) => { const i = base.indexOf(k); return i < 0 ? 99 : i; };
  const disponibles = todas.filter((x) => x.ok).sort((a, b) => rango(a.k) - rango(b.k)).map(({ ok: _, ...x }) => x);
  const [u] = await db.select({ pref: schema.usuarios.accionesRapidas }).from(schema.usuarios).where(eq(schema.usuarios.id, yo)).limit(1);
  const pref = u?.pref;
  const ordenadas = pref?.orden.length
    ? [...disponibles].sort((a, b) => { const ia = pref.orden.indexOf(a.k), ib = pref.orden.indexOf(b.k); return (ia < 0 ? 100 + rango(a.k) : ia) - (ib < 0 ? 100 + rango(b.k) : ib); })
    : disponibles;
  const ocultas = new Set(pref?.ocultas ?? []);
  // Citas que llegaron por la página de reservaciones o ya se pagaron: van primero mientras haya alguna por venir.
  const reservadas = s.barberia.usaCitas && s.puede("citas.ver") ? await db.select({ inicio: schema.citas.inicio, pagado: schema.citas.pagado })
    .from(schema.citas).where(and(eq(schema.citas.barberiaId, s.barberia.id), gt(schema.citas.inicio, new Date()), eq(schema.citas.estado, "en_espera"),
      or(eq(schema.citas.origen, "linea"), gt(schema.citas.pagado, 0)), ...(barbero ? [eq(schema.citas.barberoId, yo)] : [])))
    .orderBy(asc(schema.citas.inicio)).limit(50) : [];
  const nPagadas = reservadas.filter((x) => x.pagado > 0).length;
  const fija: AccionInicio[] = reservadas.length ? [{
    k: "reservadas", href: `/citas?vista=lista&dia=${fechaLocal(reservadas[0].inicio, zona)}`, icono: "calendario",
    texto: nPagadas ? "Citas reservadas y pagadas" : "Citas reservadas en línea", corto: "Reservadas",
    dato: [`${reservadas.length} ${reservadas.length === 1 ? "próxima" : "próximas"}`, nPagadas ? `${nPagadas} ${nPagadas === 1 ? "pagada" : "pagadas"}` : ""].filter(Boolean).join(", "),
  }] : [];
  return { visibles: [...fija, ...ordenadas.filter((x) => !ocultas.has(x.k))], todas: ordenadas.map((x) => ({ k: x.k, texto: x.texto, icono: x.icono, oculta: ocultas.has(x.k), fija: x.k === "cobrar" })), sugerido: disponibles.map((x) => x.k) };
}

type Vista = {
  s: Sesion; hoy: string; zona: string; avisos: React.ReactNode; acciones: Acciones; barbero: boolean;
  total: number; servicios: number; clientes: number; previo: number; movs: Movimiento[];
  meta: { monto: number; ayuda?: string; nota?: string } | null;
  citas: Awaited<ReturnType<typeof porLlegar>>;
  pendientes: Pendiente[];
  equipo: { id: string; nombre: string; avatar: string; monto: number; servicios: number; meta?: number }[];
  ultimos: FilaUltimo[]; verMas: { href: string; texto: string } | null; verVentas: boolean;
};

/** Inicio: qué pasa hoy. Escritorio: acciones junto al saludo, la tarjeta de hoy con su gráfica y a la derecha citas y equipo. */
function InicioVista(v: Vista) {
  const { s, hoy, zona } = v;
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  const serie = serieHoy(v.movs, hoy, zona);
  const pct = v.meta ? porcentaje(v.total, v.meta.monto) : 0;
  const barra = v.meta ? <div className="ini-meta" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label="Avance de la meta"><i style={{ width: `${Math.max(Math.min(pct, 100), 2)}%` }} /></div> : null;
  const siguiente = v.citas?.[0];
  const listaEquipo = v.equipo.length ? v.equipo.map((e) => (
    <div key={e.id} className="ini-eq">
      <Avatar avatar={e.avatar} nombre={e.nombre} t={28} />
      <span>{e.nombre.split(" ")[0]}{e.id === s.usuario.id && v.barbero && <small className="muted"> (tú)</small>}</span>
      <span className="ini-eq-m"><b>{formatoDinero(e.monto)}</b>{e.meta ? <small className="muted">meta del día {formatoDinero(e.meta)}</small> : e.servicios ? <small className="muted">{e.servicios} {e.servicios === 1 ? "servicio" : "servicios"}</small> : null}</span>
    </div>
  )) : <p className="muted ini-vacio">Todavía no hay personas que atiendan.</p>;
  return (
    <>
      {v.avisos}
      <RefrescarConVentas />
      <div className="ini-cab subir">
        <div className="saludo-i">
          <span className="lab">{fechaLarga(hoy)}</span>
          <h1 className="titulo brillo">Hola, {s.usuario.nombre.split(" ")[0]}</h1>
        </div>
        <AccionesEscritorio acciones={v.acciones.visibles} personalizar={v.acciones} />
      </div>

      {/* Teléfono */}
      <section className="glass ini-hoy-m solo-movil subir d1">
        <div className="entre">
          <span><span className="lab">{v.barbero ? "Hoy llevas" : "Hoy llevan"}</span><b className="ini-big"><Cuenta valor={v.total} /></b></span>
          <span className="ini-dato">{v.servicios} {v.servicios === 1 ? "servicio" : "servicios"}<br />
            {v.meta ? <><b>{pct}%</b> de {v.barbero ? "tu meta" : "la meta"}</> : <><b>{v.clientes ? formatoDinero(Math.round(v.total / v.clientes)) : "$0"}</b> por cliente</>}</span>
        </div>
        {barra}
      </section>
      <Pendientes items={v.pendientes} className="solo-movil subir d2" />
      <AccionesMovil acciones={v.acciones.visibles} personalizar={v.acciones} />
      {siguiente && (
        <section className="glass ini-sig solo-movil subir d2">
          <span className="lab">{v.barbero ? "Tu siguiente cita" : "Próxima cita"}</span>
          <div className="entre"><span><b>{siguiente.hora}</b> {siguiente.cliente}</span><span className="muted">{v.barbero ? siguiente.servicio : `con ${siguiente.con}`}</span></div>
        </section>
      )}
      <section className="glass ini-card ini-eq-m-card solo-movil subir d2">
        <div className="entre"><span className="lab">Equipo hoy</span>{v.verVentas && <Link className="ini-link" href="/analitica/ventas">Ver ventas</Link>}</div>
        {listaEquipo}
      </section>

      {/* Escritorio */}
      <div className="ini-rejilla solo-escritorio">
        <section className="glass ini-hoy subir d1">
          <div className="ini-hoy-c">
            <div><span className="lab">{v.barbero ? "Hoy llevas" : "Hoy llevan"}</span><b className="ini-big"><Cuenta valor={v.total} /></b></div>
            <div className="ini-dato">
              <span><b>{v.servicios}</b> {v.servicios === 1 ? "servicio" : "servicios"}{v.clientes > 0 && <>, <b>{formatoDinero(Math.round(v.total / v.clientes))}</b> por cliente</>}</span>
              <span>{comparacion(v.total, v.previo, dia)}</span>
            </div>
          </div>
          {v.meta && (
            <div className="ini-meta-f">
              <div className="entre"><span>{v.barbero ? "Tu meta de hoy" : "Meta de hoy"} {formatoDinero(v.meta.monto)}{v.meta.ayuda && <Ayuda titulo="Meta de hoy">{v.meta.ayuda}</Ayuda>}</span><b>{pct}%</b></div>
              {barra}
              {v.meta.nota && <small className="muted">{v.meta.nota}</small>}
            </div>
          )}
          <div className="ini-graf">
            <Grafica id="inicio-hoy" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={150} enCurso={serie.enCurso}
              globos={serie.actual.map((x, i) => (x === null ? null : [`A las ${serie.etiquetas[i]}`, formatoDinero(x), "acumulado"] as [string, string, string]))}
              descripcion={`${v.barbero ? "Tus ventas" : "Ventas"} de hoy por hora contra el ${dia} pasado`} vacio="Se dibuja con la primera venta del día" />
          </div>
          {v.verMas && <Link className="ini-link" href={v.verMas.href}>{v.verMas.texto}</Link>}
        </section>
        <div className={`ini-der ${v.citas ? "con-citas" : ""}`}>
          <Pendientes items={v.pendientes} className="subir d2" />
          {v.citas && (
            <section className="glass ini-card subir d2">
              <div className="entre"><span className="lab">{v.barbero ? "Tus próximas citas" : "Próximas citas"}</span><Link className="ini-link" href={v.barbero ? `/citas?persona=${s.usuario.id}` : "/citas"}>Agenda</Link></div>
              {v.citas.length ? v.citas.slice(0, 3).map((c) => (
                <div key={c.id} className="ini-cita"><b>{c.hora}</b><span>{c.cliente}</span><span className="muted">{v.barbero ? c.servicio : c.con}</span></div>
              )) : <p className="muted ini-vacio">No hay más citas hoy.</p>}
              {v.citas.length > 3 && <small className="muted">y {v.citas.length - 3} más</small>}
            </section>
          )}
          <section className="glass ini-card subir d2">
            <span className="lab">Equipo hoy</span>
            {listaEquipo}
          </section>
        </div>
      </div>

      <section className="ultimos-s subir d3">
        <div className="entre">
          <h2 className="sub-t">Últimos servicios</h2>
          {v.verVentas && <Link className="bt-ver" href="/analitica/ventas">Ver todas las ventas<span><Icono n="derecha" /></span></Link>}
        </div>
        <UltimosServicios filas={v.ultimos} />
      </section>
    </>
  );
}

export default async function Inicio({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  await asentarCitasPagadas(s.barberia.id);
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
  if (!s.puede("reportes.ver")) return <InicioBarbero s={s} hoy={hoy} zona={zona} turno={turno} avisos={avisos} />;

  const [{ ventas }, equipo, citas] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(hoy, -28), hoy, { zona }),
    equipoQueAtiende(s.barberia.id),
    porLlegar(s, hoy, zona),
  ]);
  const pendientes = await pendientesDe(s, hoy, zona);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const deHoy = pagadas.filter((v) => v.fecha === hoy);
  const total = deHoy.reduce((a, v) => a + v.total, 0);
  const limite = Date.now() - 7 * 86400000;
  const previo = pagadas.filter((v) => v.fecha === sumarDias(hoy, -7) && v.creadoEn.getTime() <= limite).reduce((a, v) => a + v.total, 0);
  // Con meta mensual del negocio, la meta del día es la suma de lo que le toca a cada barbero.
  const delMes = s.barberia.usaMetas ? await metasDelMes(s.barberia.id, s.barberia.metaMensual, zona, hoy) : null;
  const meta = !s.barberia.usaMetas ? null : delMes ? { monto: Math.max(delMes.diaria, 1), ayuda: "Es la suma de la meta del día de cada persona; sale de la meta del mes.", nota: `Meta del mes ${formatoDinero(s.barberia.metaMensual)}` }
    : { monto: calcularMeta(s.barberia.metaDiaria, [7, 14, 21, 28].map((d) => pagadas.filter((v) => v.fecha === sumarDias(hoy, -d)).reduce((a, v) => a + v.total, 0))).monto };
  const conceptos = deHoy.flatMap((v) => v.conceptos);
  const filasEq = equipo.map((e) => {
    const cs = conceptos.filter((c) => c.barberoId === e.id);
    const m = delMes?.porBarbero.find((b) => b.id === e.id && b.aplica);
    return { id: e.id, nombre: e.nombre, avatar: e.avatar, servicios: cs.length, monto: cs.reduce((x, c) => x + c.precioCobrado, 0), meta: m?.diaria };
  }).sort((a, b) => b.monto - a.monto);
  const acciones = await accionesDe(s, turno, hoy, zona, citas?.length ?? null, false);
  return (
    <InicioVista s={s} hoy={hoy} zona={zona} avisos={avisos} acciones={acciones} barbero={false}
      total={total} servicios={conceptos.length} clientes={deHoy.length} previo={previo}
      movs={pagadas.map((v) => ({ creadoEn: v.creadoEn, fecha: v.fecha, monto: v.total }))}
      meta={meta} citas={citas} equipo={filasEq} pendientes={pendientes}
      ultimos={filasUltimos(ventas.slice(0, 5), equipo, hoy, zona, await verificadosDe(ventas.slice(0, 5).map((v) => v.id)))}
      verMas={{ href: "/analitica", texto: "Ver semana y mes en Analítica" }} verVentas={s.puede("ventas.ver_todas")} />
  );
}

async function InicioBarbero({ s, hoy, zona, turno, avisos }: { s: Sesion; hoy: string; zona: string; turno: Turno | null | undefined; avisos: React.ReactNode }) {
  const yo = s.usuario.id;
  const lunes = lunesDe(hoy);
  const [{ ventas: todas }, [u], gente, citas] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(lunes, -28), hoy, { zona }),
    db.select({ meta: schema.usuarios.metaSemanal }).from(schema.usuarios).where(eq(schema.usuarios.id, yo)),
    equipoQueAtiende(s.barberia.id),
    porLlegar(s, hoy, zona, yo),
  ]);
  const pendientes = await pendientesDe(s, hoy, zona, yo);
  const pagadas = todas.filter((v) => v.estado === "pagada");
  const mios = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === yo).map((c) => ({ ...c, fecha: v.fecha, creadoEn: v.creadoEn })));
  const deHoy = mios.filter((c) => c.fecha === hoy);
  const total = deHoy.reduce((a, c) => a + c.precioCobrado, 0);
  const limite = Date.now() - 7 * 86400000;
  const previo = mios.filter((c) => c.fecha === sumarDias(hoy, -7) && c.creadoEn.getTime() <= limite).reduce((a, c) => a + c.precioCobrado, 0);
  // Su meta diaria sale de la meta mensual del negocio o de su meta semanal (seis días de trabajo).
  const semanas = [1, 2, 3, 4].map((k) => {
    const l = sumarDias(lunes, -7 * k);
    return mios.filter((c) => c.fecha >= l && c.fecha <= sumarDias(l, 6)).reduce((a, c) => a + c.precioCobrado, 0);
  });
  const delMes = !s.barberia.usaMetas || u?.meta ? null : await metasDelMes(s.barberia.id, s.barberia.metaMensual, zona, hoy);
  const mia = delMes?.porBarbero.find((x) => x.id === yo);
  const metaHoy = mia?.aplica ? mia.diaria : Math.round(calcularMeta(u?.meta ?? 0, semanas).monto / 6);
  const clientesHoy = new Set(pagadas.filter((v) => v.fecha === hoy && v.conceptos.some((c) => c.barberoId === yo)).map((v) => v.id)).size;
  const conceptosHoy = pagadas.filter((v) => v.fecha === hoy).flatMap((v) => v.conceptos);
  const filasEq = gente.map((g) => {
    const cs = conceptosHoy.filter((c) => c.barberoId === g.id);
    return { id: g.id, nombre: g.nombre, avatar: g.avatar, servicios: cs.length, monto: cs.reduce((a, c) => a + c.precioCobrado, 0) };
  }).sort((a, b) => b.monto - a.monto);
  const acciones = await accionesDe(s, turno, hoy, zona, citas?.length ?? null, true);
  return (
    <InicioVista s={s} hoy={hoy} zona={zona} avisos={avisos} acciones={acciones} barbero
      total={total} servicios={deHoy.length} clientes={clientesHoy} previo={previo}
      movs={mios.map((c) => ({ creadoEn: c.creadoEn, fecha: c.fecha, monto: c.precioCobrado }))}
      meta={s.barberia.usaMetas ? { monto: Math.max(metaHoy, 1), ayuda: mia?.aplica ? "Sale de la meta mensual del negocio y de tu forma de pago." : "Refleja tu meta de ventas y cuánto llevas de ella." } : null}
      citas={citas} equipo={filasEq} pendientes={pendientes}
      ultimos={filasUltimos(todas.slice(0, 5), gente, hoy, zona, await verificadosDe(todas.slice(0, 5).map((v) => v.id)))}
      verMas={{ href: "/analitica/ventas", texto: "Ver tu semana y mes en Ventas" }} verVentas />
  );
}
