import { asc, eq } from "drizzle-orm";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { Fl, Icono } from "@/components/Icono";
import { Pasos } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { agregarMetodo, guardarReglas } from "./actions";
import { Metodos } from "./Metodos";

export const metadata = { title: "Cobro y caja" };

export default async function CobroYCaja({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ajustes.negocio");
  const q = await searchParams;
  const metodos = await db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, s.barberia.id)).orderBy(asc(schema.metodosPago.orden));
  const b = s.barberia;
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div>
        <h1 className="titulo">Cobro y caja</h1>
        <p className="sub">Cómo pueden pagar los clientes y las reglas al cobrar y cerrar.</p>
      </div>
      <section className="glass panel">
        <span className="lab">Formas de pago<Ayuda titulo="Formas de pago">Las que estén encendidas aparecen en Cobro.<br /><br />Al cerrar la caja, el efectivo se cuenta y las demás se revisan contra el banco o la terminal.</Ayuda></span>
        <Metodos metodos={metodos.map(({ id, nombre, esEfectivo, activo }) => ({ id, nombre, esEfectivo, activo }))} />
        <form action={agregarMetodo} className="fila" style={{ marginTop: 6 }}>
          <input className="input" name="nombre" placeholder="Otra forma de pago, por ejemplo: Vales" style={{ flex: "1 1 220px" }} required aria-label="Nueva forma de pago" />
          <button className="bt sec solo"><Icono n="mas" />Agregar</button>
        </form>
      </section>
      <form action={guardarReglas} className="glass panel">
        <span className="lab">Reglas</span>
        <div className="regla" style={{ borderTop: 0 }}>
          <div><b>Descuento máximo sin autorización</b><p>Un barbero puede descontar hasta este porcentaje. Más que eso, solo el encargado o el propietario.</p></div>
          <Pasos name="descuento" inicial={b.limiteDescuentoPct} max={100} sufijo="%" etiqueta="descuento máximo" />
        </div>
        <div className="regla">
          <div><b>Diferencia permitida al cerrar la caja</b><p>Si al contar falta o sobra más que esto, se pide escribir qué pasó antes de cerrar.</p></div>
          <Pasos name="diferencia" inicial={Math.round(b.limiteDiferenciaCaja / 100)} paso={10} max={100000} prefijo="$" etiqueta="diferencia permitida" />
        </div>
        <div className="regla">
          <div><b>Meta de ventas por día</b><p>Se muestra en Inicio con una barra de avance. Déjala en 0 para que se calcule sola con las ventas; al principio es de $4,000.</p></div>
          <Pasos name="meta" inicial={Math.round(b.metaDiaria / 100)} paso={100} max={1000000} prefijo="$" etiqueta="meta diaria" />
        </div>
        <div className="acciones"><button className="bt">Guardar reglas<Fl /></button></div>
      </form>
    </>
  );
}
