import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoUrl } from "@/components/Encabezado";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import { ActividadBarbero } from "./ActividadBarbero";
import { UltimosServicios } from "./UltimosServicios";
import { AvisoCajaEmergente } from "./AvisoCaja";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { diasConVentas, equipoQueAtiende, foliosCorte, metasDelMes, turnosCerrados, movimientosDeTurno, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, fechaLarga, fechaLocal, finDeMes, horaCorta, inicioDeMes, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
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
  if (s.usuario.rol === "contador") redirect("/libreta");
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
          <span><b>Tienes un corte de caja pendiente</b><small>La jornada del {fechaLarga(turno.fechaOperativa).toLowerCase()} aún no se ha cerrado. Realiza el corte para registrar el efectivo y finalizar el día.</small></span>
          <Link className="bt chico solo" href="/cobrar?caja=cerrar"><Icono n="candado" />Realizar corte de caja</Link>
        </div>
      )}
      {turno && turno.fechaOperativa < hoy && !s.puede("reportes.ver") && s.puede("caja.operar") && <AvisoCajaEmergente dia={fechaLarga(turno.fechaOperativa).toLowerCase()} />}
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
  const modo = q.grafica === "hoy" || q.grafica === "semana" || q.grafica === "mes" ? q.grafica : deHoy.length ? "hoy" : "semana";
  const inicioMes = inicioDeMes(hoy);
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
      <section className="hero subir">
        <div>
          <span className="lab">{fechaLarga(hoy)}</span>
          <p className="muted" style={{ margin: "14px 0 2px" }}>{modo === "hoy" ? "Ventas de hoy" : modo === "semana" ? "Ventas de la semana" : "Ventas del mes"}</p>
          <div className="big"><Cuenta valor={totalPeriodo} /></div>
          <div style={{ marginTop: 10 }}>{modo === "hoy" ? <Comparacion hoy={netas} previo={previoMismaHora} dia={dia} />
            : varPeriodo === null ? <span className="pill gris">Sin registros en el periodo anterior</span>
            : <span className={`pill ${varPeriodo >= 0 ? "ok" : "warn"}`}>{varPeriodo >= 0 ? "↗" : "↘"} {Math.abs(varPeriodo)}% {varPeriodo >= 0 ? "más" : "menos"} que {modo === "semana" ? "la semana pasada" : "el mes pasado"} a estas alturas</span>}</div>
          <div className="pila-chica" style={{ marginTop: 18 }}>
            <span className="entre">
              <span className="fila" style={{ gap: 16, fontSize: 12 }}>
                <span className="fila" style={{ gap: 6 }}><i className="ley-l" />{modo === "hoy" ? "Hoy" : modo === "semana" ? "Esta semana" : "Este mes"}</span>
                <span className="fila muted" style={{ gap: 6 }}><i className="ley-p" />{modo === "hoy" ? `El ${dia} pasado` : modo === "semana" ? "La semana pasada" : "El mes pasado"}</span>
              </span>
              <SelectorGrafica modo={modo} conMes />
            </span>
            <Grafica key={modo} id={`inicio-${modo}`} actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={120} minimo={modo === "hoy" ? 2 : 1} enCurso={serie.enCurso}
              puntos={modo !== "hoy"} globos={serie.actual.map((v, i) => (v === null ? null : [modo === "hoy" ? `A las ${serie.etiquetas[i]}` : modo === "semana" ? nombreDia(new Date(`${sumarDias(lunes, i)}T12:00:00Z`).getUTCDay()) : `${serie.etiquetas[i]} de ${fechaLarga(hoy).split(" ").pop()}`, formatoDinero(v), modo === "hoy" ? "acumulado" : ""] as [string, string, string]))}
              descripcion={modo === "hoy" ? "Ventas acumuladas de hoy por hora contra el mismo día de la semana pasada" : modo === "semana" ? "Ventas por día de esta semana contra la semana pasada" : "Ventas por día de este mes contra el mes pasado"}
              vacio="Aquí se dibujarán las ventas en cuanto se cobre la primera" textoPoco="Con más ventas se verá cómo avanza el día" />
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Clientes atendidos</span><b><Cuenta valor={deHoy.length} formato="entero" /></b></div>
            <div><span>Servicios</span><b><Cuenta valor={servicios} formato="entero" /></b></div>
            <div><span>Promedio por cliente</span><b>{deHoy.length ? formatoDinero(Math.round(netas / deHoy.length)) : "Sin datos"}</b></div>
            {s.barberia.usaMetas && <div style={{ display: "grid", gap: 8 }}>
              <span className="entre"><span>{delMes ? "Meta del día, todo el equipo" : "Meta diaria"}</span><b>{formatoDinero(meta.monto)}</b></span>
              <div className="meta grande"><i style={{ width: `${Math.max(avance * 100, 3)}%` }} /></div>
              <small className="muted">{porcentaje(netas, meta.monto)}% alcanzado{delMes ? `, para llegar a ${formatoDinero(s.barberia.metaMensual)} al mes` : ""}</small>
              {delMes && delMes.porBarbero.filter((b) => b.aplica).length > 0 && (
                <div className="metas-eq">
                  {delMes.porBarbero.filter((b) => b.aplica).map((b) => <span key={b.id}>{b.nombre.split(" ")[0]}<b>{formatoDinero(b.diaria)}</b></span>)}
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
  // También lo del equipo y los cortes de caja recientes, para que el barbero vea qué ha pasado.
  const [{ ventas: todas }, cortes, folios, gente] = await Promise.all([
    ventasEntre(s.barberia.id, sumarDias(hoy, -14), hoy, { zona }),
    turnosCerrados(s.barberia.id, 8),
    foliosCorte(s.barberia.id),
    equipoQueAtiende(s.barberia.id),
  ]);
  const delEquipo = todas.slice(0, 10);
  const avatarDe = (id?: string) => gente.find((g) => g.id === id)?.avatar ?? "iniciales";
  const cuando = (fecha: string, d: Date) => (fecha === hoy ? horaCorta(d, zona) : fecha === sumarDias(hoy, -1) ? "Ayer" : `${fecha.slice(8)}/${fecha.slice(5, 7)}`);
  const totalHoy = deHoy.reduce((a, c) => a + c.precioCobrado, 0);
  const semana = mios.filter((c) => c.fecha >= lunes).reduce((a, c) => a + c.precioCobrado, 0);
  const limite = Date.now() - 7 * 86400000;
  const previo = mios.filter((c) => c.fecha === sumarDias(hoy, -7) && c.creadoEn.getTime() <= limite).reduce((a, c) => a + c.precioCobrado, 0);
  // Al abrir: si ya hay ventas hoy se ve el día; si no, la semana. Se puede cambiar a Hoy, Semana o Mes.
  const modo = q.grafica === "hoy" || q.grafica === "semana" || q.grafica === "mes" ? q.grafica : deHoy.length ? "hoy" : "semana";
  void historia;
  const inicioMes = inicioDeMes(hoy);
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
          <div className="entre"><Comparacion hoy={totalHoy} previo={previo} dia={dia} /><SelectorGrafica modo={modo} conMes /></div>
          <Grafica id="barbero" actual={serie.actual} previo={serie.previo} etiquetas={serie.etiquetas} cadaEtiqueta={serie.cada} alto={210}
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
            <span className="lab">Actividad reciente</span>
            <Link className="bt solo chico" href="/cobrar"><Icono n="mas" />Registrar</Link>
          </div>
          <ActividadBarbero
            mios={recientes.map((c, i) => ({ id: `m${i}`, t: cuando(c.fecha, c.creadoEn), titulo: c.nombre, detalle: [...new Set(c.metodos)].join(" y "), monto: formatoDinero(c.precioCobrado) }))}
            equipo={delEquipo.map((v) => ({ id: v.id, t: cuando(v.fecha, v.creadoEn), titulo: v.conceptos.map((c) => c.nombre).join(", "), detalle: v.conceptos[0]?.barbero.split(" ")[0] ?? "", monto: formatoDinero(v.total), nombre: v.conceptos[0]?.barbero, avatar: avatarDe(v.conceptos[0]?.barberoId), tachada: v.estado === "cancelada" }))}
            cortes={cortes.map((c) => ({ id: c.id, t: cuando(c.fechaOperativa, c.cerradoEn ?? new Date()), titulo: `Cerró ${(c.cerradoPor ?? "").split(" ")[0]}`, detalle: c.diferencia ? `${c.diferencia < 0 ? "Faltaron" : "Sobraron"} ${formatoDinero(Math.abs(c.diferencia))}` : "Sin diferencias", chip: folios.get(c.id) }))}
          />
        </div>
      </section>
    </>
  );
}
