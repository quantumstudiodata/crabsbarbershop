import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { ventasEntre } from "@/lib/datos";
import { rendimiento } from "@/lib/equipo";
import { formatoDinero } from "@/lib/money";
import { MesEquipo, PestanasEquipo } from "./Partes";
import { mesElegido, personasEquipo, sesionEquipo } from "./datos";

export const metadata = { title: "Equipo" };

export default async function Equipo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const se = await sesionEquipo();
  const m = mesElegido(await searchParams, se.barberia.zonaHoraria);
  const [personas, { ventas }] = await Promise.all([
    personasEquipo(se.barberia.id),
    ventasEntre(se.barberia.id, m.desde, m.hasta, { zona: se.barberia.zonaHoraria }),
  ]);
  const total = rendimiento(ventas);
  const filas = personas.map((p) => ({ ...p, r: rendimiento(ventas, p.id) }));
  const activas = filas.filter((p) => p.activo).sort((a, b) => b.r.vendido - a.r.vendido);
  const archivadas = filas.filter((p) => !p.activo);
  const sinActividad = activas.filter((p) => !p.r.servicios).length;
  const q = m.mes === m.hoy.slice(0, 7) ? "" : `?mes=${m.mes}`;

  return (
    <div className="eq">
      <PestanasEquipo pagos={se.puede("equipo.pagar")} />
      <div className="eq-lado">
        <aside className="eq-res">
          <div className="eq-tit"><span>Rendimiento mensual del equipo</span><MesEquipo mes={m.mes} hoy={m.hoy} /></div>
          <div className="eq-cifras">
            <div className="pri"><b>{formatoDinero(total.vendido)}</b><small>Ventas atribuidas</small></div>
            <div><b>{total.servicios}</b><small>Servicios realizados</small></div>
            <div className="solo-esc"><b>{formatoDinero(total.ticket)}</b><small>Ticket promedio</small></div>
          </div>
        </aside>
        <div className="eq-lista">
          <div className="eq-h"><b>Equipo</b><small>{activas.length} {activas.length === 1 ? "activa" : "activas"}{sinActividad ? `, ${sinActividad} sin actividad` : ""}</small></div>
          <div className="glass eq-card">
            {activas.length ? activas.map((p) => (
              <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq-fila">
                <Avatar avatar={p.avatar} nombre={p.nombre} t={34} />
                <span className="eq-m"><b>{p.nombre}</b><small><i className={`eq-dot ${p.r.servicios ? "on" : ""}`} />{p.r.servicios ? `Activa, ${p.r.servicios} ${p.r.servicios === 1 ? "servicio" : "servicios"}` : "Sin actividad este mes"}</small></span>
                <b className="eq-monto">{formatoDinero(p.r.vendido)}</b>
              </Link>
            )) : <p className="muted eq-vacio">Todavía no hay personas que atiendan.</p>}
          </div>
          {archivadas.length > 0 && (
            <details className="eq-sec">
              <summary><Icono n="historial" />Archivados ({archivadas.length})<Icono n="abajo" /></summary>
              <div className="glass eq-card">
                {archivadas.map((p) => (
                  <Link key={p.id} href={`/equipo/${p.id}${q}`} className="eq-fila">
                    <Avatar avatar={p.avatar} nombre={p.nombre} t={34} />
                    <span className="eq-m"><b>{p.nombre}</b><small>Archivada</small></span>
                    <b className="eq-monto">{formatoDinero(p.r.vendido)}</b>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
