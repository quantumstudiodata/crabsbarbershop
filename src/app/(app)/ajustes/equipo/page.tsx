import { and, eq, isNull } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { describirRegla } from "@/lib/comisiones";
import { equipoQueAtiende, serviciosActivos } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";
import { quitarRegla } from "./actions";
import { FormaPago } from "./FormaPago";

export const metadata = { title: "Formas de pago del equipo" };

export default async function ReglasEquipo({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ajustes.usuarios");
  const q = await searchParams;
  const [equipo, servicios, reglas] = await Promise.all([
    equipoQueAtiende(s.barberia.id), serviciosActivos(s.barberia.id),
    db.select().from(schema.reglasComision).where(and(eq(schema.reglasComision.barberiaId, s.barberia.id), isNull(schema.reglasComision.vigenteHasta))),
  ]);
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div>
        <h1 className="titulo">Formas de pago del equipo
          <Ayuda titulo="¿Qué es esto?">
            Define cómo gana cada persona: un porcentaje o monto por servicio, renta de silla, sueldo fijo, o sueldo más porcentaje.
            <br /><br />Con esto se calcula lo que le corresponde cada semana en Analítica, Equipo. Las propinas siempre son aparte.
          </Ayuda>
        </h1>
        <p className="sub">Cada persona puede tener la suya.</p>
      </div>
      <div className="glass panel" style={{ padding: "6px 10px 12px" }}>
        {equipo.length === 0 && <p className="muted" style={{ padding: 12 }}>Todavía no hay barberos dados de alta.</p>}
        {equipo.map((p) => {
          const general = reglas.find((r) => r.barberoId === p.id && !r.servicioId) ?? null;
          const especiales = reglas.filter((r) => r.barberoId === p.id && r.servicioId);
          return (
            <div key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
              <div className="fila-p" style={{ gridTemplateColumns: "46px minmax(0,1fr) auto" }}>
                <Avatar avatar={p.avatar} nombre={p.nombre} t={42} />
                <span><b>{p.nombre}</b><small>{describirRegla(general, formatoDinero)}</small></span>
                <span className="acts"><FormaPago id={p.id} nombre={p.nombre} actual={general} /></span>
              </div>
              {especiales.map((r) => (
                <div key={r.id} className="entre" style={{ padding: "4px 12px 10px 70px", fontSize: 13 }}>
                  <span className="muted">{servicios.find((x) => x.id === r.servicioId)?.nombre ?? "Servicio"}: {describirRegla(r, formatoDinero)}</span>
                  <form action={quitarRegla}><input type="hidden" name="id" value={r.id} /><button className="icb peligro" aria-label="Quitar regla" title="Quitar"><Icono n="basura" /></button></form>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
