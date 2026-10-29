import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { AvisoCajaEmergente } from "./AvisoCaja";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { diasConVentas, equipoQueAtiende, movimientosDeTurno, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
import { calcularMeta } from "@/lib/metas";
import { cambio, formatoDinero, porcentaje } from "@/lib/money";
import { serieHoy, serieSemana, type Movimiento } from "@/lib/series";

type Q = { aviso?: string; error?: string; grafica?: string };
type Sesion = Awaited<ReturnType<typeof requerirSesion>>;

/** "↗ 12% más que el martes pasado a esta hora" */
function Comparacion({ hoy, previo, dia }: { hoy: number; previo: number; dia: string }) {
  const v = cambio(hoy, previo);
  if (v === null) return <span className="pill gris">{hoy ? `El ${dia} pasado a esta hora no había ventas` : "Todavía no hay ventas hoy"}</span>;
  return <span className={`pill ${v >= 0 ? "ok" : "warn"}`}>{v >= 0 ? "↗" : "↘"} {Math.abs(v)}% {v >= 0 ? "más" : "menos"} que el {dia} pasado a esta hora</span>;
}

function SelectorGrafica({ modo }: { modo: "hoy" | "semana" }) {
  return (
    <nav className="seg chico" aria-label="Ver gráfica">
      <Link href="/?grafica=hoy" aria-current={modo === "hoy" ? "page" : undefined} scroll={false}>Hoy</Link>
      <Link href="/?grafica=semana" aria-current={modo === "semana" ? "page" : undefined} scroll={false}>Semana</Link>
    </nav>
  );
}

export default async function Inicio({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  if (s.usuario.rol === "contador") redirect("/analitica");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const turno = await turnoAbierto(s.barberia.id);
  const avisos = (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      {turno && turno.fechaOperativa < hoy && s.puede("reportes.ver") && (
        <div className="alerta-caja subir">
          <span className="icono-alerta grande"><Icono n="reloj" /></span>
          <span><b>La caja del {fechaLarga(turno.fechaOperativa).toLowerCase()} sigue abierta</b><small>Pasaron las 12 de la noche y no se hizo el corte. Mientras tanto no se puede cobrar.</small></span>
          <Link className="bt chico solo" href="/cobrar?caja=cerrar"><Icono n="candado" />Cerrar caja</Link>
        </div>
      )}
      {turno && turno.fechaOperativa < hoy && !s.puede("reportes.ver") && s.puede("caja.operar") && <AvisoCajaEmergente dia={fechaLarga(turno.fechaOperativa).toLowerCase()} />}
    </>
  );
  if (!s.puede("reportes.ver")) return <InicioBarbero s={s} hoy={hoy} zona={zona} q={q} avisos={avisos} />;

  const lunes = lunesDe(hoy);
  const [{ ventas }, equipo, historia] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(hoy, -35), hoy, { zona }),
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
  const serie = serieHoy(movs, hoy, zona);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  const meta = calcularMeta(s.barberia.metaDiaria, [7, 14, 21, 28].map((d) => pagadas.filter((v) => v.fecha === sumarDias(hoy, -d)).reduce((a, v) => a + v.total, 0)));
  const avance = Math.min(netas / meta.monto, 1);
  const recientes = ventas.filter((v) => v.fecha === hoy).slice(0, 10);

  return (
    <>
      {avisos}
      <section className="hero subir">
        <div>
          <span className="lab">{fechaLarga(hoy)}</span>
          <p className="muted" style={{ margin: "14px 0 2px" }}>Ventas de hoy</p>
          <div className="big"><Cuenta valor={netas} /></div>
          <div style={{ marginTop: 10 }}><Comparacion hoy={netas} previo={previoMismaHora} dia={dia} /></div>
          <div className="pila-chica" style={{ marginTop: 18 }}>
            <span className="fila" style={{ gap: 16, fontSize: 12 }}>
              <span className="fila" style={{ gap: 6 }}><i className="ley-l" />Hoy</span>
              <span className="fila muted" style={{ gap: 6 }}><i className="ley-p" />El {dia} pasado</span>
            </span>
            <Grafica id="inicio" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={120} minimo={2} enCurso={serie.enCurso}
              descripcion="Ventas acumuladas de hoy por hora contra el mismo día de la semana pasada"
              vacio="Aquí se dibujarán las ventas en cuanto se cobre la primera" textoPoco="Con más ventas se verá cómo avanza el día" />
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Clientes atendidos</span><b><Cuenta valor={deHoy.length} formato="entero" /></b></div>
            <div><span>Servicios</span><b><Cuenta valor={servicios} formato="entero" /></b></div>
            <div><span>Promedio por cliente</span><b>{deHoy.length ? formatoDinero(Math.round(netas / deHoy.length)) : "Sin datos"}</b></div>
            <div style={{ display: "grid", gap: 8 }}>
              <span className="entre"><span>Meta diaria</span><b>{formatoDinero(meta.monto)}</b></span>
              <div className="meta grande"><i style={{ width: `${Math.max(avance * 100, 3)}%` }} /></div>
              <small className="muted">{porcentaje(netas, meta.monto)}% alcanzado</small>
            </div>
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

      <section className="glass panel subir d3">
        <div className="entre">
          <span className="lab">Últimos servicios de hoy</span>
          {s.puede("ventas.ver_todas") && <Link className="enlace" href="/analitica/ventas?periodo=dia">Ver todas las ventas</Link>}
        </div>
        {recientes.length === 0 ? <p className="muted">Todavía no se cobra nada hoy.</p> : (
          <div className="recientes">
            {recientes.map((v) => {
              const quien = equipo.find((e) => e.id === v.conceptos[0]?.barberoId);
              return (
                <div key={v.id} className={v.estado === "cancelada" ? "cancelada" : ""}>
                  <span className="t">{horaCorta(v.creadoEn, zona)}</span>
                  {quien ? <Avatar avatar={quien.avatar} nombre={quien.nombre} t={26} /> : <span />}
                  <span className="srv">{v.conceptos.map((c) => c.nombre).join(", ")}<small>{v.conceptos[0]?.barbero.split(" ")[0]} - {v.pagos.map((pg) => pg.metodo).join(" y ")}</small></span>
                  <span className="folio">{v.folio}</span>
                  <span className="num">{formatoDinero(v.total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

async function InicioBarbero({ s, hoy, zona, q, avisos }: { s: Sesion; hoy: string; zona: string; q: Q; avisos: React.ReactNode }) {
  const yo = s.usuario.id;
  const lunes = lunesDe(hoy);
  const [{ ventas }, [u], historia] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(lunes, -28), hoy, { barberoId: yo, zona }),
    db.select({ meta: schema.usuarios.metaSemanal }).from(schema.usuarios).where(eq(schema.usuarios.id, yo)),
    diasConVentas(s.barberia.id, zona, yo),
  ]);
  const mios = ventas.filter((v) => v.estado === "pagada").flatMap((v) =>
    v.conceptos.filter((c) => c.barberoId === yo).map((c) => ({ ...c, fecha: v.fecha, creadoEn: v.creadoEn, metodos: v.pagos.map((p) => p.metodo.toLowerCase()) })));
  const movs: Movimiento[] = mios.map((c) => ({ creadoEn: c.creadoEn, fecha: c.fecha, monto: c.precioCobrado }));
  const deHoy = mios.filter((c) => c.fecha === hoy);
  const recientes = [...mios].sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime()).slice(0, 10);
  const totalHoy = deHoy.reduce((a, c) => a + c.precioCobrado, 0);
  const semana = mios.filter((c) => c.fecha >= lunes).reduce((a, c) => a + c.precioCobrado, 0);
  const limite = Date.now() - 7 * 86400000;
  const previo = mios.filter((c) => c.fecha === sumarDias(hoy, -7) && c.creadoEn.getTime() <= limite).reduce((a, c) => a + c.precioCobrado, 0);
  const modo = q.grafica === "hoy" || q.grafica === "semana" ? q.grafica : historia < 2 ? "hoy" : "semana";
  const serie = modo === "hoy" ? serieHoy(movs, hoy, zona) : serieSemana(movs, lunes, hoy);
  const semanas = [1, 2, 3, 4].map((k) => {
    const l = sumarDias(lunes, -7 * k);
    return mios.filter((c) => c.fecha >= l && c.fecha <= sumarDias(l, 6)).reduce((a, c) => a + c.precioCobrado, 0);
  });
  const meta = calcularMeta(u?.meta ?? 0, semanas);
  const avance = Math.min(semana / meta.monto, 1);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());

  return (
    <>
      {avisos}
      <div className="subir">
        <span className="lab">{fechaLarga(hoy)}</span>
        <h1 className="titulo brillo" style={{ fontSize: 30, marginTop: 8 }}>Hola, {s.usuario.nombre.split(" ")[0]}</h1>
      </div>
      <section className="inicio-b">
        <div className="glass panel subir d1" style={{ padding: 26, gap: 18 }}>
          <div className="entre" style={{ alignItems: "flex-end" }}>
            <div><span className="lab">Hoy llevas</span><div className="big" style={{ fontSize: "clamp(52px, 7vw, 76px)", marginTop: 6 }}><Cuenta valor={totalHoy} /></div></div>
            <div style={{ textAlign: "right" }}><span className="lab">Servicios</span><span className="fig" style={{ fontSize: 30 }}><Cuenta valor={deHoy.length} formato="entero" /></span></div>
          </div>
          <div className="entre"><Comparacion hoy={totalHoy} previo={previo} dia={dia} /><SelectorGrafica modo={modo} /></div>
          <Grafica id="barbero" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={210}
            descripcion={modo === "hoy" ? "Tus ventas de hoy por hora" : "Tus ventas de la semana"} vacio="Tu gráfica se dibuja con tu primer servicio" />
          <div className="pila-chica">
            <div className="entre">
              <span className="muted" style={{ fontSize: 13 }}>Meta de la semana: <b style={{ color: "var(--fg)" }}>{formatoDinero(meta.monto)}</b><Ayuda titulo="Meta de la semana">Refleja tu meta de ventas de esta semana y cuánto llevas de ella.</Ayuda></span>
              <b className="num">{porcentaje(semana, meta.monto)}%</b>
            </div>
            <div className="meta grande"><i style={{ width: `${Math.max(avance * 100, 3)}%` }} /></div>
            <small className="muted">Llevas {formatoDinero(semana)} esta semana.</small>
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="entre">
            <span className="lab">Tu actividad reciente</span>
            <Link className="bt solo chico" href="/cobrar"><Icono n="mas" />Registrar</Link>
          </div>
          {recientes.length === 0 ? <p className="muted">Aquí aparecerán tus servicios en cuanto se cobren.</p> : (
            <div className="feed">
              {recientes.map((c, i) => (
                <div key={i} className="subir" style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
                  <span className="t">{c.fecha === hoy ? horaCorta(c.creadoEn, zona) : c.fecha === sumarDias(hoy, -1) ? "Ayer" : c.fecha.slice(8) + "/" + c.fecha.slice(5, 7)}</span>
                  <span><b style={{ fontWeight: 600 }}>{c.nombre}</b><small>{formatoDinero(c.precioCobrado)}, {[...new Set(c.metodos)].join(" y ")}</small></span>
                  <span />
                </div>
              ))}
            </div>
          )}
          {recientes.length > 0 && <Link href="/mis-ventas" className="enlace" style={{ display: "inline-block", paddingTop: 12 }}>Ver todo en Mis ventas</Link>}
        </div>
      </section>
    </>
  );
}
