import Link from "next/link";
import { eq } from "drizzle-orm";
import { Ayuda } from "@/components/Ayuda";
import type { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fechaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { cuentasEnCurso } from "./equipo/datos";

type Sesion = Awaited<ReturnType<typeof requerirSesion>>;
export type Ganado = { renta: boolean; total: number; pagado: number; saldo: number; periodo: string; frecuencia: string; modalidad: string; pago: string; hoy: boolean; verEquipo: boolean };

/**
 * Lo que la persona lleva ganado en su periodo de pago en curso (o lo que debe de renta de silla).
 * Siempre es la cuenta de quien tiene la sesión: nadie ve aquí lo de otra persona.
 */
export async function ganadoDe(s: Sesion, zona: string, hoy: string): Promise<Ganado | null> {
  try {
    const [yo] = await db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios).where(eq(schema.usuarios.id, s.usuario.id)).limit(1);
    if (!yo) return null;
    const [c] = await cuentasEnCurso(s.barberia.id, zona, [yo], false);
    if (!c || c.sinRegla) return null;
    return {
      renta: c.renta, total: c.cifras.comision + c.cifras.sueldo, pagado: c.cifras.pagado, saldo: c.saldo, periodo: c.cifras.periodo, frecuencia: c.frecuencia, modalidad: c.modalidad,
      pago: c.pago, hoy: c.pago === hoy, verEquipo: s.puede("equipo.pagar") || s.puede("ventas.ver_todas"),
    };
  } catch (err) {
    console.error("ganado", err);
    return null;
  }
}

export function TarjetaGanado({ g, className = "" }: { g: Ganado; className?: string }) {
  const cuando = g.hoy ? "hoy" : `el ${fechaCorta(g.pago)}`;
  return (
    <section className={`glass ini-card ini-ganado ${className}`} aria-label={g.renta ? "Tu renta de silla" : "Lo que llevas ganado"}>
      <span className="lab lab-ay">{g.renta ? "Tu renta de silla" : "Llevas ganado"}
        <Ayuda titulo={g.renta ? "Tu renta de silla" : "Llevas ganado"}>{g.renta
          ? "Lo que te falta pagar de renta en este periodo. Lo que cobras por tus servicios es tuyo."
          : `Lo que te toca por los servicios que atendiste en este periodo, según cómo se te paga (${g.modalidad.toLowerCase()}, ${g.frecuencia.toLowerCase()}). Las propinas van aparte.`}</Ayuda>
      </span>
      <div className="ig-fila">
        <b className="ig-num">{formatoDinero(g.renta ? g.saldo : g.total)}</b>
        <span className="ig-det">
          <span>{g.periodo}</span>
          <span>{g.renta ? (g.saldo > 0 ? `Se paga ${cuando}` : "Estás al corriente") : `Se te paga ${cuando}`}</span>
          {!g.renta && g.pagado > 0 && <span>Ya recibiste {formatoDinero(g.pagado)}{g.saldo > 0 ? `, faltan ${formatoDinero(g.saldo)}` : ""}</span>}
        </span>
      </div>
      {g.verEquipo && <Link className="ini-link" href="/equipo">Ver lo del equipo</Link>}
    </section>
  );
}
