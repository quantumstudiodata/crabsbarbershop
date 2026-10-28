import { asc, eq } from "drizzle-orm";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";
import { guardarMetodo, guardarNegocio, guardarServicio } from "./actions";

export const metadata = { title: "Servicios y precios" };
const pesos = (c: number) => String(c / 100);

export default async function Servicios({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ajustes.negocio");
  const q = await searchParams;
  const [servicios, metodos] = await Promise.all([
    db.select().from(schema.servicios).where(eq(schema.servicios.barberiaId, s.barberia.id)).orderBy(asc(schema.servicios.orden), asc(schema.servicios.nombre)),
    db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, s.barberia.id)).orderBy(asc(schema.metodosPago.orden)),
  ]);
  const a = q.aviso ? AVISOS[q.aviso] : undefined;
  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado etiqueta="Ajustes" titulo="Servicios y precios" sub="El precio de aquí es el oficial. Cada cambio queda en el historial." />
      <section className="dos">
        <div className="glass panel" style={{ gap: 0 }}>
          {servicios.map((sv) => (
            <details key={sv.id} style={{ padding: "14px 0", borderTop: "1px solid var(--line)" }}>
              <summary className="entre" style={{ cursor: "pointer", listStyle: "none" }}>
                <span><b className={sv.activo ? "" : "tachado"}>{sv.nombre}</b><small className="muted" style={{ display: "block" }}>{sv.duracionMin} min{sv.activo ? "" : ", oculto"}</small></span>
                <span className="num">{formatoDinero(sv.precio)}</span>
              </summary>
              <FormServicio sv={sv} />
            </details>
          ))}
        </div>
        <div className="glass panel"><span className="lab">Agregar servicio</span><FormServicio /></div>
      </section>

      <section className="dos">
        <div className="glass panel">
          <span className="lab">Formas de pago</span>
          <div className="lista">
            {metodos.map((m) => (
              <form key={m.id} action={guardarMetodo} className="fila">
                <input type="hidden" name="id" value={m.id} />
                <input className="input" name="nombre" defaultValue={m.nombre} style={{ flex: "1 1 140px" }} aria-label="Nombre" />
                <label className="fila" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" name="efectivo" value="si" defaultChecked={m.esEfectivo} /> Entra a la caja</label>
                <select className="input" name="activo" defaultValue={m.activo ? "si" : "no"} style={{ width: "auto" }} aria-label="Estado"><option value="si">Activa</option><option value="no">Oculta</option></select>
                <button className="btn chico">Guardar</button>
              </form>
            ))}
          </div>
          <form action={guardarMetodo} className="fila">
            <input className="input" name="nombre" placeholder="Nueva forma de pago" style={{ flex: "1 1 160px" }} required />
            <button className="btn chico pri">Agregar</button>
          </form>
        </div>
        <form action={guardarNegocio} className="glass panel">
          <span className="lab">Límites del negocio</span>
          <label className="campo"><span>Descuento máximo sin autorización (%)</span><input className="input" name="limiteDescuento" inputMode="numeric" defaultValue={s.barberia.limiteDescuentoPct} /></label>
          <label className="campo"><span>Diferencia de caja que pide explicación</span><input className="input" name="limiteDiferencia" inputMode="decimal" defaultValue={pesos(s.barberia.limiteDiferenciaCaja)} /></label>
          <label className="campo"><span>Meta de ventas por día (opcional)</span><input className="input" name="meta" inputMode="decimal" defaultValue={s.barberia.metaDiaria ? pesos(s.barberia.metaDiaria) : ""} /></label>
          <button className="btn pri">Guardar límites</button>
        </form>
      </section>
    </>
  );
}

function FormServicio({ sv }: { sv?: typeof schema.servicios.$inferSelect }) {
  return (
    <form action={guardarServicio} className="pila" style={{ marginTop: sv ? 14 : 0 }}>
      {sv && <input type="hidden" name="id" value={sv.id} />}
      <label className="campo"><span>Nombre</span><input className="input" name="nombre" defaultValue={sv?.nombre} required /></label>
      <label className="campo"><span>Qué incluye</span><input className="input" name="descripcion" defaultValue={sv?.descripcion} /></label>
      <div className="fila">
        <label className="campo" style={{ flex: "1 1 120px" }}><span>Precio</span><input className="input" name="precio" inputMode="decimal" defaultValue={sv ? pesos(sv.precio) : ""} required /></label>
        <label className="campo" style={{ flex: "1 1 120px" }}><span>Minutos</span><input className="input" name="duracion" inputMode="numeric" defaultValue={sv?.duracionMin ?? 30} required /></label>
      </div>
      {sv && <label className="campo"><span>Estado</span><select className="input" name="activo" defaultValue={sv.activo ? "si" : "no"}><option value="si">Se puede cobrar</option><option value="no">Oculto</option></select></label>}
      <button className="btn pri">{sv ? "Guardar cambios" : "Agregar servicio"}</button>
    </form>
  );
}
