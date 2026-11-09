import { and, asc, eq } from "drizzle-orm";
import { AvisoUrl } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { categoriasGasto, datosParaMeta } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { NOMBRE_ROL, PERMISOS_CONFIG, permisosDe } from "@/lib/permisos";
import { redirect } from "next/navigation";
import { Funciones } from "./Funciones";
import { Metodos } from "./Metodos";
import { CajaConfig, MetaMensual, ReglasCobro } from "./Reglas";
import { ModeloCaja } from "./Secciones";
import { Bloque, CategoriasEgresos, GastosFrecuentes, OpcionesRegistro, Resumen } from "./Bloques";

export const metadata = { title: "Configurar negocio" };

export default async function ConfigurarNegocio({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
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
  const hoyN = fechaLocal(new Date(), b.zonaHoraria);
  const nPromos = (await db.select({ hasta: schema.promociones.hasta, pausada: schema.promociones.pausada, desde: schema.promociones.desde }).from(schema.promociones).where(eq(schema.promociones.barberiaId, b.id)))
    .filter((x) => !x.pausada && x.desde <= hoyN && (!x.hasta || x.hasta >= hoyN)).length;
  const $ = (c: number) => formatoDinero(c);
  const si = (v: boolean) => (v ? "Activo" : "Apagado");
  const activos = metodos.filter((m) => m.activo);
  const edita = (p: "cobros" | "caja" | "metas" | "egresos") => s.puede(`configuracion.${p}`) && !s.vista;
  const NOMBRE_MET: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta" };
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div>
        <h1 className="titulo">Configurar negocio</h1>
        <p className="sub">Abre cada apartado para ver cómo está configurado.</p>
      </div>

      <Bloque numero={1} titulo="Cobros y métodos de pago" puedeEditar={edita("cobros")}
        resumen={`${activos.length} ${activos.length === 1 ? "forma de pago" : "formas de pago"}, descuentos hasta ${b.limiteDescuentoPct}% sin autorización`}
        detalle={<Resumen filas={[
          ["Formas de pago activas", activos.map((m) => m.nombre).join(", ") || "Ninguna"],
          ["Descuento sin autorización", `Hasta ${b.limiteDescuentoPct}%`],
          ["Descuentos", si(b.usaDescuentos)], ["Propinas", si(b.usaPropinas)], ["Dividir pago", si(b.usaDividirPago)],
        ]} />}>
        <Metodos metodos={metodos.map(({ id, nombre, descripcion, esEfectivo, activo }) => ({ id, nombre, descripcion, esEfectivo, activo }))} />
        <ReglasCobro descuento={b.limiteDescuentoPct} autorizan={autorizan} funciones={[
          { clave: "descuentos", nombre: "Descuentos", activa: b.usaDescuentos, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
          { clave: "propinas", nombre: "Propinas", activa: b.usaPropinas, encendida: "Aparecen al cobrar.", apagada: "No aparecen al cobrar." },
          { clave: "dividir", nombre: "Dividir pago", activa: b.usaDividirPago, encendida: "Un cliente puede pagar con dos formas de pago.", apagada: "Cada venta se paga con una sola forma." },
        ]} />
      </Bloque>

      <Bloque numero={2} titulo="Caja" puedeEditar={edita("caja")}
        resumen={`${b.modeloCaja === "individual" ? "Una caja por trabajador" : "Caja compartida"}, ${b.aperturaManual ? "se abre contando el fondo" : "se abre sola"}`}
        detalle={<Resumen filas={[
          ["Modelo de caja", b.modeloCaja === "individual" ? "Individual por trabajador" : "Compartida"],
          ["Apertura", b.aperturaManual ? "Manual, contando el fondo" : "Automática al primer cobro"],
          ["Cierre de caja", b.corteObligatorio ? "Obligatorio cada día" : "No obligatorio"],
          ["Evidencias del corte", b.usaEvidenciaCorte ? "Se pueden adjuntar al cerrar" : "No se piden"],
          ...(b.aperturaManual ? [] : [["Fondo inicial sugerido", $(b.fondoPredeterminado)] as [string, string]]),
          ["Diferencia permitida", b.limiteDiferenciaCaja ? $(b.limiteDiferenciaCaja) : "Ninguna, toda diferencia se explica"],
        ]} />}>
        <CajaConfig apertura={b.aperturaManual} corte={b.corteObligatorio} fondo={Math.round(b.fondoPredeterminado / 100)} diferencia={Math.round(b.limiteDiferenciaCaja / 100)} evidencia={b.usaEvidenciaCorte} />
        <ModeloCaja actual={b.modeloCaja} />
      </Bloque>

      <Bloque numero={3} titulo="Metas" puedeEditar={edita("metas")}
        resumen={b.usaMetas ? (b.metaMensual ? `Objetivo mensual de ${$(b.metaMensual)}` : "Activas, sin objetivo mensual") : "Apagadas"}
        detalle={<Resumen filas={[["Metas de ventas", si(b.usaMetas)], ["Objetivo mensual", b.metaMensual ? $(b.metaMensual) : "Sin objetivo"]]} />}>
        <Funciones funciones={[
          { clave: "metas", nombre: "Metas de ventas", activa: b.usaMetas, encendida: "Inicio muestra la meta de ventas y cuánto lleva acumulado el negocio.", apagada: "Inicio no muestra metas." },
        ]} />
        <MetaMensual metaMensual={Math.round(b.metaMensual / 100)} datosMeta={await datosParaMeta(b.id, b.zonaHoraria, fechaLocal(new Date(), b.zonaHoraria))} />
      </Bloque>

      <Bloque numero={4} titulo="Promociones" puedeEditar={edita("cobros")}
        resumen={b.usaPromociones ? `Permitidas, ${nPromos} ${nPromos === 1 ? "promoción activa" : "promociones activas"}` : "Apagadas"}
        detalle={<>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Permite ofrecer descuentos y promociones en los servicios del negocio. Se crean en Servicios, en la pestaña Promociones.</p>
          <Resumen filas={[["Permitir promociones", si(b.usaPromociones)], ["Promociones activas", String(nPromos)]]} />
        </>}>
        <Funciones funciones={[
          { clave: "promociones", nombre: "Permitir promociones", activa: b.usaPromociones, encendida: "Se pueden crear promociones en Servicios y se aplican al cobrar.", apagada: "No se aplican promociones al cobrar." },
        ]} />
      </Bloque>

      <Bloque numero={5} titulo="Egresos y finanzas" puedeEditar={edita("egresos")}
        resumen={`${cats.filter((c) => c.activo).length} categorías, ${conceptos.length} ${conceptos.length === 1 ? "gasto frecuente" : "gastos frecuentes"}, pagos con ${b.metodosEgreso.map((m) => NOMBRE_MET[m].toLowerCase()).join(", ")}`}
        detalle={
          <div className="pila">
            <CategoriasEgresos categorias={cats} puede={edita("egresos")} />
            <GastosFrecuentes gastos={conceptos} categorias={cats.filter((c) => c.activo).map((c) => c.nombre)} metodos={b.metodosEgreso} puede={edita("egresos")} />
            <OpcionesRegistro metodos={b.metodosEgreso} comprobantes={b.usaComprobantes} periodicidad={b.usaPeriodicidad} puede={edita("egresos")} />
          </div>
        } />
    </>
  );
}
