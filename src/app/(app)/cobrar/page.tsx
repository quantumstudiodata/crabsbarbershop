import { and, eq } from "drizzle-orm";
import { asentarCitasPagadas } from "@/lib/pagos";
import { cobraEnLinea } from "@/lib/stripe";
import { requerirSesion } from "@/lib/auth";
import { cajaOAbrir, categoriasGasto, equipoQueAtiende, folioCorte, metodosActivos, movimientosDeTurno, serviciosActivos } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { BarraCaja, CajaCerrada, CajaModal, CajaPendiente, type Turno } from "./CajaModal";
import { FormCobro } from "./FormCobro";
import type { Promo } from "@/lib/promociones";
import { ModoFoco } from "./ModoFoco";
import { comisionesDeTurno, entregasDeCorte } from "@/lib/comisionesCorte";

export const metadata = { title: "Cobro" };

export default async function Cobrar({ searchParams }: { searchParams: Promise<{ caja?: string; cita?: string }> }) {
  const s = await requerirSesion();
  await asentarCitasPagadas(s.barberia.id);
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) return <p className="aviso error">No tienes permiso para cobrar.</p>;
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const [t, servicios, equipo, metodos, cats] = await Promise.all([
    cajaOAbrir(s), serviciosActivos(s.barberia.id), equipoQueAtiende(s.barberia.id), metodosActivos(s.barberia.id), categoriasGasto(s.barberia.id),
  ]);
  // Promociones que se pueden usar en el cobro (las vencidas o pausadas no se mandan).
  const promos = s.barberia.usaPromociones
    ? (await db.select().from(schema.promociones).where(eq(schema.promociones.barberiaId, s.barberia.id))).filter((x) => x.enCobro && !x.pausada && (!x.hasta || x.hasta >= fechaLocal(new Date(), zona)))
    : [];
  const opera = s.puede("caja.operar");
  // Cobrar una cita: llega con sus servicios y su barbero; la venta queda ligada a la cita.
  const [cita] = q.cita && /^[0-9a-f-]{36}$/.test(q.cita)
    ? await db.select().from(schema.citas).where(and(eq(schema.citas.id, q.cita), eq(schema.citas.barberiaId, s.barberia.id))).limit(1)
    : [];
  const desdeCita = cita && !cita.ventaId && !["cancelada", "no_asistio", "expirada"].includes(cita.estado)
    ? { id: cita.id, folio: cita.folio, cliente: cita.clienteNombre, barberoId: cita.barberoId, servicioIds: cita.servicios.map((x) => x.servicioId), pagado: cita.pagado }
    : null;
  let turno: Turno | null = null;
  if (t) {
    // Quien no ve al equipo completo solo ve su propia comisión en el corte.
    const verTodo = s.puede("ventas.ver_todas") || s.puede("equipo.pagar");
    const mio = <T extends { id: string }>(xs: T[]) => (verTodo ? xs : xs.filter((x) => x.id === s.usuario.id));
    const [datos, [abrio], folio, comisiones, entregas] = await Promise.all([
      movimientosDeTurno(s.barberia.id, t.id, t.fondoInicial),
      db.select({ nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios).where(and(eq(schema.usuarios.id, t.abiertoPor), eq(schema.usuarios.barberiaId, s.barberia.id))),
      folioCorte(s.barberia.id, t.abiertoEn),
      comisionesDeTurno(s.barberia.id, t.id),
      s.barberia.pagosEquipoAuto ? entregasDeCorte(s.barberia.id, zona, s.barberia.pagosEquipoDesde) : Promise.resolve([]),
    ]);
    turno = {
      desde: horaCorta(t.abiertoEn, zona), abrio: abrio?.nombre.split(" ")[0] ?? "", abrioAvatar: abrio?.avatar ?? "iniciales", abiertoEn: t.abiertoEn.toISOString(), dia: fechaLarga(t.fechaOperativa).toLowerCase(),
      deOtroDia: t.fechaOperativa < fechaLocal(new Date(), zona), folioCorte: folio, m: datos.m, esperado: datos.esperado,
      ventas: datos.ventas, ventasEfectivo: datos.ventasEfectivo, propinas: datos.propinasTotal, otros: datos.otrosPorMetodo.map((x) => ({ metodo: x.metodo, total: x.total, ventas: x.ventas })),
      comisiones: mio(comisiones), entregas: mio(entregas), verTodo,
    };
  }
  const folioVenta = `${s.barberia.folioPrefijo}-${String(s.barberia.siguienteFolio).padStart(6, "0")}`;

  return (
    <>
      <ModoFoco />
      {!turno ? <CajaCerrada opera={opera} sugerido={s.barberia.fondoPredeterminado} />
        : turno.deOtroDia && s.barberia.corteObligatorio ? <CajaPendiente dia={turno.dia} opera={opera} />
        : (
          <>
            <BarraCaja turno={turno} folioVenta={folioVenta} />
            {servicios.length === 0 || metodos.length === 0 ? <p className="aviso">Faltan servicios o formas de pago. Se agregan en Ajustes.</p> : (
              <FormCobro
                servicios={servicios.map(({ id, nombre, duracionMin, precio, categoria }) => ({ id, nombre, duracionMin, precio, categoria }))}
                equipo={equipo.map(({ id, nombre, avatar }) => ({ id, nombre, avatar }))}
                metodos={metodos.map(({ id, nombre, esEfectivo }) => ({ id, nombre, esEfectivo }))}
                cuenta={s.barberia.transferenciaClabe ? { banco: s.barberia.transferenciaBanco, clabe: s.barberia.transferenciaClabe, titular: s.barberia.transferenciaTitular } : null}
                yo={s.usuario.id}
                puedeOtros={s.puede("ventas.registrar_otros")}
                limiteDescuento={s.barberia.limiteDescuentoPct}
                desdeCita={desdeCita}
                promos={promos.map(({ creadoEn: _c, creadoPor: _p, barberiaId: _b, ...x }) => x) as unknown as Promo[]} zona={zona}
                usa={{ propinas: s.barberia.usaPropinas, descuentos: s.barberia.usaDescuentos, dividir: s.barberia.usaDividirPago }}
                qr={cobraEnLinea(s.barberia)}
              />
            )}
          </>
        )}
      {opera && <CajaModal inicial={q.caja === "cerrar" ? "corte" : q.caja === "retiro" ? "retiro" : null} turno={turno} limiteDiferencia={s.barberia.limiteDiferenciaCaja} categorias={cats.map((c) => c.nombre)} evidencias={s.barberia.usaEvidenciaCorte} />}
    </>
  );
}
