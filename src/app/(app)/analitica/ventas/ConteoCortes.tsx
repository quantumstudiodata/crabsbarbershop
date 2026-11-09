import Link from "next/link";
import { eq } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { equipoConVentas, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { inicioDeMes, lunesDe } from "@/lib/fechas";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿El servicio es un corte? ¿Lleva barba? Se decide por el nombre y la descripción del servicio. */
export function tipoDeCorte(nombre: string, descripcion: string) {
  const t = norm(`${nombre} ${descripcion}`);
  const corte = /\bcorte|\bfade\b|\bcabello\b/.test(t);
  const barba = /\bbarba\b/.test(t);
  return { corte, conBarba: corte && barba };
}

/** Cuántos cortes y cuántos cortes con barba hizo cada barbero en la semana o el mes. */
export async function ConteoCortes({ barberiaId, zona, hoy, modo, base, soloDe }: { barberiaId: string; zona: string; hoy: string; modo: "semana" | "mes"; base: string; soloDe?: string }) {
  const desde = modo === "semana" ? lunesDe(hoy) : inicioDeMes(hoy);
  const [{ ventas }, equipo, servicios] = await Promise.all([
    ventasEntre(barberiaId, desde, hoy, { zona }),
    equipoConVentas(barberiaId),
    db.select({ id: schema.servicios.id, nombre: schema.servicios.nombre, descripcion: schema.servicios.descripcion }).from(schema.servicios).where(eq(schema.servicios.barberiaId, barberiaId)),
  ]);
  const cs = ventas.filter((v) => v.estado === "pagada").flatMap((v) => v.conceptos);
  const filas = equipo.filter((e) => !soloDe || e.id === soloDe).map((e) => {
    let cortes = 0, conBarba = 0;
    for (const c of cs.filter((x) => x.barberoId === e.id)) {
      const sv = servicios.find((x) => x.id === c.servicioId);
      const t = tipoDeCorte(sv?.nombre ?? c.nombre, sv?.descripcion ?? "");
      if (t.corte) cortes++;
      if (t.conBarba) conBarba++;
    }
    return { ...e, cortes, conBarba };
  }).sort((a, b) => b.cortes - a.cortes);
  const total = filas.reduce((a, f) => ({ cortes: a.cortes + f.cortes, conBarba: a.conBarba + f.conBarba }), { cortes: 0, conBarba: 0 });
  const enlace = (m: string) => `${base}${base.includes("?") ? "&" : "?"}cortes=${m}`;
  return (
    <section className="glass conteo-c subir">
      <div className="entre cab-cc">
        <span className="lab">Cortes por barbero</span>
        <nav className="seg chico" aria-label="Periodo de cortes">
          <Link href={enlace("semana")} scroll={false} aria-current={modo === "semana" ? "page" : undefined}>Semana</Link>
          <Link href={enlace("mes")} scroll={false} aria-current={modo === "mes" ? "page" : undefined}>Mes</Link>
        </nav>
      </div>
      <div className="tabla-cc" role="table" aria-label={`Cortes de ${modo === "semana" ? "esta semana" : "este mes"}`}>
        <div className="fila-cc cab" role="row"><span role="columnheader">Barbero</span><span role="columnheader">Cortes</span><span role="columnheader">Con barba</span></div>
        {filas.map((f) => (
          <div key={f.id} className="fila-cc" role="row">
            <span role="cell" className="persona"><Avatar avatar={f.avatar} nombre={f.nombre} t={24} />{f.nombre.split(" ")[0]}</span>
            <b role="cell" className="num">{f.cortes}</b>
            <b role="cell" className="num">{f.conBarba}</b>
          </div>
        ))}
        {!soloDe && filas.length > 1 && <div className="fila-cc tot" role="row"><span role="cell">Total</span><b role="cell" className="num">{total.cortes}</b><b role="cell" className="num">{total.conBarba}</b></div>}
      </div>
    </section>
  );
}
