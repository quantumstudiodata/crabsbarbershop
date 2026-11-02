"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";

export type FilaHistorial = {
  id: number; cuando: string; dia: string; diaTitulo: string; hora: string; exacto: string; nombre: string; usuario: string; avatar: string; categoria: string;
  titulo: string; objeto?: string; extra?: string; accion: string; antes?: string; ahora?: string; motivo?: string; folio?: string;
};

export function Lista({ filas }: { filas: FilaHistorial[] }) {
  const [abierta, setAbierta] = useState<FilaHistorial | null>(null);
  if (filas.length === 0) return <p className="muted" style={{ padding: 16 }}>No hay eventos con esos filtros.</p>;
  return (
    <>
      <div className="glass historial">
        <div className="hist-scroll">
          {[...new Set(filas.map((f) => f.dia))].map((d) => {
            const delDia = filas.filter((f) => f.dia === d);
            return (
              <div key={d}>
                <div className="hist-dia"><span>{delDia[0].diaTitulo}</span><span className="muted" style={{ fontWeight: 500 }}>{delDia.length} {delDia.length === 1 ? "movimiento" : "movimientos"}</span></div>
                {delDia.map((f) => (
                  <div key={f.id} className={`hist-fila c-${f.categoria}`}>
                    <button type="button" className="hist-linea evento-l" onClick={() => setAbierta(f)}>
                      <span className="t">{f.hora}</span>
                      <span className="quien-h"><Avatar avatar={f.avatar} nombre={f.nombre} t={24} />{f.nombre.split(" ")[0]}</span>
                      <span className="srv">{f.titulo}{f.extra && <small>{f.extra}</small>}</span>
                      {f.objeto ? <span className="folio">{f.objeto}</span> : <span />}
                      <Icono n="derecha" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
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
