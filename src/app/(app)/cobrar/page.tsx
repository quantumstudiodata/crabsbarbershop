import { eq } from "drizzle-orm";
import { requerirSesion } from "@/lib/auth";
import { categoriasGasto, equipoQueAtiende, folioCorte, metodosActivos, movimientosDeTurno, serviciosActivos, turnoAbierto } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { BarraCaja, CajaCerrada, CajaModal, CajaPendiente, type Turno } from "./CajaModal";
import { FormCobro } from "./FormCobro";
import { ModoFoco } from "./ModoFoco";

export const metadata = { title: "Cobro" };

export default async function Cobrar({ searchParams }: { searchParams: Promise<{ caja?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) return <p className="aviso error">No tienes permiso para cobrar.</p>;
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const [t, servicios, equipo, metodos, cats] = await Promise.all([
    turnoAbierto(s.barberia.id), serviciosActivos(s.barberia.id), equipoQueAtiende(s.barberia.id), metodosActivos(s.barberia.id), categoriasGasto(s.barberia.id),
  ]);
  const opera = s.puede("caja.operar");
  let turno: Turno | null = null;
  if (t) {
    const [datos, [abrio], folio] = await Promise.all([
      movimientosDeTurno(s.barberia.id, t.id, t.fondoInicial),
      db.select({ nombre: schema.usuarios.nombre }).from(schema.usuarios).where(eq(schema.usuarios.id, t.abiertoPor)),
      folioCorte(s.barberia.id, t.abiertoEn),
    ]);
    turno = {
      desde: horaCorta(t.abiertoEn, zona), abrio: abrio?.nombre.split(" ")[0] ?? "", dia: fechaLarga(t.fechaOperativa).toLowerCase(),
      deOtroDia: t.fechaOperativa < fechaLocal(new Date(), zona), folioCorte: folio, m: datos.m, esperado: datos.esperado,
      ventas: datos.ventas, propinas: datos.propinasTotal, otros: datos.otrosPorMetodo.map((x) => ({ metodo: x.metodo, total: x.total, ventas: x.ventas })),
    };
  }
  const folioVenta = `${s.barberia.folioPrefijo}-${String(s.barberia.siguienteFolio).padStart(6, "0")}`;

  return (
    <>
      <ModoFoco />
      {!turno ? <CajaCerrada opera={opera} sugerido={s.barberia.fondoPredeterminado} />
        : turno.deOtroDia ? <CajaPendiente dia={turno.dia} opera={opera} />
        : (
          <>
            <BarraCaja turno={turno} folioVenta={folioVenta} />
            {servicios.length === 0 || metodos.length === 0 ? <p className="aviso">Faltan servicios o formas de pago. Se agregan en Ajustes.</p> : (
              <FormCobro
                servicios={servicios.map(({ id, nombre, duracionMin, precio, categoria }) => ({ id, nombre, duracionMin, precio, categoria }))}
                equipo={equipo.map(({ id, nombre, avatar }) => ({ id, nombre, avatar }))}
                metodos={metodos.map(({ id, nombre, esEfectivo }) => ({ id, nombre, esEfectivo }))}
                yo={s.usuario.id}
                puedeOtros={s.puede("ventas.registrar_otros")}
                limiteDescuento={s.barberia.limiteDescuentoPct}
                usa={{ propinas: s.barberia.usaPropinas, descuentos: s.barberia.usaDescuentos, dividir: s.barberia.usaDividirPago }}
              />
            )}
          </>
        )}
      {opera && <CajaModal inicial={q.caja === "cerrar" ? "corte" : null} turno={turno} limiteDiferencia={s.barberia.limiteDiferenciaCaja} categorias={cats.map((c) => c.nombre)} />}
    </>
  );
}
