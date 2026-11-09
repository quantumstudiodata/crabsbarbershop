import { Avatar } from "@/components/Avatar";
import { formatoDinero } from "@/lib/money";

export type FilaBarbero = { id: string; nombre: string; avatar: string; servicios: number; monto: number };

/** Lo que lleva cada barbero en el periodo de la gráfica. Son datos del equipo, públicos para todos. */
export function VentasPorBarbero({ filas, yo }: { filas: FilaBarbero[]; yo: string }) {
  if (!filas.length) return <p className="muted">Todavía no hay barberos dados de alta.</p>;
  const max = Math.max(1, ...filas.map((f) => f.monto));
  return (
    <div className="vpb">
      {filas.map((f) => (
        <div key={f.id} className={`vpb-f ${f.id === yo ? "yo" : ""}`}>
          <Avatar avatar={f.avatar} nombre={f.nombre} t={34} />
          <span className="vpb-n"><b>{f.nombre.split(" ")[0]}{f.id === yo ? " (tú)" : ""}</b><small className="muted">{f.servicios ? `${f.servicios} ${f.servicios === 1 ? "servicio" : "servicios"}` : "Sin servicios"}</small></span>
          <span className="vpb-b"><i style={{ width: `${(f.monto / max) * 100}%` }} /></span>
          <b className="num">{formatoDinero(f.monto)}</b>
        </div>
      ))}
    </div>
  );
}
