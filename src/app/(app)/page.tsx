import Link from "next/link";
import { Aviso, AVISOS } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { movimientosDeTurno, resumenPeriodo, serviciosParaIdeas, turnoAbierto, ventasEntre } from "@/lib/datos";
import { fechaLarga, fechaLocal, horaCorta, sumarDias } from "@/lib/fechas";
import { describirFranja, detectarFranjas, fechasComerciales } from "@/lib/ideas";
import { cambio, formatoDinero } from "@/lib/money";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const s = await requerirSesion();
  const { aviso } = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const a = aviso ? AVISOS[aviso] : undefined;
  const avisoEl = a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>;

  if (!s.puede("reportes.ver")) return <MiDia barberiaId={s.barberia.id} usuarioId={s.usuario.id} nombre={s.usuario.nombre} hoy={hoy} zona={zona} aviso={avisoEl} />;

  const [hoyR, semanaPasada, turno] = await Promise.all([
    resumenPeriodo(s.barberia.id, hoy, hoy),
    resumenPeriodo(s.barberia.id, sumarDias(hoy, -7), sumarDias(hoy, -7)),
    turnoAbierto(s.barberia.id),
  ]);
  const caja = turno ? await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial) : null;
  const ultimos8 = await resumenPeriodo(s.barberia.id, sumarDias(hoy, -7), hoy);
  const serie = Array.from({ length: 8 }, (_, i) => ultimos8.porDia.get(sumarDias(hoy, i - 7)) ?? 0);
  // Comparación justa: lo de hoy contra lo vendido hace una semana hasta esta misma hora.
  const haceUnaSemana = Date.now() - 7 * 86400000;
  const { ventas: previas } = await ventasEntre(s.barberia.id, sumarDias(hoy, -7), sumarDias(hoy, -7));
  const previoMismaHora = previas.filter((v) => v.estado === "pagada" && v.creadoEn.getTime() <= haceUnaSemana).reduce((a, v) => a + v.total, 0);
  const var_ = cambio(hoyR.netas, previoMismaHora);
  const idea = await siguienteIdea(s.barberia.id, zona, hoy, s.puede("ideas.decidir"));

  return (
    <>
      {avisoEl}
      {turno && turno.fechaOperativa < hoy && (
        <Aviso tipo="error">
          La caja se abrió el {fechaLarga(turno.fechaOperativa).toLowerCase()} y sigue abierta. <Link href="/caja">Ciérrala</Link> antes de seguir.
        </Aviso>
      )}

      <section className="pila centro" style={{ display: "grid", gap: 0, paddingTop: 12 }}>
        <span className="lab">{fechaLarga(hoy)}</span>
        <span className="muted" style={{ margin: "14px 0 6px" }}>Hoy entraron</span>
        <div className="big"><small>$</small>{(hoyR.netas / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
        <span className="muted" style={{ margin: "10px 0 14px" }}>
          {hoyR.clientes === 0 ? "Todavía no hay ventas hoy" : `de ${hoyR.clientes} ${hoyR.clientes === 1 ? "cliente" : "clientes"}`}
        </span>
        {var_ !== null && (
          <span className={`chip ${var_ >= 0 ? "" : "warn"}`}>
            {var_ >= 0 ? "↗" : "↘"} {Math.abs(var_)}% {var_ >= 0 ? "más" : "menos"} que el {fechaLarga(hoy).split(" ")[0].toLowerCase()} pasado a esta hora
          </span>
        )}
        <Linea serie={serie} />
      </section>

      <section className="tres">
        <div className="glass panel">
          <div>
            <span className="lab">En caja</span>
            <span className="fig">{caja ? formatoDinero(caja.esperado) : "Cerrada"}</span>
            <span className="ctx">{caja ? "Efectivo que debe haber" : <Link href="/caja">Abrir la caja</Link>}</span>
          </div>
        </div>
        <div className="glass panel">
          <div>
            <span className="lab">Por cliente</span>
            <span className="fig">{hoyR.clientes ? formatoDinero(Math.round(hoyR.ticket / 100) * 100) : "Sin datos"}</span>
            <span className="ctx">{semanaPasada.clientes ? `El ${fechaLarga(hoy).split(" ")[0].toLowerCase()} pasado fue ${formatoDinero(Math.round(semanaPasada.ticket / 100) * 100)}` : "Lo que deja cada cliente en promedio"}</span>
          </div>
        </div>
        <div className="glass panel">
          <div>
            <span className="lab">Equipo hoy</span>
            {hoyR.porBarbero.length === 0 ? (
              <span className="ctx">Aún nadie ha cobrado.</span>
            ) : (
              <div className="lista" style={{ marginTop: 6 }}>
                {hoyR.porBarbero.slice(0, 3).map((b) => (
                  <div key={b.id}>
                    <span>{b.nombre.split(" ")[0]}<small>{b.servicios} {b.servicios === 1 ? "servicio" : "servicios"}</small></span>
                    <span className="num">{formatoDinero(b.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {idea && (
        <section className="glass idea">
          <span className="punto" aria-hidden="true">✦</span>
          <p>
            <b>{idea.titulo}</b>
            <br />
            <span>{idea.texto}</span>
          </p>
          {idea.href && <Link className="btn pri" href={idea.href}>Verla</Link>}
        </section>
      )}
    </>
  );
}

async function siguienteIdea(barberiaId: string, zona: string, hoy: string, puede: boolean) {
  if (!puede) return null;
  const det = detectarFranjas(await serviciosParaIdeas(barberiaId, zona), hoy);
  if (det.listo && det.flojas[0]) {
    return { titulo: `${describirFranja(det.flojas[0])} están tranquilos.`, texto: "Hay una idea lista para llenarlos.", href: "/ideas" };
  }
  const f = fechasComerciales(hoy, 14)[0];
  if (f) return { titulo: `Viene ${f.titulo.toLowerCase()} el ${fechaLarga(f.fecha).toLowerCase()}.`, texto: f.consejo, href: "/ideas" };
  return null;
}

function Linea({ serie }: { serie: number[] }) {
  const max = Math.max(...serie, 1);
  const w = 420, h = 60;
  const pts = serie.map((v, i) => [(i * w) / (serie.length - 1), h - 6 - (v / max) * (h - 14)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const ult = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "min(420px, 100%)", marginTop: 22, overflow: "visible" }} role="img" aria-label="Ventas de los últimos 8 días">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="var(--accent)" opacity={0.1} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ult[0]} cy={ult[1]} r={4} fill="var(--accent)" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

async function MiDia(p: { barberiaId: string; usuarioId: string; nombre: string; hoy: string; zona: string; aviso: React.ReactNode }) {
  const { ventas } = await ventasEntre(p.barberiaId, p.hoy, p.hoy, { barberoId: p.usuarioId });
  const mios = ventas
    .filter((v) => v.estado === "pagada")
    .flatMap((v) => v.conceptos.filter((c) => c.barberoId === p.usuarioId).map((c) => ({ ...c, hora: v.creadoEn })));
  const total = mios.reduce((a, c) => a + c.precioCobrado, 0);
  const comision = mios.reduce((a, c) => a + c.comision, 0);
  const propinas = ventas.filter((v) => v.estado === "pagada").flatMap((v) => v.propinas).filter((x) => x.barberoId === p.usuarioId).reduce((a, x) => a + x.monto, 0);
  return (
    <>
      {p.aviso}
      <section className="pila centro" style={{ display: "grid", gap: 0, paddingTop: 12 }}>
        <span className="lab">{fechaLarga(p.hoy)}</span>
        <span className="muted" style={{ margin: "14px 0 6px" }}>Hola, {p.nombre.split(" ")[0]}. Llevas hoy</span>
        <div className="big"><small>$</small>{(total / 100).toLocaleString("en-US")}</div>
        <span className="muted" style={{ marginTop: 10 }}>en {mios.length} {mios.length === 1 ? "servicio" : "servicios"}</span>
      </section>
      <section className="dos">
        <div className="glass panel">
          <span className="lab">Lo que hiciste hoy</span>
          {mios.length === 0 ? (
            <p className="muted">Todavía no registras servicios.</p>
          ) : (
            <div className="lista">
              {mios.map((c, i) => (
                <div key={i}><span>{c.nombre}<small>{horaCorta(c.hora, p.zona)}</small></span><span className="num">{formatoDinero(c.precioCobrado)}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="pila">
          <div className="glass panel"><div><span className="lab">Tu comisión estimada</span><span className="fig">{formatoDinero(comision)}</span><span className="ctx">Según tu forma de pago</span></div></div>
          <div className="glass panel"><div><span className="lab">Propinas</span><span className="fig">{formatoDinero(propinas)}</span><span className="ctx">Son tuyas, van aparte</span></div></div>
          <Link className="btn pri grande" href="/cobrar">Registrar servicio</Link>
        </div>
      </section>
    </>
  );
}
