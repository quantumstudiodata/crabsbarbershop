import { and, asc, eq } from "drizzle-orm";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { datosParaMeta } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { NOMBRE_ROL, permisosDe } from "@/lib/permisos";
import { agregarMetodo } from "./actions";
import { Funciones } from "./Funciones";
import { Metodos } from "./Metodos";
import { CajaObjetivos, ReglasCobro } from "./Reglas";

export const metadata = { title: "Cobro y caja" };

export default async function CobroYCaja({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion("ajustes.negocio");
  const q = await searchParams;
  const b = s.barberia;
  const [metodos, gente] = await Promise.all([
    db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, b.id)).orderBy(asc(schema.metodosPago.orden)),
    db.select({ rol: schema.usuarios.rol, extra: schema.usuarios.permisosExtra, nombre: schema.usuarios.nombre }).from(schema.usuarios).where(and(eq(schema.usuarios.barberiaId, b.id), eq(schema.usuarios.activo, true))),
  ]);
  // Quiénes pueden autorizar descuentos mayores al límite.
  const autorizan = [...new Set(gente.filter((u) => permisosDe(u.rol, u.extra).has("ventas.descuento")).map((u) => (u.rol === "duena" || u.rol === "admin" ? NOMBRE_ROL[u.rol].toLowerCase() : u.nombre.split(" ")[0])))].join(", ") || "el propietario";
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div>
        <h1 className="titulo">Cobro y caja</h1>
        <p className="sub">Cómo pagan los clientes, las reglas al cobrar y el manejo del efectivo.</p>
      </div>
      <section className="glass panel bloque-a">
        <span className="lab">1. Formas de pago</span>
        <Metodos metodos={metodos.map(({ id, nombre, esEfectivo, activo }) => ({ id, nombre, esEfectivo, activo }))} />
        <form action={agregarMetodo} className="fila" style={{ marginTop: 4 }}>
          <input className="input" name="nombre" placeholder="Otra forma de pago, por ejemplo: Vales" style={{ flex: "1 1 220px" }} required aria-label="Nueva forma de pago" />
          <button className="bt sec solo"><Icono n="mas" />Agregar</button>
        </form>
      </section>
      <ReglasCobro descuento={b.limiteDescuentoPct} autorizan={autorizan} funciones={[
        { clave: "descuentos", nombre: "Descuentos", activa: b.usaDescuentos, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
        { clave: "propinas", nombre: "Propinas", activa: b.usaPropinas, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
        { clave: "dividir", nombre: "Dividir pago", activa: b.usaDividirPago, encendida: "Un cliente puede pagar con dos formas de pago.", apagada: "Cada venta se paga con una sola forma." },
      ]} />
      <CajaObjetivos fondo={Math.round(b.fondoPredeterminado / 100)} diferencia={Math.round(b.limiteDiferenciaCaja / 100)} metaMensual={Math.round(b.metaMensual / 100)}
        datosMeta={await datosParaMeta(b.id, b.zonaHoraria, fechaLocal(new Date(), b.zonaHoraria))} />
      <section className="glass panel bloque-a">
        <span className="lab">4. Funciones</span>
        <Funciones funciones={[
          { clave: "metas", nombre: "Metas de ventas", activa: b.usaMetas, encendida: "Inicio muestra la meta y cuánto se lleva.", apagada: "No se muestran metas." },
          { clave: "renta", nombre: "Renta de silla", activa: b.usaRentaSilla, encendida: "Se puede elegir como forma de pago de un barbero.", apagada: "No aparece al dar de alta a un barbero." },
        ]} />
        <p className="ayuda-txt">Apagar una función solo la esconde. Lo que ya se registró se conserva.</p>
      </section>
    </>
  );
}
