import { and, asc, eq, gte, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CitasPage() {
  const s = await requerirSesion();
  const ahora = new Date();
  const citas = await db.select({ cita: schema.citas, barbero: schema.usuarios.nombre }).from(schema.citas)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.citas.barberoId))
    .where(and(eq(schema.citas.barberiaId, s.barberia.id), gte(schema.citas.iniciaEn, ahora), ne(schema.citas.estado, "cancelada")))
    .orderBy(asc(schema.citas.iniciaEn)).limit(150);
  const siguiente = citas[0]?.cita;
  return <div className="pila">
    <div className="cab-pagina"><div><span className="eyebrow">OPERACIÓN</span><h1>Citas y agenda</h1><p>Próximos clientes, horarios y estado de pago.</p></div>{s.puede("configuracion.cobros") && <a className="bt" href="/ajustes/citas">Configurar agenda</a>}</div>
    {siguiente ? <section className="siguiente-cita"><div><span className="eyebrow">SIGUE</span><h2>{siguiente.clienteNombre}</h2><p>{fechaLarga(fechaLocal(siguiente.iniciaEn, s.barberia.zonaHoraria))} · {horaCorta(siguiente.iniciaEn, s.barberia.zonaHoraria)}</p></div><div><b>{siguiente.servicioNombre}</b><small>con {citas[0].barbero}</small></div><span className={`etiqueta ${siguiente.estadoPago === "pagado" ? "verde" : "ambar"}`}>{siguiente.estadoPago === "pagado" ? "Pagada" : "Pago pendiente"}</span></section> : <section className="panel vacio"><h2>No hay próximas citas</h2><p className="muted">Las nuevas reservas aparecerán aquí.</p></section>}
    <section className="panel pila"><div className="fila entre"><h2>Próximas citas</h2><span className="muted">{citas.length} reservadas</span></div>
      {citas.length === 0 ? <p className="muted">Cuando un cliente reserve, podrás ver aquí quién sigue.</p> : <div className="citas-lista">{citas.map(({ cita, barbero }) => <article className="cita-fila" key={cita.id}>
        <div className="cita-hora"><b>{horaCorta(cita.iniciaEn, s.barberia.zonaHoraria)}</b><small>{fechaLarga(fechaLocal(cita.iniciaEn, s.barberia.zonaHoraria))}</small></div>
        <div className="cita-cliente"><b>{cita.clienteNombre}</b><small>{cita.clienteTelefono}{cita.clienteEmail ? ` · ${cita.clienteEmail}` : ""}</small></div>
        <div className="cita-servicio"><b>{cita.servicioNombre}</b><small>{barbero} · {cita.duracionMin} min</small></div>
        <div className="cita-precio"><b>{formatoDinero(cita.precio)}</b><span className={`etiqueta ${cita.estadoPago === "pagado" ? "verde" : "ambar"}`}>{cita.estadoPago === "pagado" ? "Pagada" : "Sin pago"}</span></div>
      </article>)}</div>}
    </section>
  </div>;
}
