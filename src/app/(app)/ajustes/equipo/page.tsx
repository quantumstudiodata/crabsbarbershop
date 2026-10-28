import { and, eq, isNull } from "drizzle-orm";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { describirRegla } from "@/lib/comisiones";
import { equipoQueAtiende, serviciosActivos } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";
import { guardarRegla, quitarRegla } from "./actions";

export const metadata = { title: "Formas de pago del equipo" };

export default async function ReglasEquipo({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ajustes.usuarios");
  const q = await searchParams;
  const [equipo, servicios, reglas] = await Promise.all([
    equipoQueAtiende(s.barberia.id), serviciosActivos(s.barberia.id),
    db.select().from(schema.reglasComision).where(and(eq(schema.reglasComision.barberiaId, s.barberia.id), isNull(schema.reglasComision.vigenteHasta))),
  ]);
  const a = q.aviso ? AVISOS[q.aviso] : undefined;
  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado etiqueta="Ajustes" titulo="Formas de pago del equipo" sub="Cada barbera puede tener la suya. Si la cambias, lo ya cobrado conserva la regla con la que se cobró." />
      <section className="tres">
        {equipo.map((p) => {
          const general = reglas.find((r) => r.barberoId === p.id && !r.servicioId) ?? null;
          const especiales = reglas.filter((r) => r.barberoId === p.id && r.servicioId);
          return (
            <article key={p.id} className="glass panel">
              <div className="fila"><span className="av">{p.nombre[0]}</span><span><b>{p.nombre}</b><small className="muted" style={{ display: "block", fontSize: 12 }}>{describirRegla(general, formatoDinero)}</small></span></div>
              <FormRegla barberoId={p.id} actual={general} />
              {especiales.length > 0 && (
                <div className="lista">
                  {especiales.map((r) => (
                    <div key={r.id}>
                      <span>{servicios.find((x) => x.id === r.servicioId)?.nombre ?? "Servicio"}<small>{describirRegla(r, formatoDinero)}</small></span>
                      <form action={quitarRegla}><input type="hidden" name="id" value={r.id} /><button className="enlace">Quitar</button></form>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary className="enlace">Regla distinta para un servicio</summary>
                <FormRegla barberoId={p.id} servicios={servicios.map((x) => ({ id: x.id, nombre: x.nombre }))} />
              </details>
            </article>
          );
        })}
      </section>
    </>
  );
}

function FormRegla({ barberoId, actual, servicios }: { barberoId: string; actual?: typeof schema.reglasComision.$inferSelect | null; servicios?: { id: string; nombre: string }[] }) {
  return (
    <form action={guardarRegla} className="pila-chica" style={{ marginTop: 10 }}>
      <input type="hidden" name="barberoId" value={barberoId} />
      {servicios && (
        <label className="campo"><span>Servicio</span><select className="input" name="servicioId" required>{servicios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
      )}
      <label className="campo"><span>Forma de pago</span>
        <select className="input" name="tipo" defaultValue={actual?.tipo ?? "porcentaje"}>
          <option value="porcentaje">Porcentaje de cada servicio</option>
          <option value="fijo">Monto fijo por servicio</option>
          {!servicios && <><option value="renta">Renta de silla</option><option value="sueldo">Sueldo fijo</option><option value="mixto">Sueldo más porcentaje</option></>}
        </select>
      </label>
      <div className="fila">
        <label className="campo" style={{ flex: "1 1 80px" }}><span>%</span><input className="input" name="porcentaje" inputMode="decimal" defaultValue={actual?.porcentaje ? actual.porcentaje / 100 : ""} /></label>
        <label className="campo" style={{ flex: "1 1 90px" }}><span>Por servicio</span><input className="input" name="montoFijo" inputMode="decimal" defaultValue={actual?.montoFijo ? actual.montoFijo / 100 : ""} /></label>
        {!servicios && <label className="campo" style={{ flex: "1 1 90px" }}><span>Por semana</span><input className="input" name="montoSemanal" inputMode="decimal" defaultValue={actual?.montoSemanal ? actual.montoSemanal / 100 : ""} /></label>}
      </div>
      <p className="ayuda">Llena solo lo que aplique. Renta y sueldo son por semana.</p>
      <button className="btn chico pri">Guardar</button>
    </form>
  );
}
