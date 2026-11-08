import Link from "next/link";
import { Icono } from "@/components/Icono";
import type { FilaSolicitud } from "@/lib/plataforma";
import { ESTADOS_SOLICITUD, hace, PRIORIDADES } from "@/lib/soporte";

/** Encabezado de las páginas internas, con regreso al Centro de soporte. */
export function CabezaSoporte({ titulo, sub, extra }: { titulo: string; sub?: string; extra?: React.ReactNode }) {
  return (
    <div className="cab-s">
      <div>
        <Link className="volver-s" href="/soporte"><Icono n="izquierda" />Centro de soporte</Link>
        <h1 className="titulo">{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {extra}
    </div>
  );
}

export function ListaSolicitudes({ filas, vacio = "No hay solicitudes." }: { filas: FilaSolicitud[]; vacio?: string }) {
  if (!filas.length) return <p className="muted vacio-s">{vacio}</p>;
  return (
    <div className="lista-s">
      {filas.map((f) => (
        <Link key={f.id} href={`/soporte/solicitudes/${f.id}`} className={`fila-s ${f.pendienteSoporte ? "pend" : ""}`}>
          <span className="t-s"><b>{f.asunto}</b><small>{f.negocio}, {f.persona} ({f.puesto})</small></span>
          <span className="meta-s">
            {(f.prioridad === "alta" || f.prioridad === "urgente") && <span className="chip-p alerta">{PRIORIDADES[f.prioridad]}</span>}
            <span className={`chip-p est-${f.estado}`}>{ESTADOS_SOLICITUD[f.estado]}</span>
            <small>{hace(f.t)}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Fila de una lista de herramientas: título, descripción y un indicador a la derecha. */
export function FilaHerramienta({ href, titulo, detalle, dato }: { href: string; titulo: string; detalle: string; dato?: React.ReactNode }) {
  return (
    <Link href={href} className="herr-s">
      <span><b>{titulo}</b><small>{detalle}</small></span>
      <span className="meta-s">{dato}<Icono n="derecha" /></span>
    </Link>
  );
}
