import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { Icono } from "@/components/Icono";
import { guardarAgenda } from "./actions";
import { CopiarEnlace } from "./CopiarEnlace";

const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default async function AjustesCitas({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const s = await requerirSesion();
  const [p, barberia] = await Promise.all([searchParams, db.select().from(schema.barberias).where(eq(schema.barberias.id, s.barberia.id)).then((r) => r[0])]);
  const horario = (barberia?.horarioAgenda ?? {}) as Record<string, { abierto?: boolean; abre?: string; cierra?: string }>;
  const url = `/agendar/${s.barberia.id}`;
  return <div className="pila">
    <div className="cab-pagina"><div><span className="eyebrow">CONFIGURACIÓN</span><h1>Citas y agenda</h1><p>Define cuándo pueden reservar tus clientes y comparte el enlace de citas.</p></div></div>
    {p.guardado && <div className="aviso ok">Horarios guardados.</div>}
    {p.error && <div className="aviso">Revisa los horarios. Usa intervalos de 15 minutos y al menos un día abierto.</div>}
    <section className="panel pila">
      <div className="fila entre"><div><h2>Enlace para clientes</h2><p className="muted">Cualquier cliente con este enlace puede reservar.</p></div><span className={`etiqueta ${barberia?.agendaActiva ? "verde" : ""}`}>{barberia?.agendaActiva ? "Activo" : "Desactivado"}</span></div>
      <div className="fila entre"><a className="mono-t" href={url} target="_blank" rel="noreferrer">{url}</a><CopiarEnlace path={url} /></div>
      <p className="muted">El enlace se activa al guardar la agenda. En Vercel, se compartirá con el dominio publicado.</p>
    </section>
    <form action={guardarAgenda} className="panel pila">
      <div><h2>Horario semanal</h2><p className="muted">Los espacios se ofrecen cada 15 minutos según la duración del servicio.</p></div>
      <div className="agenda-config">
        {dias.map((dia, i) => { const h = horario[String(i)]; return <div className="agenda-config-dia" key={dia}>
          <label className="check"><input type="checkbox" name={`abierto_${i}`} defaultChecked={h?.abierto ?? false} /><b>{dia}</b></label>
          <label>Abre<input type="time" name={`abre_${i}`} step="900" defaultValue={h?.abre ?? "10:00"} /></label>
          <label>Cierra<input type="time" name={`cierra_${i}`} step="900" defaultValue={h?.cierra ?? "19:00"} /></label>
        </div>; })}
      </div>
      <label className="interruptor-r"><span><b>Activar reservas públicas</b><small>Los clientes podrán elegir servicio, barbero y horario disponible.</small></span><input type="checkbox" name="agendaActiva" defaultChecked={barberia?.agendaActiva ?? false} /></label>
      <div className="fila"><button className="bt primario" type="submit"><Icono n="palomita" /> Guardar agenda</button></div>
    </form>
  </div>;
}
