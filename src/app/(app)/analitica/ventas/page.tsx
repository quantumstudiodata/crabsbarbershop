import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { BarraFiltros } from "@/components/BarraFiltros";
import { Paginacion } from "@/components/Paginacion";
import { requerirSesion } from "@/lib/auth";
import { inArray } from "drizzle-orm";
import { verificadosDe } from "@/lib/pagos";
import { MINUTOS_CORRECCION } from "@/lib/caja";
import { cajaDe, diasYTotalVentas, idsVentas, equipoConVentas, metodosActivos, ventasEntre } from "@/lib/datos";
import { condicionVentas, type ConsultaFiltros, leerFiltros, paginaDeRegistros, rangoDePagina, urlDescarga } from "@/lib/filtros";
import { esMovil } from "@/lib/dispositivo";
import { schema } from "@/lib/db";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { HistorialVentas, type DiaVentas } from "@/components/HistorialVentas";
import { CabeceraVentas, periodoEncabezado } from "@/components/CabeceraPeriodo";

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
  // Ventas cobradas en línea: Stripe confirmó el pago (cobro con QR o anticipo de cita).
  const stripeDe = await verificadosDe(ventas.map((v) => v.id));
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
        stripe: (() => {
          const st = stripeDe.get(v.id);
          return st ? { reembolsado: st.estado === "reembolsado", tarjeta: st.tarjeta, referencia: st.referencia, confirmado: st.pagadoEn ? `${fechaLarga(fechaLocal(st.pagadoEn, zona))}, ${horaCorta(st.pagadoEn, zona)}` : "Sí" } : undefined;
        })(),
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
  const qs = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== "aviso" && k !== "error") as [string, string][]).toString();
  const regreso = `/analitica/ventas${qs ? `?${qs}` : ""}`;

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <CabeceraVentas barberiaId={s.barberia.id} zona={zona} hoy={hoy} persona={verTodas ? persona || undefined : s.usuario.id} propias={!verTodas} {...periodoEncabezado(p, hoy)} />

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
