import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { describirRegla, elegirRegla, resumenSemana } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, pagosComisionSemana, reglasDe, ventasEntre } from "@/lib/datos";
import { esFechaValida, fechaCorta, fechaLocal, lunesDe, sumarDias } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { Pagar } from "./Pagar";

export const metadata = { title: "Equipo" };

function Anillo({ avance }: { avance: number }) {
  const c = 2 * Math.PI * 11;
  return (
    <svg className="anillo" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" stroke="var(--accent-soft)" />
      <circle cx="14" cy="14" r="11" stroke={avance >= 1 ? "var(--ok)" : "var(--accent)"} strokeDasharray={`${c * Math.min(avance, 1)} ${c}`} strokeLinecap="round" transform="rotate(-90 14 14)" />
    </svg>
  );
}

export default async function Equipo({ searchParams }: { searchParams: Promise<{ semana?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("equipo.ver")) redirect("/mis-ventas");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const lunes = lunesDe(esFechaValida(q.semana) ? q.semana : hoy);
  const domingo = sumarDias(lunes, 6);
  const [equipo, reglas, pagos, { ventas }] = await Promise.all([
    equipoQueAtiende(s.barberia.id), reglasDe(s.barberia.id), pagosComisionSemana(s.barberia.id, lunes), ventasEntre(s.barberia.id, lunes, domingo, { zona }),
  ]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const finSemana = new Date(`${domingo}T23:59:59-06:00`);

  const fichas = equipo.map((p) => {
    const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === p.id));
    const regla = copiaRegla(elegirRegla(reglas, p.id, null, finSemana < new Date() ? finSemana : new Date()));
    const r = resumenSemana({
      reglaGeneral: regla, servicios: cs.length,
      vendido: cs.reduce((a, c) => a + c.precioCobrado, 0),
      comisiones: cs.reduce((a, c) => a + c.comision, 0),
      propinas: pagadas.flatMap((v) => v.propinas).filter((x) => x.barberoId === p.id).reduce((a, x) => a + x.monto, 0),
      pagado: pagos.filter((x) => x.barberoId === p.id && x.tipo === "pago").reduce((a, x) => a + x.monto, 0),
      rentaPagada: pagos.filter((x) => x.barberoId === p.id && x.tipo === "renta").reduce((a, x) => a + x.monto, 0),
    });
    return { p, regla, r };
  });

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="entre">
        <div>
          <span className="lab">Del {fechaCorta(lunes)} al {fechaCorta(domingo)}</span>
          <h1 className="titulo" style={{ marginTop: 8 }}>El equipo esta semana</h1>
          <p className="sub">Las propinas son de cada quien y no entran en estas cuentas.</p>
        </div>
        <div className="fila">
          <Link className="icb" href={`/analitica/equipo?semana=${sumarDias(lunes, -7)}`} aria-label="Semana anterior"><Icono n="izquierda" /></Link>
          {lunes < lunesDe(hoy) && <Link className="icb" href={`/analitica/equipo?semana=${sumarDias(lunes, 7)}`} aria-label="Semana siguiente"><Icono n="derecha" /></Link>}
        </div>
      </div>

      {fichas.length === 0 ? <p className="muted">Todavía no hay barberos dados de alta.</p> : (
        <section className="glass panel tabla-wrap subir">
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th className="der">Servicios</th>
                <th className="der">Ventas generadas</th>
                <th className="der">Le corresponde<Ayuda titulo="Le corresponde">Comisión de la semana, más su sueldo si tiene uno.</Ayuda></th>
                <th className="der">Pagado</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fichas.map(({ p, regla, r }) => {
                const esRenta = regla?.tipo === "renta";
                return (
                  <tr key={p.id}>
                    <td><span className="persona"><Avatar avatar={p.avatar} nombre={p.nombre} t={36} /><span><b style={{ fontWeight: 600 }}>{p.nombre}</b><small className="muted" style={{ display: "block", fontSize: 12 }}>{describirRegla(regla, formatoDinero)}</small></span></span></td>
                    <td className="der num">{r.servicios}</td>
                    <td className="der num">{formatoDinero(r.vendido)}</td>
                    <td className="der num">{esRenta ? <span className="muted">No aplica</span> : formatoDinero(r.leToca)}</td>
                    <td className="der num">{esRenta ? formatoDinero(r.rentaPagada) : formatoDinero(r.pagado)}</td>
                    <td>
                      {esRenta ? (
                        r.rentaPendiente > 0
                          ? <span className="fila" style={{ gap: 8, fontSize: 13 }}><Anillo avance={r.renta ? r.rentaPagada / r.renta : 0} />Renta pendiente, {formatoDinero(r.rentaPendiente)}</span>
                          : <span className="cubierto"><i>✓</i>Renta cubierta</span>
                      ) : r.leToca === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin saldo</span> : r.pendiente > 0
                        ? <span className="fila" style={{ gap: 8, fontSize: 13 }}><Anillo avance={r.pagado / r.leToca} />Por pagar, {formatoDinero(r.pendiente)}</span>
                        : <span className="cubierto"><i>✓</i>Pagado</span>}
                    </td>
                    <td className="der">{s.puede("equipo.pagar") && <Pagar id={p.id} nombre={p.nombre} semana={lunes} renta={esRenta} pendiente={formatoDinero(esRenta ? r.rentaPendiente : r.pendiente)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {s.puede("ajustes.usuarios") && <p className="ayuda-txt">La forma de pago de cada persona se cambia en <Link href="/ajustes/equipo">Ajustes</Link>.</p>}
    </>
  );
}
