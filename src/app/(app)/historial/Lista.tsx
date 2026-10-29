"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";

export type FilaHistorial = {
  id: number; cuando: string; exacto: string; nombre: string; usuario: string; avatar: string; categoria: string;
  titulo: string; objeto?: string; extra?: string; accion: string; antes?: string; ahora?: string; motivo?: string; folio?: string;
};

export function Lista({ filas }: { filas: FilaHistorial[] }) {
  const [abierta, setAbierta] = useState<FilaHistorial | null>(null);
  if (filas.length === 0) return <p className="muted" style={{ padding: 16 }}>No hay eventos con esos filtros.</p>;
  return (
    <>
      <div className="glass tabla-h">
        <div className="th-h"><span>#</span><span>Fecha</span><span>Quién</span><span>Qué pasó</span></div>
        {filas.map((f) => (
          <button type="button" key={f.id} className={`fila-h c-${f.categoria}`} onClick={() => setAbierta(f)}>
            <span className="num-h">{f.id}</span>
            <span className="cuando">{f.cuando}</span>
            <span className="quien-h"><Avatar avatar={f.avatar} nombre={f.nombre} t={24} />{f.nombre.split(" ")[0]}</span>
            <span className="que">
              <b>{f.titulo}</b>
              {f.objeto && <span className="chip-h">{f.objeto}</span>}
              {f.extra && <span className="muted">{f.extra}</span>}
            </span>
          </button>
        ))}
      </div>
      {abierta && (
        <Modal abierto cerrar={() => setAbierta(null)} etiqueta={`Evento #${abierta.id}`} titulo={abierta.titulo}>
          <div className="det-h">
            <span><small>Quién</small><span className="persona"><Avatar avatar={abierta.avatar} nombre={abierta.nombre} t={26} />{abierta.nombre} <span className="muted" style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{abierta.usuario}</span></span></span>
            <span><small>Cuándo</small>{abierta.exacto}</span>
            {abierta.objeto && <span><small>Sobre</small>{abierta.objeto}</span>}
            <span><small>Registro</small>{abierta.accion}</span>
            {abierta.motivo && <span><small>Motivo</small>{abierta.motivo}</span>}
          </div>
          {(abierta.antes || abierta.ahora) && (
            <div className="cambio-h">
              <div><small>Antes</small><span>{abierta.antes || "Sin dato"}</span></div>
              <Icono n="derecha" />
              <div className="nuevo"><small>Después</small><span>{abierta.ahora || "Sin dato"}</span></div>
            </div>
          )}
          {abierta.folio && <Link className="bt sec solo chico" href={`/historial?q=${abierta.folio}`} onClick={() => setAbierta(null)}><Icono n="historial" />Ver todo lo que pasó con {abierta.folio}</Link>}
        </Modal>
      )}
    </>
  );
}
