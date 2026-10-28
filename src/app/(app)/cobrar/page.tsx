import { requerirSesion } from "@/lib/auth";
import { equipoQueAtiende, metodosActivos, movimientosDeTurno, serviciosActivos, turnoAbierto } from "@/lib/datos";
import { fechaLocal, horaCorta } from "@/lib/fechas";
import { CajaModal } from "./CajaModal";
import { FormCobro } from "./FormCobro";
import { ModoFoco } from "./ModoFoco";

export const metadata = { title: "Cobro" };

export default async function Cobrar({ searchParams }: { searchParams: Promise<{ caja?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) return <p className="aviso error">No tienes permiso para cobrar.</p>;
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const [turno, servicios, equipo, metodos] = await Promise.all([
    turnoAbierto(s.barberia.id), serviciosActivos(s.barberia.id), equipoQueAtiende(s.barberia.id), metodosActivos(s.barberia.id),
  ]);
  const datos = turno ? await movimientosDeTurno(s.barberia.id, turno.id, turno.fondoInicial) : null;
  const opera = s.puede("caja.operar");
  const hoy = fechaLocal(new Date(), zona);

  return (
    <>
      <ModoFoco />
      {servicios.length === 0 || metodos.length === 0 ? (
        <p className="aviso">Faltan servicios o formas de pago. Se agregan en Ajustes.</p>
      ) : (
        <FormCobro
          servicios={servicios.map(({ id, nombre, duracionMin, precio, categoria }) => ({ id, nombre, duracionMin, precio, categoria }))}
          equipo={equipo.map(({ id, nombre, avatar }) => ({ id, nombre, avatar }))}
          metodos={metodos.map(({ id, nombre, esEfectivo }) => ({ id, nombre, esEfectivo }))}
          yo={s.usuario.id}
          puedeOtros={s.puede("ventas.registrar_otros")}
          limiteDescuento={s.barberia.limiteDescuentoPct}
          caja={turno ? { desde: horaCorta(turno.abiertoEn, zona), deOtroDia: turno.fechaOperativa < hoy } : null}
          siguienteFolio={`${s.barberia.folioPrefijo}-${String(s.barberia.siguienteFolio).padStart(6, "0")}`}
          opera={opera}
        />
      )}
      {opera && (
        <CajaModal
          inicial={q.caja ? (q.caja === "cerrar" ? "cerrar" : "resumen") : null}
          turno={turno && datos ? {
            desde: horaCorta(turno.abiertoEn, zona),
            m: datos.m, esperado: datos.esperado, ventas: datos.ventas,
            otros: datos.otrosPorMetodo.map((x) => ({ metodo: x.metodo, total: x.total, ventas: x.ventas })),
            movimientos: [
              ...datos.movimientos.map((m) => ({ id: m.id, t: m.creadoEn.getTime(), hora: horaCorta(m.creadoEn, zona), titulo: m.tipo === "retiro" ? "Retiro" : m.tipo === "entrada" ? "Entrada" : "Devolución", detalle: `${m.concepto}. ${m.usuario.split(" ")[0]}`, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
              ...datos.gastos.map((g) => ({ id: g.id, t: g.creadoEn.getTime(), hora: horaCorta(g.creadoEn, zona), titulo: "Gasto", detalle: `${g.concepto}. ${g.usuario.split(" ")[0]}`, monto: -g.monto })),
            ].sort((a, b) => b.t - a.t),
          } : null}
          limiteDiferencia={s.barberia.limiteDiferenciaCaja}
        />
      )}
    </>
  );
}
