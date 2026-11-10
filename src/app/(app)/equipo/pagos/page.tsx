import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { elegirRegla } from "@/lib/comisiones";
import { reglasDe, ventasEntre } from "@/lib/datos";
import { NOMBRE_FRECUENCIA, cuentaDe, modalidadCorta, periodoDePago } from "@/lib/equipo";
import { fechaCorta, lunesDe } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { PestanasEquipo } from "../Partes";
import { personasEquipo, sesionEquipo, mesElegido } from "../datos";
import { FilaPago, type DatosFila } from "./FilaPago";

export const metadata = { title: "Pagos del equipo" };

export default async function Pagos({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const se = await sesionEquipo();
  const q = await searchParams;
  const { hoy } = mesElegido({}, se.barberia.zonaHoraria);
  const personas = (await personasEquipo(se.barberia.id)).filter((p) => p.activo);
  // Una sola consulta de ventas que cubre el periodo más largo (el mes o la semana en curso).
  const inicio = [`${hoy.slice(0, 7)}-01`, lunesDe(hoy)].sort()[0];
  const [{ ventas }, reglas] = await Promise.all([ventasEntre(se.barberia.id, inicio, hoy, { zona: se.barberia.zonaHoraria }), reglasDe(se.barberia.id)]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const puedePagar = se.puede("equipo.pagar");

  const cuentas = await Promise.all(personas.map(async (p) => {
    const per = periodoDePago(elegirRegla(reglas, p.id, null, new Date())?.periodo, hoy);
    const hasta = per.hasta > hoy ? hoy : per.hasta;
    const c = await cuentaDe(se.barberia.id, p.id, per.desde, hasta, pagadas.filter((v) => v.fecha >= per.desde && v.fecha <= hasta));
    const renta = c.regla?.tipo === "renta";
    const saldo = renta ? c.rentaPendiente : c.saldo;
    const pagado = renta ? c.rentaPagada : c.pagado;
    const periodo = `Del ${fechaCorta(per.desde)} al ${fechaCorta(per.hasta)}`;
    const fila: DatosFila = {
      id: p.id, nombre: p.nombre, avatar: p.avatar, modalidad: modalidadCorta(c.regla), frecuencia: NOMBRE_FRECUENCIA[c.regla?.periodo ?? "semana"] ?? "Semanal",
      periodo, semana: lunesDe(hasta), renta, monto: formatoDinero(saldo), parcial: pagado > 0 && saldo > 0,
      estado: saldo <= 0 ? (renta ? "Cubierta" : "Al corriente") : pagado > 0 ? (renta ? "Pago parcial" : "Pago parcial") : "Pendiente",
      puedePagar: puedePagar && saldo > 0,
      detalle: renta
        ? [["Periodo", periodo], ["Renta del periodo", formatoDinero(c.renta)], ["Recibido", formatoDinero(c.rentaPagada)], ["Pendiente", formatoDinero(c.rentaPendiente)]]
        : [["Periodo", periodo], ["Ventas atribuidas", formatoDinero(c.vendido)], ...(c.comision ? [["Comisión generada", formatoDinero(c.comision)] as [string, string]] : []), ...(c.sueldo ? [["Sueldo", formatoDinero(c.sueldo)] as [string, string]] : []), ["Pagos registrados", formatoDinero(c.pagado)], ...(c.faltantes ? [["Faltantes de caja", `−${formatoDinero(c.faltantes)}`] as [string, string]] : []), ["Saldo pendiente", formatoDinero(c.saldo)]],
    };
    return { renta, saldo, fila, sinRegla: !c.regla };
  }));
  const equipo = cuentas.filter((c) => !c.renta && !c.sinRegla);
  const rentas = cuentas.filter((c) => c.renta);
  const porPagar = equipo.filter((c) => c.saldo > 0);
  const porCobrar = rentas.filter((c) => c.saldo > 0);
  const alCorriente = [...equipo, ...rentas].filter((c) => c.saldo <= 0);
  const suma = (xs: typeof cuentas) => xs.reduce((a, c) => a + c.saldo, 0);

  return (
    <div className="eq">
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <PestanasEquipo pagos={puedePagar} />
      <div className="glass eq-card eq-resumen">
        {equipo.length > 0 && <div className="pri"><small>Por pagar al equipo</small><b>{formatoDinero(suma(porPagar))}</b><span>{porPagar.length} {porPagar.length === 1 ? "persona" : "personas"}</span></div>}
        {rentas.length > 0 && <div><small>Por cobrar de rentas</small><b>{formatoDinero(suma(porCobrar))}</b><span>{porCobrar.length} {porCobrar.length === 1 ? "renta" : "rentas"}</span></div>}
        {!equipo.length && !rentas.length && <p className="muted">Configura la forma de pago de cada persona en Ajustes, Usuarios.</p>}
      </div>
      <div className="eq-2col">
        {equipo.length > 0 && (
          <section>
            <div className="eq-h"><b>Por pagar al equipo</b><small>{porPagar.length} {porPagar.length === 1 ? "pendiente" : "pendientes"}</small></div>
            {porPagar.length ? <div className="glass eq-card">{porPagar.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div> : <p className="muted eq-vacio">Nadie tiene saldo pendiente.</p>}
          </section>
        )}
        {rentas.length > 0 && (
          <section>
            <div className="eq-h"><b>Por cobrar</b><small>{porCobrar.length} {porCobrar.length === 1 ? "renta pendiente" : "rentas pendientes"}</small></div>
            {porCobrar.length ? <div className="glass eq-card">{porCobrar.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div> : <p className="muted eq-vacio">Todas las rentas están cubiertas.</p>}
          </section>
        )}
      </div>
      {alCorriente.length > 0 && (
        <details className="eq-sec">
          <summary><Icono n="palomita" />Sin saldo pendiente<Icono n="abajo" /></summary>
          <div className="glass eq-card">{alCorriente.map((c) => <FilaPago key={c.fila.id} f={c.fila} />)}</div>
        </details>
      )}
    </div>
  );
}
