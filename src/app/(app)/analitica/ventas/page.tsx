import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { BarraFiltros } from "@/components/BarraFiltros";
import { Paginacion } from "@/components/Paginacion";
import { requerirSesion } from "@/lib/auth";
import { inArray } from "drizzle-orm";
import { Avatar } from "@/components/Avatar";
import { Ayuda } from "@/components/Ayuda";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { cajaDe, diasYTotalVentas, idsVentas, equipoConVentas, metodosActivos, ventasEntre } from "@/lib/datos";
import { condicionVentas, type ConsultaFiltros, leerFiltros, paginaDeRegistros, rangoDePagina, urlDescarga } from "@/lib/filtros";
import { esMovil } from "@/lib/dispositivo";
import { schema } from "@/lib/db";
import { lunesDe } from "@/lib/fechas";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { HistorialVentas, type DiaVentas } from "@/components/HistorialVentas";
import { CabeceraVentas, periodoEncabezado } from "@/components/CabeceraPeriodo";
import { Pagar } from "./Pagar";
import { ConteoCortes } from "./ConteoCortes";
import { cuentaDe } from "@/lib/equipo";

export const metadata = { title: "Ventas" };

type Q = ConsultaFiltros & { aviso?: string; error?: string; cortes?: string };

export default async function Ventas({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  // La misma pantalla para todos. El barbero consulta todo el historial, pero el encabezado y las gráficas son de sus propios datos.
  const verTodas = s.puede("ventas.ver_todas");
  const atiende = s.usuario.rol === "barbera" || s.usuario.rol === "encargada";
  if (!verTodas && !atiende) redirect("/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const equipo = await equipoConVentas(s.barberia.id);
  const f = leerFiltros(q, hoy, equipo.map((e) => e.id));
  const p = f.periodo;
  const persona = f.persona;
  const condiciones = condicionVentas(f);
  // Sin filtros se ve todo el historial, siete días por página.
  const resumen = await diasYTotalVentas(s.barberia.id, zona, { desde: p?.desde, hasta: p?.hasta, persona, condiciones });
  // En el teléfono se pagina por ventas (7 por página) y sin desplazamiento interno; en escritorio, por días.
  const movil = await esMovil();
  let r: { pagina: number; paginas: number; dias: string[]; desde: string; hasta: string };
  let soloIds: string[] | null = null;
  if (movil) {
    const pg = paginaDeRegistros(await idsVentas(s.barberia.id, zona, { desde: p?.desde, hasta: p?.hasta, condiciones }), f.pagina, 7);
    soloIds = pg.items.map((x) => x.id);
    const ds = [...new Set(pg.items.map((x) => x.d))];
    r = { pagina: pg.pagina, paginas: pg.paginas, dias: ds, desde: ds[ds.length - 1] ?? hoy, hasta: ds[0] ?? hoy };
  } else r = rangoDePagina(resumen.dias, f.pagina);
  const { ventas } = r.dias.length
    ? await ventasEntre(s.barberia.id, r.desde, r.hasta, { zona, condiciones: soloIds ? [...condiciones, inArray(schema.ventas.id, soloIds.length ? soloIds : ["00000000-0000-0000-0000-000000000000"])] : condiciones })
    : { ventas: [] };
  const dias = r.dias;
  const puedeCancelar = s.puede("ventas.cancelar");
  // El barbero puede anular sus propios cobros durante los primeros minutos, mientras la caja sigue abierta.
  const turno = verTodas ? null : await cajaDe(s);
  const ahora = Date.now();
  const puedeModificar = s.puede("ventas.modificar");
  const opciones = puedeModificar ? {
    equipo: equipo.map((e) => ({ id: e.id, nombre: e.nombre })),
    metodos: (await metodosActivos(s.barberia.id)).map((m) => ({ id: m.id, nombre: m.nombre })),
  } : undefined;
  const historial: DiaVentas[] = dias.map((d) => {
    const delDia = ventas.filter((v) => v.fecha === d);
    const monto = (v: (typeof ventas)[number]) => (persona ? v.conceptos.filter((c) => c.barberoId === persona).reduce((a, c) => a + c.precioCobrado, 0) : v.total);
    // Con una persona elegida, de cada venta se ven solo sus servicios.
    const propios = (v: (typeof ventas)[number]) => (persona ? v.conceptos.filter((c) => c.barberoId === persona) : v.conceptos);
    return {
      fecha: d, titulo: d === hoy ? "Hoy" : fechaLarga(d), total: delDia.filter((v) => v.estado === "pagada").reduce((a, v) => a + monto(v), 0),
      filas: delDia.map((v) => ({
        id: v.id, folio: v.folio, hora: horaCorta(v.creadoEn, zona), monto: monto(v), cancelada: v.estado === "cancelada",
        servicios: propios(v).map((c) => c.nombre).join(", "),
        detalle: [
          ["Servicios", propios(v).map((c) => `${c.nombre} con ${c.barbero.split(" ")[0]}, ${formatoDinero(c.precioCobrado)}`).join("; ")],
          ...(v.conceptos.some((c) => c.descuento) ? [["Descuento", v.conceptos.filter((c) => c.descuento).map((c) => `${formatoDinero(c.descuento)} en ${c.nombre}`).join("; ")] as [string, string]] : []),
          ...(v.propinas.length ? [["Propina", v.propinas.map((x) => `${formatoDinero(x.monto)}${x.esEfectivo ? " en efectivo" : ""}`).join(" y ")] as [string, string]] : []),
          ["Pago", v.pagos.map((pg) => `${pg.metodo} ${formatoDinero(pg.monto)}`).join(" y ") || "Sin pago"],
          ["Registró", v.registradaPor.split(" ")[0]],
          ...(v.estado === "cancelada" ? [["Cancelada", v.motivoCancelacion ?? ""] as [string, string]] : []),
        ] as [string, string][],
        accion: puedeCancelar && v.estado === "pagada" ? { tipo: "cancelar" as const }
          : !verTodas && v.estado === "pagada" && v.registradaPorId === s.usuario.id && turno?.id === v.turnoId && ahora < v.creadoEn.getTime() + MINUTOS_CORRECCION * 60000
            ? { tipo: "anular" as const, hasta: horaCorta(new Date(v.creadoEn.getTime() + MINUTOS_CORRECCION * 60000), zona) } : undefined,
        edicion: puedeModificar && v.estado === "pagada" ? {
          conceptos: v.conceptos.map((c) => ({ id: c.id, nombre: c.nombre, barberoId: c.barberoId, precio: c.precioCobrado })),
          pagos: v.pagos.filter((pg) => pg.metodoId).map((pg) => ({ metodoId: pg.metodoId!, monto: pg.monto })),
        } : undefined,
      })),
    };
  });
  const elegida = equipo.find((e) => e.id === persona);
  // La cuenta de una persona se mide en el periodo elegido, o en el mes en curso si se ve todo.
  const rango = p ?? leerPeriodo({ periodo: "mes" }, hoy);
  const cuenta = elegida ? await cuentaDe(s.barberia.id, elegida.id, rango.desde, rango.hasta > hoy ? hoy : rango.hasta, (await ventasEntre(s.barberia.id, rango.desde, rango.hasta, { zona, barberoId: elegida.id })).ventas.filter((v) => v.estado === "pagada")) : null;
  const qs = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "aviso" && k !== "error") as [string, string][]).toString();
  const qsSinCortes = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "aviso" && k !== "error" && k !== "cortes") as [string, string][]).toString();
  const regreso = `/analitica/ventas${qs ? `?${qs}` : ""}`;

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <CabeceraVentas barberiaId={s.barberia.id} zona={zona} hoy={hoy} persona={verTodas ? persona || undefined : s.usuario.id} propias={!verTodas} {...periodoEncabezado(p, hoy)} />
      <ConteoCortes barberiaId={s.barberia.id} zona={zona} hoy={hoy} modo={q.cortes === "mes" ? "mes" : "semana"} base={`/analitica/ventas${qsSinCortes ? `?${qsSinCortes}` : ""}`} />
      {verTodas && elegida && cuenta && (
        <section className="glass panel subir">
          <div className="entre">
            <span className="persona"><Avatar avatar={elegida.avatar} nombre={elegida.nombre} t={44} /><span><b>{elegida.nombre}</b><small className="muted" style={{ display: "block" }}>{cuenta.forma}</small></span></span>
            {s.puede("equipo.pagar") && <Pagar id={elegida.id} nombre={elegida.nombre} semana={lunesDe(rango.hasta > hoy ? hoy : rango.hasta)} renta={cuenta.renta > 0} pendiente={formatoDinero(cuenta.renta > 0 ? cuenta.rentaPendiente : cuenta.saldo)} regreso={regreso} />}
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
                {cuenta.faltantes > 0 && <div><span className="lab">Faltantes de caja<Ayuda titulo="Faltantes de caja">Faltantes de cortes de caja ya autorizados. Solo lo autorizado se resta de lo que se le paga.</Ayuda></span><b>−{formatoDinero(cuenta.faltantes)}</b></div>}
                <div><span className="lab">Por pagar</span>{cuenta.saldo > 0 ? <b>{formatoDinero(cuenta.saldo)}</b> : <span className="cubierto"><i>✓</i>Al corriente</span>}</div>
              </>
            )}
          </div>
        </section>
      )}

      <div className="tit-fuera subir d1"><span className="lab">Historial de ventas</span><span className="muted">{resumen.ventas} {resumen.ventas === 1 ? "venta" : "ventas"}, {formatoDinero(resumen.monto)}</span></div>
      <section className="glass panel-hist subir d1">
        <BarraFiltros p={p} hoy={hoy} personas={equipo} persona={persona} buscar={f.buscar} sinPeriodo="Todas las fechas" textoBuscar="Buscar folio, servicio o barbero"
          descarga={s.puede("reportes.exportar") ? urlDescarga("ventas", f) : undefined} />
        {historial.length ? <HistorialVentas dias={historial} regreso={regreso} opciones={opciones} sinMarco /> : <p className="muted" style={{ padding: "8px 4px" }}>No hay ventas con esos filtros.</p>}
      </section>
      <Paginacion ruta="/analitica/ventas" params={q as Record<string, string | undefined>} pagina={r.pagina} paginas={r.paginas}
        texto={resumen.dias.length ? (movil ? `Página ${r.pagina} de ${r.paginas}` : `${resumen.dias.length} ${resumen.dias.length === 1 ? "día" : "días"} con ventas${r.paginas > 1 ? `, página ${r.pagina} de ${r.paginas}` : ""}`) : ""} />
    </>
  );
}
