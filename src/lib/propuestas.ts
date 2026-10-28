// Arma las ideas comerciales: lo que se ve en las ventas y las fechas que vienen.

import { desc, eq } from "drizzle-orm";
import { serviciosParaIdeas } from "./datos";
import { db, schema } from "./db";
import { diasEntre, fechaLarga, fechaLocal, nombreDia } from "./fechas";
import { describirFranja, detectarFranjas, fechasComerciales } from "./ideas";

export type Propuesta = { clave: string; etiqueta: string; titulo: string; detalle: string; pasos: string[]; tipo: "floja" | "pico" | "fecha" };

export async function propuestas(barberiaId: string, zona: string) {
  const hoy = fechaLocal(new Date(), zona);
  const [det, decididas] = await Promise.all([
    serviciosParaIdeas(barberiaId, zona).then((x) => detectarFranjas(x, hoy)),
    db.select().from(schema.ideas).where(eq(schema.ideas.barberiaId, barberiaId)).orderBy(desc(schema.ideas.creadoEn)).limit(20),
  ]);
  const ya = new Set(decididas.map((d) => d.clave));
  const lista: Propuesta[] = [];
  if (det.listo) {
    for (const f of det.flojas) {
      lista.push({
        tipo: "floja", clave: `floja-${f.dia}-${f.desde}-${f.hasta}`, etiqueta: "Visto en tus ventas",
        titulo: `${describirFranja(f)} llegan pocos clientes`,
        detalle: `En ese horario se hacen ${Math.round(f.relacion * 100)} servicios por cada 100 de una hora normal.`,
        pasos: [
          `Paquete corte y barba con precio especial, solo ${nombreDia(f.dia)} de ${f.desde} a ${f.hasta}.`,
          "Una historia el día anterior avisando que hay lugares.",
          "Probarlo dos semanas y comparar antes de decidir si se queda.",
        ],
      });
    }
    for (const f of det.picos) {
      lista.push({
        tipo: "pico", clave: `pico-${f.dia}-${f.desde}-${f.hasta}`, etiqueta: "Horario que ya se llena",
        titulo: `${describirFranja(f)} hay mucho trabajo`, detalle: "Ahí no hace falta descuento.",
        pasos: ["No promociones ese horario.", "Que estén todas las sillas ocupadas.", "Invita a reservar con anticipación para no perder clientes."],
      });
    }
  }
  for (const f of fechasComerciales(hoy, 45)) {
    const faltan = diasEntre(hoy, f.fecha);
    lista.push({
      tipo: "fecha", clave: `fecha-${f.fecha}-${f.titulo}`,
      etiqueta: faltan === 0 ? "Es hoy" : `Faltan ${faltan} ${faltan === 1 ? "día" : "días"}${f.aproximada ? ", fecha aproximada" : ""}`,
      titulo: f.titulo, detalle: `${fechaLarga(f.fecha)}. ${f.consejo}`, pasos: [],
    });
  }
  const pendientes = lista.filter((p) => !ya.has(p.clave));
  // La idea del día: la de ventas si hay; si no, la fecha importante más cercana (no la quincena).
  const destacada = pendientes.find((p) => p.tipo === "floja") ?? pendientes.find((p) => p.tipo === "fecha" && p.titulo !== "Quincena") ?? pendientes[0] ?? null;
  return {
    aprendiendo: det.listo ? null : { semanas: det.semanasConDatos, faltan: det.faltan },
    destacada,
    resto: pendientes.filter((p) => p !== destacada).slice(0, 6),
    decididas: decididas.slice(0, 6).map((d) => ({ id: d.id, titulo: d.titulo, estado: d.estado })),
  };
}
