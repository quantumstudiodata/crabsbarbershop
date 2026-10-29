import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { and, eq, gte, lte } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { describirRegla, elegirRegla, porSemana } from "@/lib/comisiones";
import { copiaRegla, equipoQueAtiende, reglasDe, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, lunesDe } from "@/lib/fechas";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { HistorialVentas, type DiaVentas } from "@/components/HistorialVentas";
import { Pagar } from "./Pagar";
import { FiltroPersona } from "./FiltroPersona";

export const metadata = { title: "Ventas" };

type Q = { periodo?: string; desde?: string; hasta?: string; persona?: string; aviso?: string; error?: string };

export default async function Ventas({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  if (!s.puede("ventas.ver_todas")) redirect("/mis-ventas");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "dia");
  const equipo = await equipoQueAtiende(s.barberia.id);
  const persona = equipo.some((e) => e.id === q.persona) ? q.persona! : "";
  const { ventas } = await ventasEntre(s.barberia.id, p.desde, p.hasta, { zona, barberoId: persona || undefined });
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const total = pagadas.reduce((a, v) => a + v.conceptos.filter((c) => !persona || c.barberoId === persona).reduce((b, c) => b + c.precioCobrado, 0), 0);
  const dias = [...new Set(ventas.map((v) => v.fecha))];
  const puedeCancelar = s.puede("ventas.cancelar");
  const historial: DiaVentas[] = dias.map((d) => {
    const delDia = ventas.filter((v) => v.fecha === d);
    const monto = (v: (typeof ventas)[number]) => (persona ? v.conceptos.filter((c) => c.barberoId === persona).reduce((a, c) => a + c.precioCobrado, 0) : v.total);
    return {
      fecha: d, titulo: fechaLarga(d), total: delDia.filter((v) => v.estado === "pagada").reduce((a, v) => a + monto(v), 0),
      filas: delDia.map((v) => ({
        id: v.id, folio: v.folio, hora: horaCorta(v.creadoEn, zona), monto: monto(v), cancelada: v.estado === "cancelada",
        servicios: v.conceptos.map((c) => c.nombre).join(", "),
        detalle: [
          ["Servicios", v.conceptos.map((c) => `${c.nombre} con ${c.barbero.split(" ")[0]}, ${formatoDinero(c.precioCobrado)}`).join("; ")],
          ...(v.conceptos.some((c) => c.descuento) ? [["Descuento", v.conceptos.filter((c) => c.descuento).map((c) => `${formatoDinero(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
          ...(v.propinas.length ? [["Propina", v.propinas.map((x) => `${formatoDinero(x.monto)}${x.esEfectivo ? " en efectivo" : ""}`).join(" y ")] as [string, string]] : []),
          ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(pg.monto)}`).join(" y ") || "Sin pago"],
          ["Registró", v.registradaPor.split(" ")[0]],
          ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
        ] as [string, string][],
        accion: puedeCancelar && v.estado === "pagada" ? { tipo: "cancelar" as const } : undefined,
      })),
    };
  });
  const elegida = equipo.find((e) => e.id === persona);
  const cuenta = elegida ? await cuentaDe(s.barberia.id, elegida.id, p.desde, p.hasta > hoy ? hoy : p.hasta, pagadas) : null;
  const extra = persona ? `&persona=${persona}` : "";
  const qs = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "aviso" && k !== "error") as [string, string][]).toString();
  const regreso = `/analitica/ventas${qs ? `?${qs}` : ""}`;

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="entre">
        <SelectorPeriodo ruta="/analitica/ventas" p={p} hoy={hoy} conDia extra={extra} />
        <FiltroPersona personas={equipo} actual={persona} />
      </div>
      <div className="subir">
        <span className="lab">{p.etiqueta}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>{pagadas.length} {pagadas.length === 1 ? "venta" : "ventas"}, {formatoDinero(total)}</h1>
      </div>

      {elegida && cuenta && (
        <section className="glass panel subir">
          <div className="entre">
            <span className="persona"><Avatar avatar={elegida.avatar} nombre={elegida.nombre} t={44} /><span><b>{elegida.nombre}</b><small className="muted" style={{ display: "block" }}>{cuenta.forma}</small></span></span>
            {s.puede("equipo.pagar") && <Pagar id={elegida.id} nombre={elegida.nombre} semana={lunesDe(p.hasta > hoy ? hoy : p.hasta)} renta={cuenta.renta > 0} pendiente={formatoDinero(cuenta.renta > 0 ? cuenta.rentaPendiente : cuenta.saldo)} regreso={regreso} />}
          </div>
          <div className="cifras">
            <div><span className="lab">Ventas generadas</span><b>{formatoDinero(cuenta.vendido)}</b></div>
            {cuenta.renta > 0 ? (
              <>
                <div><span className="lab">Renta de silla</span><b>{formatoDinero(cuenta.renta)}</b></div>
                <div><span className="lab">Renta pagada</span><b>{formatoDinero(cuenta.rentaPagada)}</b></div>
                <div><span className="lab">Estado</span>{cuenta.rentaPendiente > 0 ? <b style={{ color: "var(--warn)" }}>Faltan {formatoDinero(cuenta.rentaPendiente)}</b> : <span className="cubierto"><i>✓</i>Renta cubierta</span>}</div>
              </>
            ) : (
              <>
                <div><span className="lab">Le corresponde<Ayuda titulo="Le corresponde">Su comisión en estas fechas, más su sueldo si tiene uno.</Ayuda></span><b>{formatoDinero(cuenta.corresponde)}</b></div>
                <div><span className="lab">Pagado</span><b>{formatoDinero(cuenta.pagado)}</b></div>
                <div><span className="lab">Por pagar</span>{cuenta.saldo > 0 ? <b>{formatoDinero(cuenta.saldo)}</b> : <span className="cubierto"><i>✓</i>Al corriente</span>}</div>
              </>
            )}
          </div>
        </section>
      )}

      <HistorialVentas dias={historial} regreso={regreso} />
    </>
  );
}

/** Cuenta de una persona en el periodo: lo que le corresponde, lo pagado y su renta. */
async function cuentaDe(barberiaId: string, id: string, desde: string, hasta: string, pagadas: Awaited<ReturnType<typeof ventasEntre>>["ventas"]) {
  const [reglas, pagos] = await Promise.all([
    reglasDe(barberiaId),
    db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, barberiaId), eq(schema.pagosComision.barberoId, id), gte(schema.pagosComision.semana, lunesDe(desde)), lte(schema.pagosComision.semana, hasta))),
  ]);
  const cs = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === id));
  const regla = copiaRegla(elegirRegla(reglas, id, null, new Date()));
  const semanas = Math.max(1, Math.ceil((diasEntre(lunesDe(desde), hasta) + 1) / 7));
  const sueldo = regla && (regla.tipo === "sueldo" || regla.tipo === "mixto") ? porSemana(regla.montoSemanal, regla.periodo) * semanas : 0;
  const renta = regla?.tipo === "renta" ? porSemana(regla.montoSemanal, regla.periodo) * semanas : 0;
  const comision = regla?.tipo === "renta" ? 0 : cs.reduce((a, c) => a + c.comision, 0);
  const pagado = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentaPagada = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  return {
    forma: describirRegla(regla, formatoDinero), vendido: cs.reduce((a, c) => a + c.precioCobrado, 0),
    corresponde: comision + sueldo, pagado, saldo: Math.max(comision + sueldo - pagado, 0),
    renta, rentaPagada, rentaPendiente: Math.max(renta - rentaPagada, 0),
  };
}
