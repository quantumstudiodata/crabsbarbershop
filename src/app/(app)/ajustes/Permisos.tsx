"use client";

import { Interruptor } from "@/components/ui";

export type GrupoPermisos = { titulo: string; permisos: { clave: string; texto: string; detalle: string; puedeDar: boolean }[] };
export type OpcionPuesto = { valor: string; rol: string; texto: string; detalle: string; permisos: readonly string[]; asignable: boolean; activo?: boolean };

const LIBRE = "La autorización de descuentos está al 100%: ya puede dar cualquier descuento por su cuenta.";

/**
 * Permisos por categoría: cada bloque se abre y muestra sus interruptores.
 * En el encabezado se ve cuántos están incluidos y se pueden encender o apagar todos a la vez.
 */
export function EditorPermisos({ grupos, marcados, cambiar, descuentoLibre, soloLectura }: {
  grupos: GrupoPermisos[]; marcados: Set<string>; cambiar?: (s: Set<string>) => void; descuentoLibre: boolean; soloLectura?: boolean;
}) {
  const poner = (claves: string[], v: boolean) => {
    if (!cambiar) return;
    const n = new Set(marcados);
    for (const k of claves) (v ? n.add(k) : n.delete(k));
    cambiar(n);
  };
  return (
    <div className="grupos-p">
      {!soloLectura && <input type="hidden" name="conPermisos" value="1" />}
      {!soloLectura && [...marcados].map((k) => <input key={k} type="hidden" name="permisos" value={k} />)}
      {grupos.map((g) => {
        const libres = g.permisos.filter((x) => !(x.clave === "ventas.descuento" && descuentoLibre));
        const editables = libres.filter((x) => x.puedeDar);
        const n = libres.filter((x) => marcados.has(x.clave)).length;
        // El encabezado está encendido mientras el grupo tenga algún permiso; al apagarlo se quitan todos.
        const alguno = editables.some((x) => marcados.has(x.clave));
        // En consulta no hay nada que tocar: la fila no es una etiqueta de formulario.
        const Fila = soloLectura ? "div" : "label";
        return (
          <details key={g.titulo} className="grupo-p">
            <summary>
              <span className="g-tit"><b>{g.titulo}</b><span className="muted">{n} de {libres.length} incluidos</span></span>
              {!soloLectura && editables.length > 0 && (
                <span className="g-todos" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Interruptor etiqueta={`Permisos de ${g.titulo}`} checked={alguno} onChange={(v) => poner(editables.map((x) => x.clave), v)} />
                </span>
              )}
            </summary>
            <div className="grupo-p-c">
              {g.permisos.map((x) => {
                const libre = x.clave === "ventas.descuento" && descuentoLibre;
                return (
                  <Fila key={x.clave} className={`entre perm-l ${libre ? "apagado-p" : ""} ${soloLectura ? "lectura" : ""}`}>
                    <span>{x.texto}{(libre || x.detalle) && <small className="nota-p">{libre ? LIBRE : x.detalle}</small>}</span>
                    {soloLectura
                      ? <span className={`chip-p ${marcados.has(x.clave) ? "si" : ""}`}>{marcados.has(x.clave) ? "Incluido" : "No incluido"}</span>
                      : <Interruptor etiqueta={x.texto} checked={!libre && marcados.has(x.clave)} disabled={libre || !x.puedeDar} onChange={(v) => poner([x.clave], v)} />}
                  </Fila>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/** Elegir puesto: las cuatro plantillas y los puestos del negocio. */
export function SelectorPuesto({ opciones, valor, cambiar }: { opciones: OpcionPuesto[]; valor: string; cambiar: (o: OpcionPuesto) => void }) {
  return (
    <div className="opciones-t chicas" role="radiogroup" aria-label="Puesto">
      {opciones.filter((o) => o.asignable || o.valor === valor).map((o) => (
        <label key={o.valor} className="opcion-t">
          <input type="radio" name="puesto" value={o.valor} checked={valor === o.valor} onChange={() => cambiar(o)} />
          <b>{o.texto}</b><small>{o.detalle || "Puesto personalizado"}</small>
        </label>
      ))}
    </div>
  );
}
