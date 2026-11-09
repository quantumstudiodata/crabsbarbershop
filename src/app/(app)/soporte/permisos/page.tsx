import { eq } from "drizzle-orm";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { menuDe } from "@/lib/menu";
import { DETALLE_PERMISO, GRUPOS_PERMISOS, NOMBRE_ROL, PERMISOS, PERMISOS_CONFIG, PLANTILLAS, permisosDe, type Permiso, type Rol } from "@/lib/permisos";
import { CabezaSoporte } from "../Comunes";

export const metadata = { title: "Simulación de permisos" };

/**
 * Qué secciones aparecen y qué funciones están disponibles o restringidas para cada puesto, lado a lado.
 * Es solo consulta: no ejecuta ninguna acción.
 */
export default async function Simulacion() {
  const s = await requerirSesion();
  const propios = await db.select().from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id));
  const columnas: { nombre: string; rol: Rol; permisos: Set<Permiso> }[] = [
    ...PLANTILLAS.map((r) => ({ nombre: NOMBRE_ROL[r], rol: r, permisos: permisosDe(r) })),
    ...propios.map((p) => ({ nombre: p.nombre, rol: p.plantilla, permisos: permisosDe(p.plantilla, [], [], p.permisos) })),
  ];
  const menus = columnas.map((c) => menuDe(c.rol, (p) => c.permisos.has(p)));
  const ajustes = columnas.map((c) => c.permisos.has("usuarios.ver") || c.permisos.has("servicios.ver") || PERMISOS_CONFIG.some((p) => c.permisos.has(p)));
  const secciones: [string, (i: number) => boolean][] = [
    ["Inicio", (i) => menus[i].items.some((x) => x.href === "/")],
    ["Cobro", (i) => menus[i].items.some((x) => x.href === "/cobrar")],
    ["Ventas del barbero", (i) => menus[i].items.some((x) => x.href === "/analitica/ventas")],
    ["Analítica, resumen", (i) => menus[i].sub.some(([h]) => h === "/analitica")],
    ["Analítica, ventas", (i) => menus[i].sub.some(([h]) => h === "/analitica/ventas")],
    ["Analítica, cortes de caja", (i) => menus[i].sub.some(([h]) => h === "/analitica/cortes")],
    ["Analítica, finanzas", (i) => menus[i].sub.some(([h]) => h === "/analitica/finanzas")],
    ["Datos", (i) => menus[i].items.some((x) => x.href === "/libreta")],
    ["Ajustes", (i) => ajustes[i]],
  ];
  const celda = (si: boolean) => <td className="c-sim">{si ? <span className="chip-p si">Disponible</span> : <span className="chip-p">Restringido</span>}</td>;
  return (
    <>
      <CabezaSoporte titulo="Simulación de permisos" sub="Qué aparece y qué está restringido en cada puesto. Solo consulta: no ejecuta ninguna acción. Para ver cómo se ve la interfaz, usa la vista previa." />
      <section className="glass tabla-l sim-s">
        <div className="desliza"><table>
          <thead><tr><th>Secciones del menú</th>{columnas.map((c) => <th key={c.nombre}>{c.nombre}</th>)}</tr></thead>
          <tbody>{secciones.map(([t, f]) => <tr key={t}><td className="f">{t}</td>{columnas.map((c, i) => <Celda key={c.nombre} si={f(i)} render={celda} />)}</tr>)}</tbody>
        </table></div>
      </section>
      {GRUPOS_PERMISOS.map((g) => (
        <section key={g.titulo} className="glass tabla-l sim-s">
          <div className="desliza"><table>
            <thead><tr><th>{g.titulo}</th>{columnas.map((c) => <th key={c.nombre}>{c.nombre}</th>)}</tr></thead>
            <tbody>{g.permisos.map((p) => (
              <tr key={p}><td className="f">{PERMISOS[p]}{DETALLE_PERMISO[p] && <small>{DETALLE_PERMISO[p]}</small>}</td>{columnas.map((c) => <Celda key={c.nombre} si={c.permisos.has(p)} render={celda} />)}</tr>
            ))}</tbody>
          </table></div>
        </section>
      ))}
      <p className="ayuda-txt">Muestra los permisos de cada plantilla o puesto. A una persona en particular se le pueden dar o quitar permisos aparte, desde su ficha en Ajustes.</p>
    </>
  );
}

function Celda({ si, render }: { si: boolean; render: (si: boolean) => React.ReactNode }) {
  return <>{render(si)}</>;
}
