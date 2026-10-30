import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { BarraFiltros } from "@/components/BarraFiltros";
import { Paginacion } from "@/components/Paginacion";
import { requerirSesion } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { ajustesDeTurnos, detalleCortes, foliosCorte, metodosActivos, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { HistorialCortes, type Corte, type DiaCortes } from "./HistorialCortes";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { type ConsultaFiltros, filtrarCortes, leerFiltros, rangoDePagina, urlDescarga } from "@/lib/filtros";

export const metadata = { title: "Cortes de caja" };

export default async function Cortes({ searchParams }: { searchParams: Promise<ConsultaFiltros & { aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("caja.operar") && !s.puede("reportes.ver")) redirect("/");
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
  const r = rangoDePagina([...new Set(filtrados.map((c) => c.fechaOperativa))].sort().reverse(), f.pagina);
  const cortes = filtrados.filter((c) => r.dias.includes(c.fechaOperativa));
  const ids = cortes.map((c) => c.id);
  const [ajustes, det] = await Promise.all([ajustesDeTurnos(s.barberia.id, ids), detalleCortes(s.barberia.id, ids)]);
  const diferenciaTotal = filtrados.reduce((a, c) => a + (c.diferencia ?? 0), 0);
  const persona = (id: string | null) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  const lista: Corte[] = cortes.map((c) => {
    const cobros = det.cobros.filter((x) => x.turnoId === c.id);
    const efectivo = cobros.filter((x) => x.esEfectivo).reduce((a, x) => a + x.total, 0);
    const otros = cobros.filter((x) => !x.esEfectivo).map((x) => ({ metodo: x.metodo, total: x.total }));
    for (const m of activos) if (!m.esEfectivo && !otros.some((x) => x.metodo === m.nombre)) otros.push({ metodo: m.nombre, total: 0 });
    const metodos = [{ metodo: "Efectivo", total: efectivo }, ...otros];
    const movs = det.movimientos.filter((x) => x.turnoId === c.id);
    const gastos = det.gastos.filter((x) => x.turnoId === c.id);
    const suma = (t: string) => movs.filter((x) => x.tipo === t).reduce((a, x) => a + x.monto, 0);
    return {
      id: c.id, folio: folios.get(c.id) ?? "", dia: fechaLarga(c.fechaOperativa).toLowerCase(),
      horario: `${horaCorta(c.abiertoEn, zona)} a ${c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}`,
      abrio: persona(c.abiertoPor), cerro: persona(gente.find((g) => g.nombre === c.cerradoPor)?.id ?? null),
      metodos, total: metodos.reduce((a, x) => a + x.total, 0), ventas: cobros.reduce((a, x) => Math.max(a, x.ventas), 0),
      fondo: c.fondoInicial, ventasEfectivo: efectivo, propinasEfectivo: det.propinas.find((x) => x.turnoId === c.id)?.efectivo ?? 0,
      entradas: suma("entrada"), retiros: suma("retiro") + suma("devolucion"), gastos: gastos.reduce((a, x) => a + x.monto, 0),
      esperado: c.efectivoEsperado ?? 0, contado: c.efectivoContado ?? 0, diferencia: c.diferencia ?? 0, notas: c.notasCierre,
      movimientos: [
        ...movs.map((m) => ({ t: m.creadoEn.getTime(), hora: horaCorta(m.creadoEn, zona), titulo: m.tipo === "retiro" ? "Retiro" : m.tipo === "entrada" ? "Entrada" : "Devolución", detalle: `${m.concepto}, ${m.usuario.split(" ")[0]}`, monto: m.tipo === "entrada" ? m.monto : -m.monto })),
        ...gastos.map((g) => ({ t: g.creadoEn.getTime(), hora: horaCorta(g.creadoEn, zona), titulo: "Gasto", detalle: `${g.concepto}, ${g.usuario.split(" ")[0]}`, monto: -g.monto })),
      ].sort((a, b) => a.t - b.t),
      ajustes: ajustes.filter((x) => x.turnoId === c.id).map((x) => `Ajuste de ${formatoDinero(x.monto)} por ${x.usuario.split(" ")[0]}: ${x.motivo}`),
    };
  });
  const dias: DiaCortes[] = [...new Set(cortes.map((c) => c.fechaOperativa))].sort().reverse().map((f) => {
    const del = lista.filter((x, i) => cortes[i].fechaOperativa === f).reverse();
    return { fecha: f, titulo: fechaLarga(f), total: del.reduce((a, x) => a + x.total, 0), diferencia: del.reduce((a, x) => a + x.diferencia, 0), cortes: del };
  });

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <BarraFiltros p={p} hoy={hoy} personas={personas} persona={f.persona} buscar={f.buscar} sinPeriodo="Todo"
        textoBuscar="Buscar por folio, observaciones o persona" descarga={s.puede("reportes.exportar") ? urlDescarga("cortes", f) : undefined} />
      <div className="subir">
        <span className="lab">{p ? p.etiqueta : "Todo el historial"}{f.buscar ? `, con "${f.buscar}"` : ""}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>{filtrados.length} {filtrados.length === 1 ? "corte" : "cortes"}{diferenciaTotal ? `, ${diferenciaTotal < 0 ? "faltaron" : "sobraron"} ${formatoDinero(Math.abs(diferenciaTotal))}` : ", sin diferencias"}</h1>
      </div>
      {dias.length ? <HistorialCortes dias={dias} corregir={s.puede("caja.corregir")} /> : <p className="muted">No hay cortes con esos filtros.</p>}
      <Paginacion ruta="/analitica/cortes" params={q as Record<string, string | undefined>} pagina={r.pagina} paginas={r.paginas}
        texto={r.paginas > 1 ? `Página ${r.pagina} de ${r.paginas}` : ""} />
    </>
  );
}
