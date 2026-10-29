import { redirect } from "next/navigation";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { ajustesDeTurnos, detalleCortes, foliosCorte, turnosCerrados } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { HistorialCortes, type Corte, type DiaCortes } from "./HistorialCortes";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Cortes de caja" };

export default async function Cortes({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("caja.operar") && !s.puede("reportes.ver")) redirect("/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "semana");
  const cortes = await turnosCerrados(s.barberia.id, 1000, { desde: p.desde, hasta: p.hasta });
  const ids = cortes.map((c) => c.id);
  const [ajustes, folios, det, gente] = await Promise.all([
    ajustesDeTurnos(s.barberia.id, ids), foliosCorte(s.barberia.id), detalleCortes(s.barberia.id, ids),
    db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)),
  ]);
  const persona = (id: string | null) => gente.find((g) => g.id === id) ?? { nombre: "", avatar: "iniciales" };
  const lista: Corte[] = cortes.map((c) => {
    const cobros = det.cobros.filter((x) => x.turnoId === c.id);
    const efectivo = cobros.filter((x) => x.esEfectivo).reduce((a, x) => a + x.total, 0);
    const metodos = [{ metodo: "Efectivo", total: efectivo }, ...cobros.filter((x) => !x.esEfectivo).map((x) => ({ metodo: x.metodo, total: x.total }))];
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
      <div className="entre">
        <SelectorPeriodo ruta="/analitica/cortes" p={p} hoy={hoy} conAnio />
        {s.puede("reportes.exportar") && <a className="bt sec solo chico" href={`/api/exportar?tipo=cortes&desde=${p.desde}&hasta=${p.hasta}`}><Icono n="descargar" />Descargar</a>}
      </div>
      <HistorialCortes dias={dias} corregir={s.puede("caja.corregir")} />
    </>
  );
}
