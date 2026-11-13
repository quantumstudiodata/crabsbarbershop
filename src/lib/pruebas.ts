import "server-only";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { hashContrasena } from "./auth";
import { comisionDeServicio } from "./comisiones";
import { contrasenaTemporal, sugerirUsuario } from "./cuentas";
import { db, schema as t } from "./db";
import { diaDeSemana, fechaLocal, sumarDias } from "./fechas";

// Mantenimiento de entornos de prueba. Todo aquí exige que el negocio esté marcado como de prueba:
// un negocio real nunca se restablece ni se elimina, aunque alguien manipule el formulario.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** El negocio, solo si es de prueba. */
export async function negocioDePrueba(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [b] = await db.select().from(t.barberias).where(and(eq(t.barberias.id, id), eq(t.barberias.esPrueba, true))).limit(1);
  return b ?? null;
}

/** Qué hay en un negocio: se muestra antes de restablecer o eliminar. */
export async function conteoNegocio(id: string) {
  const n = async (tabla: typeof t.ventas | typeof t.gastos | typeof t.turnosCaja | typeof t.usuarios | typeof t.servicios | typeof t.pagosComision | typeof t.historial) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(tabla).where(eq(tabla.barberiaId, id)))[0].n;
  const [ventas, egresos, cortes, usuarios, servicios, pagos, historial] = await Promise.all([n(t.ventas), n(t.gastos), n(t.turnosCaja), n(t.usuarios), n(t.servicios), n(t.pagosComision), n(t.historial)]);
  return { ventas, egresos, cortes, usuarios, servicios, pagos, historial };
}

/** Borra los movimientos y conserva la configuración y las cuentas. */
async function borrarMovimientos(tx: Tx, b: string) {
  // Permite borrar ventas e historial solo dentro de esta transacción.
  await tx.execute(sql`select set_config('crabs.limpieza', 'si', true)`);
  await tx.delete(t.comprobantes).where(eq(t.comprobantes.barberiaId, b));
  await tx.delete(t.gastos).where(eq(t.gastos.barberiaId, b));
  await tx.delete(t.propinas).where(eq(t.propinas.barberiaId, b));
  await tx.delete(t.pagos).where(eq(t.pagos.barberiaId, b));
  await tx.delete(t.conceptos).where(eq(t.conceptos.barberiaId, b));
  await tx.delete(t.movimientosCaja).where(eq(t.movimientosCaja.barberiaId, b));
  await tx.delete(t.ventas).where(eq(t.ventas.barberiaId, b));
  await tx.delete(t.ajustesCierre).where(eq(t.ajustesCierre.barberiaId, b));
  await tx.delete(t.turnosCaja).where(eq(t.turnosCaja.barberiaId, b));
  await tx.delete(t.pagosComision).where(eq(t.pagosComision.barberiaId, b));
  await tx.delete(t.ideas).where(eq(t.ideas.barberiaId, b));
  await tx.delete(t.solicitudesClave).where(eq(t.solicitudesClave.barberiaId, b));
  await tx.delete(t.historial).where(eq(t.historial.barberiaId, b));
  await tx.update(t.barberias).set({ siguienteFolio: 1 }).where(eq(t.barberias.id, b));
}

/** Movimientos de un negocio (de prueba o real) para la vista previa antes de empezar de cero. */
export async function conteoMovimientos(id: string) {
  const n = async (tabla: typeof t.ventas | typeof t.gastos | typeof t.turnosCaja | typeof t.pagosComision | typeof t.citas | typeof t.historial) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(tabla).where(eq(tabla.barberiaId, id)))[0].n;
  const [ventas, egresos, cortes, pagos, citas, historial] = await Promise.all([n(t.ventas), n(t.gastos), n(t.turnosCaja), n(t.pagosComision), n(t.citas), n(t.historial)]);
  return { ventas, egresos, cortes, pagos, citas, historial };
}

/**
 * Empezar de cero: borra todo lo que se registró (ventas, cortes, egresos, pagos al equipo, citas, reseñas e historial)
 * y conserva la configuración: cuentas, servicios, precios, formas de pago, horarios, metas y ajustes.
 * Sirve para quitar las pruebas antes de empezar a usar la app de verdad. No se puede deshacer.
 */
