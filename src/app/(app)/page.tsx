import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { diasConVentas, equipoQueAtiende, movimientosDeTurno, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
import { calcularMeta, explicarMeta } from "@/lib/metas";
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
      {turno && turno.fechaOperativa < hoy && (
        <Aviso tipo="error">
          La caja se abrió el {fechaLarga(turno.fechaOperativa).toLowerCase()} y sigue abierta.
          <br />
          Ciérrala desde <Link href="/cobrar?caja=cerrar">Cobro</Link> para que el corte salga del día correcto.
        </Aviso>
      )}
    </>
  );
  if (!s.puede("reportes.ver")) return <InicioBarbero s={s} hoy={hoy} zona={zona} q={q} avisos={avisos} />;

  const lunes = lunesDe(hoy);
  const [{ ventas }, equipo, historia] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(hoy, -35), hoy, { zona }),
    equipoQueAtiende(s.barberia.id),
    diasConVentas(s.barberia.id, zona),
  ]);
  const caja = turno ? await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial) : null;
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const movs: Movimiento[] = pagadas.map((v) => ({ creadoEn: v.creadoEn, fecha: v.fecha, monto: v.total }));
  const deHoy = pagadas.filter((v) => v.fecha === hoy);
  const netas = deHoy.reduce((a, v) => a + v.total, 0);
  const limite = Date.now() - 7 * 86400000;
  const previoMismaHora = pagadas.filter((v) => v.fecha === sumarDias(hoy, -7) && v.creadoEn.getTime() <= limite).reduce((a, v) => a + v.total, 0);
  const modo = q.grafica === "hoy" || q.grafica === "semana" ? q.grafica : historia < 2 ? "hoy" : "semana";
  const serie = modo === "hoy" ? serieHoy(movs, hoy, zona) : serieSemana(movs, lunes, hoy);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  const meta = calcularMeta(s.barberia.metaDiaria, [7, 14, 21, 28].map((d) => pagadas.filter((v) => v.fecha === sumarDias(hoy, -d)).reduce((a, v) => a + v.total, 0)));
  const avance = Math.min(netas / meta.monto, 1);

  return (
    <>
      {avisos}
      <section className="hero subir">
        <div>
          <span className="lab">{fechaLarga(hoy)}</span>
          <p className="muted" style={{ margin: "14px 0 2px" }}>Ventas de hoy</p>
          <div className="big"><Cuenta valor={netas} /></div>
          <div style={{ marginTop: 10 }}><Comparacion hoy={netas} previo={previoMismaHora} dia={dia} /></div>
          <div className="pila-chica" style={{ marginTop: 22 }}>
            <div className="entre">
              <span className="fila" style={{ gap: 16, fontSize: 12 }}>
                <span className="fila" style={{ gap: 6 }}><i className="ley-l" />{modo === "hoy" ? "Hoy" : "Esta semana"}</span>
                <span className="fila muted" style={{ gap: 6 }}><i className="ley-p" />{modo === "hoy" ? `El ${dia} pasado` : "Semana pasada"}</span>
              </span>
              <SelectorGrafica modo={modo} />
            </div>
            <Grafica id="inicio" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada}
              descripcion={modo === "hoy" ? "Ventas acumuladas de hoy por hora contra el mismo día de la semana pasada" : "Ventas por día de esta semana contra la semana pasada"}
              vacio="Aquí se dibujarán las ventas en cuanto se cobre la primera" />
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Clientes atendidos</span><b><Cuenta valor={deHoy.length} formato="entero" /></b></div>
            <div>
              <span>Efectivo en caja<Ayuda titulo="Efectivo en caja">Lo que debería haber en la caja en este momento: el fondo de apertura, más los cobros y propinas en efectivo, menos retiros y gastos pagados con la caja.</Ayuda></span>
              <b>{caja ? formatoDinero(caja.esperado) : <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>Caja cerrada</span>}</b>
            </div>
            <div><span>Promedio por cliente</span><b>{deHoy.length ? formatoDinero(Math.round(netas / deHoy.length)) : "Sin datos"}</b></div>
            <div style={{ display: "grid", gap: 8 }}>
              <span className="entre"><span>Meta del día<Ayuda titulo="Meta del día">{explicarMeta(meta, "día")} Se cambia en Ajustes, Cobro y caja.</Ayuda></span><b>{formatoDinero(meta.monto)}</b></span>
              <div className="meta"><i style={{ width: `${Math.max(avance * 100, 2)}%` }} /></div>
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
      <section className="inicio-b">
        <div className="pila" style={{ gap: 18 }}>
          <div className="subir">
            <span className="lab">{fechaLarga(hoy)}</span>
            <h1 className="titulo brillo" style={{ fontSize: 30, marginTop: 8 }}>Hola, {s.usuario.nombre.split(" ")[0]}</h1>
          </div>
          <div className="glass panel subir d1" style={{ padding: 24, gap: 16 }}>
            <div className="entre" style={{ alignItems: "flex-end" }}>
              <div><span className="lab">Hoy llevas</span><div className="big" style={{ fontSize: "clamp(48px, 7vw, 68px)", marginTop: 6 }}><Cuenta valor={totalHoy} /></div></div>
              <div style={{ textAlign: "right" }}><span className="lab">Servicios</span><span className="fig" style={{ fontSize: 28 }}><Cuenta valor={deHoy.length} formato="entero" /></span></div>
            </div>
            <div className="entre"><Comparacion hoy={totalHoy} previo={previo} dia={dia} /><SelectorGrafica modo={modo} /></div>
            <Grafica id="barbero" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={130}
              descripcion={modo === "hoy" ? "Tus ventas de hoy por hora" : "Tus ventas de la semana"} vacio="Tu gráfica se dibuja con tu primer servicio" />
            <div className="pila-chica">
              <div className="entre">
                <span className="muted" style={{ fontSize: 13 }}>Meta de la semana: <b style={{ color: "var(--fg)" }}>{formatoDinero(meta.monto)}</b><Ayuda titulo="Meta de la semana">{explicarMeta(meta, "semana")}</Ayuda></span>
                <b className="num">{porcentaje(semana, meta.monto)}%</b>
              </div>
              <div className="meta"><i style={{ width: `${Math.max(avance * 100, 2)}%` }} /></div>
              <small className="muted">Llevas {formatoDinero(semana)} esta semana.</small>
            </div>
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="entre">
            <span className="lab">Tus servicios de hoy</span>
            <Link className="bt solo" href="/cobrar" style={{ padding: "8px 14px", fontSize: 13 }}><Icono n="mas" />Registrar</Link>
          </div>
          {deHoy.length === 0 ? <p className="muted">Aquí aparecerán en cuanto se cobren.</p> : (
            <div className="feed">
              {deHoy.slice(0, 6).map((c, i) => (
                <div key={i} className="subir" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                  <span className="t">{horaCorta(c.creadoEn, zona)}</span>
                  <span><b style={{ fontWeight: 600 }}>{c.nombre}</b><small>{formatoDinero(c.precioCobrado)}, {[...new Set(c.metodos)].join(" y ")}</small></span>
                  <span />
                </div>
              ))}
              {deHoy.length > 6 && <Link href="/mis-ventas?periodo=dia" className="enlace" style={{ paddingTop: 12 }}>Ver los {deHoy.length} servicios de hoy</Link>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
