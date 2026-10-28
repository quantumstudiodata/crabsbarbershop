import { asc, eq } from "drizzle-orm";
import { Aviso, AVISOS, Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { NOMBRE_ROL, PERMISOS, PERMISOS_POR_ROL, rolesAsignables, type Permiso } from "@/lib/permisos";
import { actualizarPersona } from "./actions";
import { BotonRestablecer, FormAlta } from "./FormsClave";

export const metadata = { title: "Ajustes" };

export default async function Personas({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  const q = await searchParams;
  if (!s.puede("ajustes.usuarios")) {
    return <Aviso>Elige una opción de arriba.</Aviso>;
  }
  const gente = await db.select().from(schema.usuarios).where(eq(schema.usuarios.barberiaId, s.barberia.id)).orderBy(asc(schema.usuarios.nombre));
  const asignables = rolesAsignables(s.usuario.rol);
  const a = q.aviso ? AVISOS[q.aviso] : undefined;

  return (
    <>
      {a && <Aviso tipo={a.tipo}>{a.texto}</Aviso>}
      {q.error && <Aviso tipo="error">{q.error}</Aviso>}
      <Encabezado etiqueta="Ajustes" titulo="Personas con acceso" sub="Cada quien entra con su usuario y ve solo lo que le toca." />
      <section className="dos">
        <div className="glass panel" style={{ gap: 0 }}>
          {gente.map((u) => {
            const editable = u.id !== s.usuario.id && asignables.includes(u.rol);
            const base = new Set(PERMISOS_POR_ROL[u.rol]);
            return (
              <div key={u.id} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }} className="pila-chica">
                <div className="entre">
                  <div className="fila">
                    <span className="av">{u.nombre[0]}</span>
                    <span><b>{u.nombre}</b><small className="muted" style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 12 }}>{u.usuario}</small></span>
                  </div>
                  <div className="fila">
                    <span className={`chip ${u.rol === "duena" || u.rol === "admin" ? "oscuro" : u.rol === "encargada" ? "" : "gris"}`}>{NOMBRE_ROL[u.rol]}</span>
                    {!u.activo && <span className="chip warn">Desactivada</span>}
                    {u.debeCambiar && u.activo && <span className="chip gris">Contraseña temporal</span>}
                  </div>
                </div>
                {editable && (
                  <>
                    <BotonRestablecer id={u.id} nombre={u.nombre} />
                    <details>
                      <summary className="enlace">Cambiar rol o permisos</summary>
                      <form action={actualizarPersona} className="pila" style={{ marginTop: 12 }}>
                        <input type="hidden" name="id" value={u.id} />
                        <label className="campo"><span>Rol</span>
                          <select className="input" name="rol" defaultValue={u.rol}>{asignables.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select>
                        </label>
                        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pila-chica">
                          <legend className="lab" style={{ marginBottom: 8 }}>Permisos extra</legend>
                          {(Object.keys(PERMISOS) as Permiso[]).filter((p) => !base.has(p) && !p.startsWith("ajustes.")).map((p) => (
                            <label key={p} className="fila" style={{ gap: 8, fontSize: 14 }}>
                              <input type="checkbox" name="permisos" value={p} defaultChecked={u.permisosExtra.includes(p)} /> {PERMISOS[p]}
                            </label>
                          ))}
                        </fieldset>
                        <label className="fila" style={{ gap: 8 }}><input type="checkbox" name="activo" value="si" defaultChecked={u.activo} /> Puede entrar al sistema</label>
                        <button className="btn pri">Guardar cambios</button>
                      </form>
                    </details>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <FormAlta roles={asignables.map((r) => ({ valor: r, texto: NOMBRE_ROL[r] }))} />
      </section>
    </>
  );
}
