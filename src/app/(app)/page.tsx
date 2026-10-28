import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoUrl } from "@/components/Encabezado";
import { Fl } from "@/components/Icono";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { equipoQueAtiende, movimientosDeTurno, resumenPeriodo, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta, horaLocal, lunesDe, nombreDia, sumarDias } from "@/lib/fechas";
import { cambio, formatoDinero } from "@/lib/money";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
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
  if (!s.puede("reportes.ver")) return <MiDia s={s} hoy={hoy} zona={zona} avisos={avisos} />;

  const semanaPasada = sumarDias(hoy, -7);
  const [r, previo, equipo] = await Promise.all([
    resumenPeriodo(s.barberia.id, hoy, hoy, zona),
    ventasEntre(s.barberia.id, semanaPasada, semanaPasada, { zona }),
    equipoQueAtiende(s.barberia.id),
  ]);
  const caja = turno ? await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial) : null;

  // Comparación justa: lo de hoy contra lo vendido el mismo día de la semana pasada, hasta esta misma hora.
  const pagadasPrevias = previo.ventas.filter((v) => v.estado === "pagada");
  const limite = Date.now() - 7 * 86400000;
  const previoMismaHora = pagadasPrevias.filter((v) => v.creadoEn.getTime() <= limite).reduce((a, v) => a + v.total, 0);
  const variacion = cambio(r.netas, previoMismaHora);
  const porHoraPrevio = new Map<number, number>();
  for (const v of pagadasPrevias) {
    const h = horaLocal(v.creadoEn, zona);
    porHoraPrevio.set(h, (porHoraPrevio.get(h) ?? 0) + v.total);
  }
  const ahora = horaLocal(new Date(), zona);
  const horas = [...r.porHora.keys(), ...porHoraPrevio.keys()];
  const desde = Math.min(9, ...horas), hasta = Math.max(21, ahora, ...horas);
  const dia = nombreDia(new Date(`${hoy}T12:00:00Z`).getUTCDay());

  return (
    <>
      {avisos}
      <section className="hero subir">
        <div>
          <span className="lab">{fechaLarga(hoy)}</span>
          <p className="muted" style={{ margin: "18px 0 6px" }}>Ventas de hoy</p>
          <div className="big"><Cuenta valor={r.netas} /></div>
          <p className="muted" style={{ marginTop: 12 }}>
            {variacion === null ? (r.clientes === 0 ? "Todavía no hay ventas hoy." : `El ${dia} pasado a esta hora no había ventas.`) : (
              <>
                <b style={{ color: variacion >= 0 ? "var(--ok)" : "var(--warn)" }}>{variacion >= 0 ? "↗" : "↘"} {Math.abs(variacion)}% {variacion >= 0 ? "más" : "menos"}</b>
                {" "}que el {dia} pasado a esta misma hora
              </>
            )}
          </p>
          <div style={{ marginTop: 26 }}>
            <GraficaDia hoy={r.porHora} previo={porHoraPrevio} desde={desde} hasta={hasta} ahora={ahora} />
            <div className="fila" style={{ gap: 18, marginTop: 10, fontSize: 12 }}>
              <span className="fila" style={{ gap: 6 }}><i style={{ width: 16, height: 3, borderRadius: 2, background: "var(--accent)" }} />Hoy</span>
              <span className="fila muted" style={{ gap: 6 }}><i style={{ width: 16, height: 0, borderTop: "2px dashed rgba(19,23,28,.35)" }} />El {dia} pasado</span>
            </div>
          </div>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Clientes atendidos</span><b><Cuenta valor={r.clientes} formato="entero" /></b></div>
            <div>
              <span>Efectivo en caja<Ayuda titulo="Efectivo en caja" izq>Lo que debería haber en la caja en este momento: el fondo con que se abrió, más los cobros y propinas en efectivo, menos retiros y gastos pagados con la caja.</Ayuda></span>
              <b>{caja ? formatoDinero(caja.esperado) : <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>Caja cerrada</span>}</b>
            </div>
            <div><span>Promedio por cliente</span><b>{r.clientes ? formatoDinero(r.ticket) : "Sin datos"}</b></div>
          </div>
        </div>
      </section>

      <section className="pila-chica subir d3">
        <span className="lab">El equipo hoy</span>
        <div className="tira" style={{ marginTop: 6 }}>
          {equipo.length === 0 && <span className="muted">Todavía no hay barberos dados de alta.</span>}
          {equipo.map((e) => {
            const b = r.porBarbero.find((x) => x.id === e.id);
            return (
              <div key={e.id} className="persona">
                <Avatar avatar={e.avatar} nombre={e.nombre} t={42} />
                <span><b style={{ fontWeight: 600 }}>{e.nombre.split(" ")[0]}</b><small>{b ? `${formatoDinero(b.monto)}, ${b.servicios} ${b.servicios === 1 ? "servicio" : "servicios"}` : "Sin servicios"}</small></span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/** Ventas acumuladas por hora: hoy contra el mismo día de la semana pasada. */
function GraficaDia({ hoy, previo, desde, hasta, ahora }: { hoy: Map<number, number>; previo: Map<number, number>; desde: number; hasta: number; ahora: number }) {
  const w = 640, h = 170, n = hasta - desde + 1;
  const acumular = (m: Map<number, number>, tope: number) => {
    let a = 0;
    return Array.from({ length: n }, (_, i) => { a += m.get(desde + i) ?? 0; return desde + i <= tope ? a : null; });
  };
  const sHoy = acumular(hoy, ahora);
  const sPrevio = acumular(previo, hasta);
  const max = Math.max(...sHoy.map((x) => x ?? 0), ...sPrevio.map((x) => x ?? 0), 1);
  const x = (i: number) => (i * w) / (n - 1);
  const y = (v: number) => h - 8 - (v / max) * (h - 24);
  const linea = (serie: (number | null)[]) => {
    let d = "";
    serie.forEach((v, i) => { if (v !== null) d += `${d ? " L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; });
    return d;
  };
  const ultimo = sHoy.reduce<number>((u, v, i) => (v === null ? u : i), 0);
  const dHoy = linea(sHoy).trim();
  return (
    <>
      <svg className="area" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Ventas acumuladas de hoy por hora comparadas con la semana pasada">
        <defs>
          <linearGradient id="relleno" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4b6274" stopOpacity=".22" /><stop offset="1" stopColor="#4b6274" stopOpacity="0" /></linearGradient>
        </defs>
        <path className="p" d={linea(sPrevio)} />
        {dHoy && <path className="f" d={`${dHoy} L${x(ultimo)} ${h} L0 ${h} Z`} fill="url(#relleno)" />}
        {dHoy && <path className="l" d={dHoy} />}
        <circle className="d2" cx={x(ultimo)} cy={y(sHoy[ultimo] ?? 0)} r={6} />
        <circle className="d" cx={x(ultimo)} cy={y(sHoy[ultimo] ?? 0)} r={6} />
      </svg>
      <div className="ejes">{Array.from({ length: n }, (_, i) => desde + i).filter((_, i) => i % 3 === 0).map((hr) => <span key={hr}>{hr}:00</span>)}</div>
    </>
  );
}

async function MiDia({ s, hoy, zona, avisos }: { s: Awaited<ReturnType<typeof requerirSesion>>; hoy: string; zona: string; avisos: React.ReactNode }) {
  const lunes = lunesDe(hoy);
  const [{ ventas }, [yo]] = await Promise.all([
    ventasEntre(s.barberia.id, lunes, hoy, { barberoId: s.usuario.id, zona }),
    db.select({ meta: schema.usuarios.metaSemanal }).from(schema.usuarios).where(eq(schema.usuarios.id, s.usuario.id)),
  ]);
  const mios = ventas.filter((v) => v.estado === "pagada")
    .flatMap((v) => v.conceptos.filter((c) => c.barberoId === s.usuario.id).map((c) => ({ ...c, fecha: v.fecha, hora: v.creadoEn })));
  const deHoy = mios.filter((c) => c.fecha === hoy);
  const totalHoy = deHoy.reduce((a, c) => a + c.precioCobrado, 0);
  const semana = mios.reduce((a, c) => a + c.precioCobrado, 0);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const porDia = dias.map((d) => mios.filter((c) => c.fecha === d).reduce((a, c) => a + c.precioCobrado, 0));
  const max = Math.max(...porDia, 1);
  const nombre = s.usuario.nombre.split(" ")[0];
  const meta = yo?.meta ?? 0;
  const avance = meta ? Math.min(semana / meta, 1) : 0;

  return (
    <>
      {avisos}
      <section className="hero subir">
        <div>
          <span className="lab">{fechaLarga(hoy)}</span>
          <h1 className="titulo brillo" style={{ fontSize: 30, marginTop: 14 }}>Hola, {nombre}</h1>
          <p className="muted" style={{ margin: "18px 0 6px" }}>Tus ventas de hoy</p>
          <div className="big"><Cuenta valor={totalHoy} /></div>
          <p className="muted" style={{ marginTop: 10 }}>
            {deHoy.length === 0 ? "Todavía no hay servicios hoy." : <>En <b style={{ color: "var(--fg)" }}>{deHoy.length}</b> {deHoy.length === 1 ? "servicio" : "servicios"}</>}
          </p>
          <div style={{ marginTop: 26, maxWidth: 420 }}>
            <Link className="bt" href="/cobrar">Registrar un cobro<Fl /></Link>
          </div>
        </div>
        <div className="pila subir d2">
          {meta > 0 && (
            <div className="glass panel">
              <div className="entre"><span className="lab">Meta de la semana</span><b className="num">{Math.round(avance * 100)}%</b></div>
              <div className="meta"><i style={{ width: `${Math.max(avance * 100, 2)}%` }} /></div>
              <span className="ctx" style={{ marginTop: 0 }}>{formatoDinero(semana)} de {formatoDinero(meta)}</span>
            </div>
          )}
          <div className="glass panel">
            <div className="entre"><span className="lab">Esta semana</span><b className="num">{formatoDinero(semana)}</b></div>
            <div className="barras" style={{ height: 130 }} aria-label="Tus ventas por día">
              {dias.map((d, i) => (
                <div key={d} className={d === hoy ? "top" : ""} title={`${formatoDinero(porDia[i])}`}>
                  <i style={{ height: `${Math.max(Math.round((porDia[i] / max) * 95), porDia[i] ? 4 : 2)}px`, animationDelay: `${i * 0.06}s` }} />
                  <small>{["L", "M", "M", "J", "V", "S", "D"][i]}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="glass panel subir d3">
        <span className="lab">Lo de hoy</span>
        {deHoy.length === 0 ? <p className="muted">Aquí aparecerán tus servicios en cuanto se cobren.</p> : (
          <div className="feed">
            {deHoy.map((c, i) => (
              <div key={i}><span className="t">{horaCorta(c.hora, zona)}</span><span>{c.nombre}</span><span className="num">{formatoDinero(c.precioCobrado)}</span></div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
