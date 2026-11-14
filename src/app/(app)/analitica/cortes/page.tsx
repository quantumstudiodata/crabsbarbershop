import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { BarraFiltros } from "@/components/BarraFiltros";
import { Paginacion } from "@/components/Paginacion";
import { requerirSesion } from "@/lib/auth";
import { cobradoresDe } from "@/lib/faltantes";
import { and, eq, inArray } from "drizzle-orm";
import { ajustesDeTurnos, detalleCortes, foliosCorte, metodosActivos, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { NecesitaRevision, TablaCortes, type Corte } from "./HistorialCortes";
import { fechaCorta, fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { type ConsultaFiltros, filtrarCortes, leerFiltros, paginaDeRegistros, rangoDePagina, urlDescarga } from "@/lib/filtros";
import { esMovil } from "@/lib/dispositivo";

export const metadata = { title: "Cortes de caja" };

export default async function Cortes({ searchParams }: { searchParams: Promise<ConsultaFiltros & { aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("cortes.ver")) redirect("/?aviso=sin-permiso");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const [gente, folios, todos, activos] = await Promise.all([
    db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar, activo: schema.usuarios.activo }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)),
    foliosCorte(s.barberia.id),
    turnosCerrados(s.barberia.id, 100000),
    metodosActivos(s.barberia.id),
  ]);
  // Quien ha abierto o cerrado alguna caja puede usarse como filtro.
  const conCortes = new Set(todos.flatMap((c) => [c.abiertoPor, c.cerradoPorId]));
  const personas = gente.filter((g) => conCortes.has(g.id));
  const f = leerFiltros(q, hoy, personas.map((x) => x.id));
  const p = f.periodo;
  const filtrados = filtrarCortes(todos.filter((c) => !p || (c.fechaOperativa >= p.desde && c.fechaOperativa <= p.hasta)), f, folios, new Map(gente.map((g) => [g.id, g.nombre])));
  // Todo el historial, siete días por página.
  // En el teléfono, 10 cortes por página; en escritorio, siete días por página.
  const movil = await esMovil();
  const pg = movil ? paginaDeRegistros(filtrados, f.pagina, 10) : null;
  const r = pg ?? rangoDePagina([...new Set(filtrados.map((c) => c.fechaOperativa))].sort().reverse(), f.pagina);
  const cortes = pg ? pg.items : filtrados.filter((c) => (r as { dias: string[] }).dias.includes(c.fechaOperativa));
  // Faltantes de los últimos 30 días que nadie ha revisado.
  const hace30 = fechaLocal(new Date(Date.now() - 30 * 864e5), zona);
  const revisar = todos.filter((c) => (c.diferencia ?? 0) < 0 && !c.revisadoEn && c.fechaOperativa >= hace30);
  const ids = [...new Set([...cortes, ...revisar].map((c) => c.id))];
  const [ajustes, det, evid] = await Promise.all([
    ajustesDeTurnos(s.barberia.id, ids), detalleCortes(s.barberia.id, ids),
    ids.length ? db.select({ id: schema.evidenciasCorte.id, turnoId: schema.evidenciasCorte.turnoId, etiqueta: schema.evidenciasCorte.etiqueta, nombre: schema.evidenciasCorte.nombre, tipo: schema.evidenciasCorte.tipo })
      .from(schema.evidenciasCorte).where(and(eq(schema.evidenciasCorte.barberiaId, s.barberia.id), inArray(schema.evidenciasCorte.turnoId, ids))) : Promise.resolve([]),
  ]);
  const persona = (id: string | null) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  const aCorte = (c: (typeof todos)[number]): Corte => {
    const cobros = det.cobros.filter((x) => x.turnoId === c.id);
    const efectivo = cobros.filter((x) => x.esEfectivo).reduce((a, x) => a + x.total, 0);
    const otros = cobros.filter((x) => !x.esEfectivo).map((x) => ({ metodo: x.metodo, total: x.total }));
    for (const m of activos) if (!m.esEfectivo && !otros.some((x) => x.metodo === m.nombre)) otros.push({ metodo: m.nombre, total: 0 });
    const metodos = [{ metodo: "Efectivo", total: efectivo }, ...otros];
    const movs = det.movimientos.filter((x) => x.turnoId === c.id);
    const gastos = det.gastos.filter((x) => x.turnoId === c.id);
    const suma = (t: string) => movs.filter((x) => x.tipo === t).reduce((a, x) => a + x.monto, 0);
    return {
      id: c.id, folio: folios.get(c.id) ?? "", dia: fechaLarga(c.fechaOperativa), fechaCorta: c.fechaOperativa === hoy ? "Hoy" : fechaCorta(c.fechaOperativa),
      horario: `${horaCorta(c.abiertoEn, zona)} a ${c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}`,
      abrio: persona(c.abiertoPor), cerro: (() => { const x = persona(c.cerradoPorId); return x.nombre ? x : { nombre: c.cerradoPor ?? "", avatar: "iniciales" }; })(),
      metodos, total: metodos.reduce((a, x) => a + x.total, 0), ventas: cobros.reduce((a, x) => Math.max(a, x.ventas), 0),
      fondo: c.fondoInicial, ventasEfectivo: efectivo, propinasEfectivo: det.propinas.find((x) => x.turnoId === c.id)?.efectivo ?? 0,
      entradas: suma("entrada"), retiros: suma("retiro") + suma("devolucion"), gastos: gastos.reduce((a, x) => a + x.monto, 0),
      esperado: c.efectivoEsperado ?? 0, contado: c.efectivoContado ?? 0, diferencia: c.diferencia ?? 0, ajustado: ajustes.filter((x) => x.turnoId === c.id).reduce((a, x) => a + x.monto, 0), notas: c.notasCierre,
      movimientos: [
        ...movs.map((m) => ({ t: m.creadoEn.getTime(), hora: horaCorta(m.creadoEn, zona), titulo: m.tipo === "retiro" ? "Retiro" : m.tipo === "entrada" ? "Entrada" : "Devolución", detalle: `${m.concepto}, ${m.usuario.split(" ")[0]}`, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
        ...gastos.map((g) => ({ t: g.creadoEn.getTime(), hora: horaCorta(g.creadoEn, zona), titulo: "Gasto", detalle: `${g.concepto}, ${g.usuario.split(" ")[0]}`, monto: -g.monto })),
      ].sort((a, b) => a.t - b.t),
      evidencias: evid.filter((x) => x.turnoId === c.id).map((x) => ({ id: x.id, etiqueta: x.etiqueta, nombre: x.nombre, tipo: x.tipo })),
      ajustes: ajustes.filter((x) => x.turnoId === c.id).map((x) => `Ajuste de ${formatoDinero(x.monto)} por ${x.usuario.split(" ")[0]}: ${x.motivo}`),
    };
  };
  const lista = cortes.map(aCorte);
  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <NecesitaRevision cortes={await Promise.all(revisar.map(async (c) => ({
        ...aCorte(c), abrioId: c.abiertoPor,
        cobradores: (await cobradoresDe(s.barberia.id, c.id)).map((x) => ({ ...x, nombre: persona(x.id).nombre, avatar: persona(x.id).avatar })),
        equipo: gente.filter((g) => g.activo).map(({ id, nombre, avatar }) => ({ id, nombre, avatar })),
      })))} puede={s.puede("caja.corregir")} />
      <div className="tit-fuera"><span className="lab">Cortes de caja</span></div>
      <section className="glass panel-hist subir d1">
        <BarraFiltros p={p} hoy={hoy} personas={personas} persona={f.persona} buscar={f.buscar} sinPeriodo="Todas las fechas"
          textoBuscar="Buscar folio o persona" descarga={s.puede("reportes.exportar") ? urlDescarga("cortes", f) : undefined} />
        <TablaCortes cortes={lista} corregir={s.puede("caja.corregir")} />
      </section>
      <Paginacion ruta="/analitica/cortes" params={q as Record<string, string | undefined>} pagina={r.pagina} paginas={r.paginas}
        texto={filtrados.length ? `${filtrados.length} ${filtrados.length === 1 ? "corte" : "cortes"}${r.paginas > 1 ? `, página ${r.pagina} de ${r.paginas}` : ""}` : ""} />
    </>
  );
}
