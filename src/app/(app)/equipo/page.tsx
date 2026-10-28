import Link from "next/link";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { describirRegla, elegirRegla, resumenSemana } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, pagosComisionSemana, reglasDe, ventasEntre } from "@/lib/datos";
import { esFechaValida, fechaCorta, fechaLocal, lunesDe, sumarDias } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { registrarPago } from "./actions";

export const metadata = { title: "Equipo" };

export default async function Equipo({ searchParams }: { searchParams: Promise<{ semana?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  const hoy = fechaLocal(new Date(), s.barberia.zonaHoraria);
  const lunes = lunesDe(esFechaValida(q.semana) ? q.semana : hoy);
  const domingo = sumarDias(lunes, 6);
  const verTodos = s.puede("equipo.ver");

  const [equipo, reglas, pagos, { ventas }] = await Promise.all([
    equipoQueAtiende(s.barberia.id), reglasDe(s.barberia.id), pagosComisionSemana(s.barberia.id, lunes), ventasEntre(s.barberia.id, lunes, domingo),
  ]);
  const personas = verTodos ? equipo : equipo.filter((e) => e.id === s.usuario.id);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const finSemana = new Date(`${domingo}T23:59:59-06:00`);

  const fichas = personas.map((p) => {
    const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === p.id));
    const regla = copiaRegla(elegirRegla(reglas, p.id, null, finSemana < new Date() ? finSemana : new Date()));
    const r = resumenSemana({
      reglaGeneral: regla,
      servicios: cs.length,
      vendido: cs.reduce((a, c) => a + c.precioCobrado, 0),
      comisiones: cs.reduce((a, c) => a + c.comision, 0),
      propinas: pagadas.flatMap((v) => v.propinas).filter((x) => x.barberoId === p.id).reduce((a, x) => a + x.monto, 0),
      pagado: pagos.filter((x) => x.barberoId === p.id && x.tipo === "pago").reduce((a, x) => a + x.monto, 0),
      rentaPagada: pagos.filter((x) => x.barberoId === p.id && x.tipo === "renta").reduce((a, x) => a + x.monto, 0),
    });
    return { p, regla, r };
  });
  const a = q.aviso ? AVISOS[q.aviso] : undefined;

  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado
        etiqueta={`Del ${fechaCorta(lunes)} al ${fechaCorta(domingo)}`}
        titulo={verTodos ? "El equipo esta semana" : "Mi semana"}
        sub="Las propinas son de cada barbera y no cuentan aquí."
      >
        <Link className="btn" href={`/equipo?semana=${sumarDias(lunes, -7)}`}>Semana anterior</Link>
        {lunes < lunesDe(hoy) && <Link className="btn" href={`/equipo?semana=${sumarDias(lunes, 7)}`}>Siguiente</Link>}
      </Encabezado>

      {fichas.length === 0 ? (
        <p className="muted">Todavía no hay barberas dadas de alta.</p>
      ) : (
        <section className="tres">
          {fichas.map(({ p, regla, r }) => (
            <article key={p.id} className="glass panel">
              <div className="fila">
                <span className="av">{p.nombre[0]}</span>
                <span><b>{p.nombre}</b><small className="muted" style={{ display: "block", fontSize: 12 }}>{describirRegla(regla, formatoDinero)}</small></span>
              </div>
              <div className="separador" />
              <div className="renglon"><span>Servicios</span><span className="num">{r.servicios}</span></div>
              <div className="renglon"><span>{regla?.tipo === "renta" ? "Cobró para ella" : "Vendió"}</span><span className="num">{formatoDinero(r.vendido)}</span></div>
              {r.sueldo > 0 && <div className="renglon"><span>Sueldo de la semana</span><span className="num">{formatoDinero(r.sueldo)}</span></div>}
              <div className="renglon"><span>Le toca</span><span className="num">{formatoDinero(r.leToca)}</span></div>
              <div className="renglon"><span>Ya se le dio</span><span className="num">{formatoDinero(r.pagado)}</span></div>
              <div className="renglon resaltado"><b>{r.pendiente > 0 ? "Falta pagarle" : "Va al día"}</b><b>{r.pendiente > 0 ? formatoDinero(r.pendiente) : "✓"}</b></div>
              {r.renta > 0 && (
                <div className="renglon resaltado"><b>{r.rentaPendiente > 0 ? "Debe de renta" : "Renta pagada"}</b><b>{r.rentaPendiente > 0 ? formatoDinero(r.rentaPendiente) : "✓"}</b></div>
              )}
              <div className="renglon"><span>Propinas<small>Son suyas, aparte</small></span><span className="num">{formatoDinero(r.propinas)}</span></div>
              {s.puede("equipo.pagar") && (
                <details>
                  <summary className="btn" style={{ width: "100%" }}>Registrar pago</summary>
                  <form action={registrarPago} className="pila-chica" style={{ marginTop: 12 }}>
                    <input type="hidden" name="barberoId" value={p.id} />
                    <input type="hidden" name="semana" value={lunes} />
                    <div className="opciones">
                      <label className="opcion"><input type="radio" name="tipo" value="pago" defaultChecked /><span>Le pagamos</span></label>
                      {regla?.tipo === "renta" && <label className="opcion"><input type="radio" name="tipo" value="renta" /><span>Pagó renta</span></label>}
                    </div>
                    <input className="input" name="monto" inputMode="decimal" placeholder="Monto" required />
                    <input className="input" name="nota" placeholder="Nota (opcional)" />
                    <button className="btn pri">Guardar</button>
                  </form>
                </details>
              )}
            </article>
          ))}
        </section>
      )}
      {verTodos && s.puede("ajustes.usuarios") && <p className="ayuda">La forma de pago de cada barbera se cambia en <Link href="/ajustes/equipo">Ajustes</Link>.</p>}
    </>
  );
}
