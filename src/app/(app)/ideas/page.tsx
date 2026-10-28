import { desc, eq } from "drizzle-orm";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { serviciosParaIdeas } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, fechaLarga, fechaLocal, nombreDia } from "@/lib/fechas";
import { describirFranja, detectarFranjas, fechasComerciales } from "@/lib/ideas";
import { decidirIdea } from "./actions";

export const metadata = { title: "Ideas" };

type Propuesta = { clave: string; etiqueta: string; titulo: string; detalle: string; pasos: string[] };

export default async function Ideas({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ideas.decidir");
  const q = await searchParams;
  const hoy = fechaLocal(new Date(), s.barberia.zonaHoraria);
  const [det, decididas] = await Promise.all([
    serviciosParaIdeas(s.barberia.id, s.barberia.zonaHoraria).then((x) => detectarFranjas(x, hoy)),
    db.select().from(schema.ideas).where(eq(schema.ideas.barberiaId, s.barberia.id)).orderBy(desc(schema.ideas.creadoEn)).limit(30),
  ]);
  const yaDecidida = new Set(decididas.map((d) => d.clave));

  const propuestas: Propuesta[] = [];
  if (det.listo) {
    for (const f of det.flojas) {
      propuestas.push({
        clave: `floja-${f.dia}-${f.desde}-${f.hasta}`,
        etiqueta: "Lo vimos en tus ventas",
        titulo: `${describirFranja(f)} llegan pocos clientes.`,
        detalle: `Tienen ${Math.round(f.relacion * 100)}% de los servicios de una hora normal del negocio.`,
        pasos: [
          `Un paquete corte y barba con precio especial, solo ${nombreDia(f.dia)} de ${f.desde} a ${f.hasta}.`,
          "Una historia el día anterior para avisar que hay lugares.",
          "Probarlo dos semanas y comparar servicios e ingreso por hora antes de decidir si se queda.",
        ],
      });
    }
    for (const f of det.picos) {
      propuestas.push({
        clave: `pico-${f.dia}-${f.desde}-${f.hasta}`,
        etiqueta: "Horario que ya se llena",
        titulo: `${describirFranja(f)} hay mucho trabajo.`,
        detalle: "Ahí no hace falta descuento.",
        pasos: ["No promociones ese horario.", "Asegura que estén todas las sillas ocupadas por barberas.", "Invita a reservar con anticipación para no perder clientes."],
      });
    }
  }
  for (const f of fechasComerciales(hoy, 45)) {
    const faltan = diasEntre(hoy, f.fecha);
    propuestas.push({
      clave: `fecha-${f.fecha}-${f.titulo}`,
      etiqueta: faltan === 0 ? "Es hoy" : `En ${faltan} ${faltan === 1 ? "día" : "días"}${f.aproximada ? ", fecha aproximada" : ""}`,
      titulo: `${f.titulo}, ${fechaLarga(f.fecha).toLowerCase()}.`,
      detalle: f.consejo,
      pasos: [],
    });
  }
  const pendientes = propuestas.filter((p) => !yaDecidida.has(p.clave));
  const a = q.aviso ? AVISOS[q.aviso] : undefined;

  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado etiqueta="Calendario comercial" titulo="Ideas para vender más" sub="Son propuestas. Nada se publica ni cambia de precio sin tu aprobación." />

      {!det.listo && (
        <div className="glass idea">
          <span className="punto" aria-hidden="true">…</span>
          <p>
            <b>Todavía estoy aprendiendo cómo se mueve el negocio.</b>
            <br />
            <span>
              Con {det.semanasConDatos} {det.semanasConDatos === 1 ? "semana" : "semanas"} de ventas registradas aún no se puede decir qué horarios están tranquilos.
              Faltan {det.faltan} {det.faltan === 1 ? "semana" : "semanas"}. Mientras, aquí están las fechas que vienen.
            </span>
          </p>
        </div>
      )}

      <section className="dos">
        <div className="pila">
          {pendientes.length === 0 && <p className="muted">No hay ideas nuevas por ahora.</p>}
          {pendientes.map((p) => (
            <article key={p.clave} className="glass panel panel-grande">
              <span className="lab">{p.etiqueta}</span>
              <h2 style={{ font: "600 20px/1.3 var(--f-body)" }}>{p.titulo}</h2>
              <p className="muted">{p.detalle}</p>
              {p.pasos.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>{p.pasos.map((x) => <li key={x}>{x}</li>)}</ul>}
              <form action={decidirIdea} className="pila-chica">
                <input type="hidden" name="clave" value={p.clave} />
                <input type="hidden" name="titulo" value={p.titulo} />
                <input className="input" name="nota" placeholder="Si la ajustas, escribe cómo (precio, días, condiciones)" />
                <div className="fila">
                  <button className="btn pri" name="estado" value="aprobada">Aprobar</button>
                  <button className="btn" name="estado" value="descartada">Descartar</button>
                </div>
              </form>
            </article>
          ))}
        </div>
        <div className="glass panel">
          <span className="lab">Decisiones anteriores</span>
          {decididas.length === 0 ? <p className="muted">Aún no has decidido ninguna idea.</p> : (
            <div className="lista">
              {decididas.map((d) => (
                <div key={d.id}>
                  <span>{d.titulo}<small>{d.nota || (d.estado === "aprobada" ? "Aprobada tal cual" : "Descartada")}</small></span>
                  <span className={`chip ${d.estado === "aprobada" ? "ok" : "gris"}`}>{d.estado === "aprobada" ? "Aprobada" : "Descartada"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
