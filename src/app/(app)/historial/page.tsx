import { type ConsultaPeriodo, leerPeriodo } from "@/lib/periodo";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { describirEvento } from "@/lib/eventos";
import { esFechaValida, fechaLocal, horaCorta, ZONA } from "@/lib/fechas";
import { Filtros } from "./Filtros";
import { Lista, type FilaHistorial } from "./Lista";

export const metadata = { title: "Historial" };

const POR_PAGINA = 10;
const CATEGORIAS: [string, string][] = [["", "Todas las categorías"], ["venta", "Ventas"], ["caja", "Caja"], ["gasto", "Egresos"], ["precio", "Precios"], ["ajuste", "Configuración"], ["usuario", "Usuarios"], ["equipo", "Pagos al equipo"], ["idea", "Ideas"], ["acceso", "Accesos"]];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Q = ConsultaPeriodo & { tipo?: string; usuario?: string; q?: string; pagina?: string };

export default async function Historial({ searchParams }: { searchParams: Promise<Q> }) {
  const s = await requerirSesion();
  // Quien no ve el historial completo (los barberos) solo ve lo de la operación:
  // ventas, caja y cambios de servicios y precios; de accesos, solo los suyos. Nada administrativo.
  const completo = s.puede("historial.ver");
  if (!completo && s.usuario.rol !== "barbera" && s.usuario.rol !== "encargada") redirect("/");
  const categorias = completo ? CATEGORIAS : CATEGORIAS.filter(([k]) => ["", "venta", "caja", "precio"].includes(k));
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria ?? ZONA;
  const hoy = fechaLocal(new Date(), zona);
  const h = schema.historial;
  const cond: SQL[] = [eq(h.barberiaId, s.barberia.id)];
  if (!completo) cond.push(sql`(${h.tipo} in ('venta', 'caja', 'precio')
    or (${h.tipo} = 'ajuste' and ${h.accion} ~ ' el servicio ')
    or (${h.tipo} = 'gasto' and ${h.detalle}->>'deCaja' = 'true')
    or (${h.tipo} = 'acceso' and ${h.usuarioId} = ${s.usuario.id}))`);
  if (q.tipo && categorias.some(([k]) => k === q.tipo)) cond.push(q.tipo === "precio" && !completo ? or(eq(h.tipo, "precio"), eq(h.tipo, "ajuste"))! : eq(h.tipo, q.tipo));
  if (q.usuario && /^[0-9a-f-]{36}$/.test(q.usuario)) cond.push(eq(h.usuarioId, q.usuario));
  const conFecha = q.periodo || q.fecha || q.mes || q.anio || (esFechaValida(q.desde) && esFechaValida(q.hasta));
  const p = conFecha ? leerPeriodo(q, hoy, "dia") : null;
  if (p) {
    const dia = sql`(${h.creadoEn} at time zone ${zona})::date`;
    cond.push(sql`${dia} between ${p.desde}::date and ${p.hasta}::date`);
  }
  const texto = (q.q ?? "").trim().slice(0, 60);
  if (texto) {
    const t = `%${texto}%`;
    cond.push(or(ilike(h.accion, t), sql`${h.detalle}::text ilike ${t}`, ilike(schema.usuarios.nombre, t), ilike(schema.usuarios.usuario, t))!);
  }
  const pagina = Math.max(1, Number(q.pagina) || 1);
  const [[{ total }], filas, gente] = await Promise.all([
    db.select({ total: count() }).from(h).leftJoin(schema.usuarios, eq(schema.usuarios.id, h.usuarioId)).where(and(...cond)),
    db.select({ id: h.id, tipo: h.tipo, accion: h.accion, detalle: h.detalle, creadoEn: h.creadoEn, nombre: schema.usuarios.nombre, usuario: schema.usuarios.usuario, avatar: schema.usuarios.avatar })
      .from(h).leftJoin(schema.usuarios, eq(schema.usuarios.id, h.usuarioId)).where(and(...cond))
      .orderBy(desc(h.creadoEn)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre, avatar: schema.usuarios.avatar }).from(schema.usuarios)
      .where(and(eq(schema.usuarios.barberiaId, s.barberia.id), ...(completo ? [] : [inArray(schema.usuarios.rol, ["barbera", "encargada", "duena", "admin"])]))).orderBy(asc(schema.usuarios.nombre)),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ayer = sumar(hoy, -1);
  const lista: FilaHistorial[] = filas.map((f) => {
    const d = (f.detalle ?? {}) as Record<string, unknown>;
    const e = describirEvento(f.tipo, f.accion, d, f.nombre);
    const dia = fechaLocal(f.creadoEn, zona);
    const etiquetaDia = dia === hoy ? "Hoy" : dia === ayer ? "Ayer" : `${Number(dia.slice(8))} ${MES[Number(dia.slice(5, 7)) - 1]}`;
    const folio = typeof d.folio === "string" ? d.folio : f.accion.match(/CRB-\d+|[A-Z]{2,5}-\d{6}/)?.[0];
    return {
      id: f.id, cuando: `${etiquetaDia}, ${horaCorta(f.creadoEn, zona)}`,
      exacto: new Intl.DateTimeFormat("es-MX", { timeZone: zona, dateStyle: "full", timeStyle: "medium" }).format(f.creadoEn),
      nombre: f.nombre ?? "Sistema", usuario: f.usuario ?? "", avatar: f.avatar ?? "cangrejo", categoria: e.categoria,
      titulo: e.titulo, objeto: e.objeto, extra: e.extra, accion: f.accion,
      antes: typeof d.antes === "string" ? d.antes : undefined, ahora: typeof d.ahora === "string" ? d.ahora : undefined,
      motivo: typeof d.motivo === "string" ? d.motivo : typeof d.notas === "string" && d.notas ? d.notas : typeof d.nota === "string" && d.nota ? d.nota : undefined,
      folio,
    };
  });
  const enlace = (n: number) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    p.set("pagina", String(n));
    return `/historial?${p.toString()}`;
  };
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 2);

  return (
    <>
      <div>
        <h1 className="titulo">Historial</h1>
        <p className="sub">{completo ? "Registro permanente de lo que pasa en el sistema. Nada se borra." : "Lo que pasa en el día a día: ventas, caja y cambios de servicios y precios."}</p>
      </div>
      <Filtros categorias={categorias} gente={gente} hoy={hoy} periodo={p} />
      <Lista filas={lista} />
      <div className="entre">
        <span className="muted" style={{ fontSize: 13 }}>{total} {total === 1 ? "evento" : "eventos"}{total ? `, del ${(pagina - 1) * POR_PAGINA + 1} al ${Math.min(pagina * POR_PAGINA, total)}` : ""}</span>
        {paginas > 1 && (
          <nav className="paginas" aria-label="Páginas">
            {pagina > 1 && <Link href={enlace(pagina - 1)} aria-label="Anterior">‹</Link>}
            {numeros.map((n, i) => (
              <span key={n} style={{ display: "contents" }}>
                {i > 0 && n - numeros[i - 1] > 1 && <span className="muted">…</span>}
                <Link href={enlace(n)} aria-current={n === pagina ? "page" : undefined}>{n}</Link>
              </span>
            ))}
            {pagina < paginas && <Link href={enlace(pagina + 1)} aria-label="Siguiente">›</Link>}
          </nav>
        )}
      </div>
    </>
  );
}

function sumar(f: string, n: number) {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
