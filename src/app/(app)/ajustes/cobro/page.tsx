import { and, asc, eq } from "drizzle-orm";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { requerirSesion } from "@/lib/auth";
import { categoriasGasto, datosParaMeta } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { NOMBRE_ROL, PERMISOS_CONFIG, permisosDe } from "@/lib/permisos";
import { redirect } from "next/navigation";
import { agregarMetodo } from "./actions";
import { Funciones } from "./Funciones";
import { Metodos } from "./Metodos";
import { CajaAjustes, MetaMensual, ReglasCobro } from "./Reglas";
import { CategoriasEgresos, ConceptosFrecuentes, ModeloCaja } from "./Secciones";

export const metadata = { title: "Editar funciones" };

export default async function EditarFunciones({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!PERMISOS_CONFIG.some((p) => s.puede(p))) redirect("/?aviso=sin-permiso");
  const q = await searchParams;
  const b = s.barberia;
  const [metodos, gente, cats, conceptos] = await Promise.all([
    db.select().from(schema.metodosPago).where(eq(schema.metodosPago.barberiaId, b.id)).orderBy(asc(schema.metodosPago.orden)),
    db.select({ rol: schema.usuarios.rol, extra: schema.usuarios.permisosExtra, quitados: schema.usuarios.permisosQuitados, puesto: schema.puestos.permisos, nombre: schema.usuarios.nombre }).from(schema.usuarios).leftJoin(schema.puestos, eq(schema.puestos.id, schema.usuarios.puestoId)).where(and(eq(schema.usuarios.barberiaId, b.id), eq(schema.usuarios.activo, true))),
    categoriasGasto(b.id, false),
    db.select().from(schema.conceptosFrecuentes).where(eq(schema.conceptosFrecuentes.barberiaId, b.id)).orderBy(asc(schema.conceptosFrecuentes.concepto)),
  ]);
  // Quiénes pueden autorizar descuentos mayores al límite.
  const autorizan = [...new Set(gente.filter((u) => permisosDe(u.rol, u.extra, u.quitados, u.puesto).has("ventas.descuento")).map((u) => (u.rol === "duena" || u.rol === "admin" ? NOMBRE_ROL[u.rol].toLowerCase() : u.nombre.split(" ")[0])))].join(", ") || "el titular";
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div>
        <h1 className="titulo">Editar funciones</h1>
        <p className="sub">Cómo se cobra, cómo se maneja la caja, las metas y los egresos.</p>
      </div>

      <section className="glass panel bloque-a">
        <span className="lab">1. Cobros y métodos de pago</span>
        <Metodos metodos={metodos.map(({ id, nombre, esEfectivo, activo }) => ({ id, nombre, esEfectivo, activo }))} />
        <form action={agregarMetodo} className="fila" style={{ marginTop: 4 }}>
          <input className="input" name="nombre" placeholder="Otro método de pago, por ejemplo: Vales" style={{ flex: "1 1 220px" }} required aria-label="Nuevo método de pago" />
          <button className="bt sec solo"><Icono n="mas" />Agregar</button>
        </form>
        <ReglasCobro descuento={b.limiteDescuentoPct} autorizan={autorizan} funciones={[
          { clave: "descuentos", nombre: "Descuentos", activa: b.usaDescuentos, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
          { clave: "propinas", nombre: "Propinas", activa: b.usaPropinas, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
          { clave: "dividir", nombre: "Dividir pago", activa: b.usaDividirPago, encendida: "Un cliente puede pagar con dos formas de pago.", apagada: "Cada venta se paga con una sola forma." },
        ]} />
      </section>

      <section className="glass panel bloque-a">
        <span className="lab">2. Caja</span>
        <Funciones funciones={[
          { clave: "apertura", nombre: "Apertura de caja", activa: b.aperturaManual, encendida: "Alguien abre la caja contando el fondo inicial.", apagada: "La caja se abre sola con el fondo inicial sugerido al primer cobro del día." },
        ]} />
        <CajaAjustes fondo={Math.round(b.fondoPredeterminado / 100)} diferencia={Math.round(b.limiteDiferenciaCaja / 100)} />
        <ModeloCaja actual={b.modeloCaja} />
      </section>

      <section className="glass panel bloque-a">
        <span className="lab">3. Metas</span>
        <Funciones funciones={[
          { clave: "metas", nombre: "Metas de ventas", activa: b.usaMetas, encendida: "Inicio muestra la meta de ventas y cuánto lleva acumulado el negocio.", apagada: "Inicio no muestra metas." },
        ]} />
        <MetaMensual metaMensual={Math.round(b.metaMensual / 100)} datosMeta={await datosParaMeta(b.id, b.zonaHoraria, fechaLocal(new Date(), b.zonaHoraria))} />
      </section>

      <section className="glass panel bloque-a">
        <span className="lab">4. Egresos y finanzas</span>
        <CategoriasEgresos categorias={cats} />
        <ConceptosFrecuentes conceptos={conceptos} categorias={cats.filter((c) => c.activo).map((c) => c.nombre)} />
        <div className="ajuste">
          <span><b>Métodos de pago de egresos</b><small>Cómo se pueden pagar los gastos del negocio. Solo el efectivo que sale de la caja afecta el corte.</small></span>
          <div className="metodos-g"><span className="chip-m cm-e">Efectivo</span><span className="chip-m cm-t">Transferencia</span><span className="chip-m cm-k">Tarjeta</span></div>
        </div>
        <Funciones funciones={[
          { clave: "comprobantes", nombre: "Registro de comprobantes", activa: b.usaComprobantes, encendida: "Se puede adjuntar una foto o archivo a cada egreso.", apagada: "Los egresos se registran sin comprobante." },
          { clave: "periodicidad", nombre: "Periodicidad de gastos", activa: b.usaPeriodicidad, encendida: "Cada egreso puede marcarse como semanal, quincenal o mensual.", apagada: "Los egresos no llevan periodicidad." },
          { clave: "renta", nombre: "Renta de silla", activa: b.usaRentaSilla, encendida: "Se puede elegir como forma de pago de un barbero.", apagada: "No aparece al dar de alta a un barbero." },
        ]} />
        <p className="ayuda-txt">Apagar una función solo la esconde. Lo que ya se registró se conserva.</p>
      </section>
    </>
  );
}