export async function empezarDeCero(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Negocio no válido.");
  const [b] = await db.select().from(t.barberias).where(eq(t.barberias.id, id)).limit(1);
  if (!b) throw new Error("No existe ese negocio.");
  const antes = await conteoMovimientos(id);
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('crabs.limpieza', 'si', true)`);
    // Primero lo que depende de citas y cortes, luego las ventas.
    await tx.delete(t.comprobantesCita).where(eq(t.comprobantesCita.barberiaId, id));
    await tx.delete(t.notificacionesCita).where(eq(t.notificacionesCita.barberiaId, id));
    await tx.delete(t.pagosLinea).where(eq(t.pagosLinea.barberiaId, id));
    await tx.delete(t.resenas).where(eq(t.resenas.barberiaId, id));
    await tx.delete(t.citas).where(eq(t.citas.barberiaId, id));
    await tx.delete(t.evidenciasCorte).where(eq(t.evidenciasCorte.barberiaId, id));
    await tx.delete(t.faltantesCaja).where(eq(t.faltantesCaja.barberiaId, id));
    await tx.delete(t.comprobantes).where(eq(t.comprobantes.barberiaId, id));
    await tx.delete(t.gastos).where(eq(t.gastos.barberiaId, id));
    await tx.delete(t.propinas).where(eq(t.propinas.barberiaId, id));
    await tx.delete(t.pagos).where(eq(t.pagos.barberiaId, id));
    await tx.delete(t.conceptos).where(eq(t.conceptos.barberiaId, id));
    await tx.delete(t.movimientosCaja).where(eq(t.movimientosCaja.barberiaId, id));
    await tx.delete(t.ventas).where(eq(t.ventas.barberiaId, id));
    await tx.delete(t.ajustesCierre).where(eq(t.ajustesCierre.barberiaId, id));
    await tx.delete(t.turnosCaja).where(eq(t.turnosCaja.barberiaId, id));
    await tx.delete(t.pagosComision).where(eq(t.pagosComision.barberiaId, id));
    await tx.delete(t.historial).where(eq(t.historial.barberiaId, id));
    // Los pagos y rentas automáticos cuentan desde hoy; los gastos fijos vuelven a registrarse en su siguiente fecha.
    await tx.update(t.barberias).set({
      siguienteFolio: 1,
      ...(b.pagosEquipoDesde ? { pagosEquipoDesde: hoy } : {}),
      ...(b.rentasDesde ? { rentasDesde: hoy } : {}),
    }).where(eq(t.barberias.id, id));
  });
  return { nombre: b.nombre, ...antes };
}

export async function restablecerPrueba(id: string) {
  const b = await negocioDePrueba(id);
  if (!b) throw new Error("Solo se pueden restablecer negocios de prueba.");
  const antes = await conteoNegocio(id);
  await db.transaction(async (tx) => {
    await borrarMovimientos(tx, id);
    // Cuentas eliminadas ("Persona eliminada"): sin movimientos ya no hace falta conservarlas.
    const borradas = await tx.select({ id: t.usuarios.id }).from(t.usuarios).where(and(eq(t.usuarios.barberiaId, id), like(t.usuarios.usuario, "BORRADO-%")));
    if (borradas.length) {
      const ids = borradas.map((x) => x.id);
      await tx.delete(t.sesiones).where(inArray(t.sesiones.usuarioId, ids));
      await tx.delete(t.reglasComision).where(inArray(t.reglasComision.barberoId, ids));
      await tx.delete(t.remuneraciones).where(inArray(t.remuneraciones.usuarioId, ids));
      await tx.delete(t.usuarios).where(inArray(t.usuarios.id, ids));
    }
  });
  return { nombre: b.nombre, ...antes };
}

/** Borra el negocio de prueba completo, con sus cuentas y su configuración. */
export async function eliminarPrueba(id: string) {
  const b = await negocioDePrueba(id);
  if (!b) throw new Error("Solo se pueden eliminar negocios de prueba.");
  const antes = await conteoNegocio(id);
  await db.transaction(async (tx) => {
    await borrarMovimientos(tx, id);
    await tx.delete(t.solicitudesSoporte).where(eq(t.solicitudesSoporte.barberiaId, id));
    await tx.update(t.erroresSistema).set({ barberiaId: null, usuarioId: null }).where(eq(t.erroresSistema.barberiaId, id));
    await tx.delete(t.conceptosFrecuentes).where(eq(t.conceptosFrecuentes.barberiaId, id));
    await tx.delete(t.categoriasGasto).where(eq(t.categoriasGasto.barberiaId, id));
    await tx.delete(t.historicoMensual).where(eq(t.historicoMensual.barberiaId, id));
    await tx.delete(t.reglasComision).where(eq(t.reglasComision.barberiaId, id));
    await tx.delete(t.remuneraciones).where(eq(t.remuneraciones.barberiaId, id));
    await tx.delete(t.servicios).where(eq(t.servicios.barberiaId, id));
    await tx.delete(t.categoriasServicio).where(eq(t.categoriasServicio.barberiaId, id));
    await tx.delete(t.metodosPago).where(eq(t.metodosPago.barberiaId, id));
    const us = await tx.select({ id: t.usuarios.id }).from(t.usuarios).where(eq(t.usuarios.barberiaId, id));
    if (us.length) await tx.delete(t.sesiones).where(inArray(t.sesiones.usuarioId, us.map((x) => x.id)));
    await tx.delete(t.usuarios).where(eq(t.usuarios.barberiaId, id));
    await tx.delete(t.puestos).where(eq(t.puestos.barberiaId, id));
    await tx.delete(t.barberias).where(eq(t.barberias.id, id));
  });
  return { nombre: b.nombre, ...antes };
}

const SERVICIOS: [string, number, number, string][] = [
  ["Corte clásico", 30, 15000, "Cortes"], ["Fade", 40, 17000, "Cortes"], ["Corte y barba", 50, 22000, "Barba y paquetes"],
  ["Barba", 20, 10000, "Barba y paquetes"], ["Corte infantil", 25, 12000, "Niños y extras"],
];

/** Crea un negocio de prueba con Titular, Administrador y Barbero. Devuelve las cuentas con su contraseña. */
export async function crearPrueba(nombre: string) {
  const existentes = (await db.select({ u: t.usuarios.usuario }).from(t.usuarios)).map((x) => x.u);
  return db.transaction(async (tx) => {
    const [b] = await tx.insert(t.barberias).values({ nombre, esPrueba: true, folioPrefijo: "PRB" }).returning();
    const cuentas: { puesto: string; usuario: string; clave: string }[] = [];
    for (const [rol, puesto] of [["duena", "Titular"], ["contador", "Administrador"], ["barbera", "Barbero"]] as const) {
      const persona = `${puesto} Prueba ${nombre.split(" ")[0]}`;
      const usuario = sugerirUsuario(persona, existentes);
      existentes.push(usuario);
      const clave = contrasenaTemporal(persona);
      const [u] = await tx.insert(t.usuarios).values({ barberiaId: b.id, nombre: persona, usuario, rol, hash: await hashContrasena(clave), debeCambiar: false }).returning();
      if (rol === "barbera") await tx.insert(t.reglasComision).values({ barberiaId: b.id, barberoId: u.id, tipo: "porcentaje", porcentaje: 4000 });
      cuentas.push({ puesto, usuario, clave });
    }
    await tx.insert(t.servicios).values(SERVICIOS.map(([n, duracionMin, precio, categoria], orden) => ({ barberiaId: b.id, nombre: n, duracionMin, precio, categoria, orden })));
    await tx.insert(t.metodosPago).values([
      { barberiaId: b.id, nombre: "Efectivo", esEfectivo: true, orden: 0 },
      { barberiaId: b.id, nombre: "Transferencia", esEfectivo: false, orden: 1 },
      { barberiaId: b.id, nombre: "Tarjeta", esEfectivo: false, orden: 2 },
    ]);
    return { id: b.id, cuentas };
  });
}

/** Dos semanas de ventas inventadas, con cortes cerrados, para tener qué ver. Solo en negocios de prueba. */
export async function datosDemostracion(id: string) {
  const b = await negocioDePrueba(id);
  if (!b) throw new Error("Solo se cargan datos de demostración en negocios de prueba.");
  const [equipo, servicios, metodos, reglas] = await Promise.all([
    db.select().from(t.usuarios).where(and(eq(t.usuarios.barberiaId, id), eq(t.usuarios.activo, true))),
    db.select().from(t.servicios).where(and(eq(t.servicios.barberiaId, id), eq(t.servicios.activo, true))),
    db.select().from(t.metodosPago).where(eq(t.metodosPago.barberiaId, id)),
    db.select().from(t.reglasComision).where(eq(t.reglasComision.barberiaId, id)),
  ]);
  const barberos = equipo.filter((u) => u.rol === "barbera" || u.rol === "encargada");
  const abre = equipo.find((u) => u.rol === "duena") ?? equipo[0];
  if (!barberos.length || !servicios.length || !metodos.length || !abre) throw new Error("El negocio necesita al menos un barbero, servicios y formas de pago.");
  const hoy = fechaLocal(new Date(), b.zonaHoraria);
  let folio = b.siguienteFolio, ventas = 0, semilla = 11;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const elegir = <T,>(xs: T[]) => xs[Math.floor(azar() * xs.length)];
  await db.transaction(async (tx) => {
    for (let f = sumarDias(hoy, -14); f < hoy; f = sumarDias(f, 1)) {
      if (diaDeSemana(f) === 0) continue;
      const [turno] = await tx.insert(t.turnosCaja).values({ barberiaId: id, fechaOperativa: f, fondoInicial: 50000, abiertoPor: abre.id, abiertoEn: new Date(`${f}T16:00:00Z`), estado: "cerrado" }).returning();
      let efectivo = 0;
      const n = 3 + Math.floor(azar() * 6);
      for (let i = 0; i < n; i++) {
        const s = elegir(servicios), p = elegir(barberos), m = azar() < 0.5 ? metodos[0] : elegir(metodos);
        const r = reglas.find((x) => x.barberoId === p.id && !x.servicioId) ?? null;
        const regla = r ? { tipo: r.tipo, porcentaje: r.porcentaje, montoFijo: r.montoFijo, montoSemanal: r.montoSemanal } : null;
        const [v] = await tx.insert(t.ventas).values({
          barberiaId: id, folio: `${b.folioPrefijo}-${String(folio++).padStart(6, "0")}`, turnoId: turno.id, registradaPor: p.id, total: s.precio,
          claveUnica: `demo-${id}-${folio}`, creadoEn: new Date(Date.parse(`${f}T17:00:00Z`) + i * 50 * 60000),
        }).returning();
        await tx.insert(t.conceptos).values({ barberiaId: id, ventaId: v.id, servicioId: s.id, nombreServicio: s.nombre, barberoId: p.id, precioLista: s.precio, precioCobrado: s.precio, reglaComision: regla, comision: comisionDeServicio(regla, s.precio) });
        await tx.insert(t.pagos).values({ barberiaId: id, ventaId: v.id, metodoPagoId: m.id, nombreMetodo: m.nombre, esEfectivo: m.esEfectivo, monto: s.precio });
        if (m.esEfectivo) efectivo += s.precio;
        ventas++;
      }
      const esperado = 50000 + efectivo;
      await tx.update(t.turnosCaja).set({ cerradoPor: abre.id, cerradoEn: new Date(`${sumarDias(f, 1)}T02:00:00Z`), efectivoEsperado: esperado, efectivoContado: esperado, diferencia: 0 }).where(eq(t.turnosCaja.id, turno.id));
    }
    await tx.update(t.barberias).set({ siguienteFolio: folio }).where(eq(t.barberias.id, id));
  });
  return { nombre: b.nombre, ventas };
}

/** Registros temporales: sesiones vencidas, solicitudes de contraseña atendidas y errores de más de 90 días. */
export async function limpiarTemporales() {
  const [ses, err] = await Promise.all([
    db.delete(t.sesiones).where(sql`${t.sesiones.expiraEn} < now()`).returning({ id: t.sesiones.id }),
    db.delete(t.erroresSistema).where(sql`${t.erroresSistema.creadoEn} < now() - interval '90 days'`).returning({ id: t.erroresSistema.id }),
  ]);
  return { sesiones: ses.length, errores: err.length };
}
