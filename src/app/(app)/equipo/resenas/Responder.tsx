"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { responderResena } from "../actions";

/** Responder una reseña o leer la respuesta que ya se dio. */
export function Responder({ id, cliente, comentario, respuesta, puede }: { id: string; cliente: string; comentario: string; respuesta: string | null; puede: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!respuesta && !puede) return null;
  return (
    <>
      <button type="button" className="eq-accion" onClick={() => setAbierto(true)}><Icono n={respuesta ? "ojo" : "enviar"} />{respuesta ? "Ver respuesta" : "Responder"}</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta={cliente || "Cliente"} titulo={respuesta ? "Respuesta" : "Responder reseña"}>
        <div className="pila">
          {comentario && <p className="eq-cita">{comentario}</p>}
          {respuesta ? <p>{respuesta}</p> : (
            <form action={responderResena} className="pila">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="regreso" value="/equipo/resenas" />
              <label className="campo"><span>Tu respuesta</span><textarea className="input" name="respuesta" rows={4} maxLength={600} required placeholder="Escribe una respuesta amable" /></label>
              <div className="acciones"><button className="bt">Enviar respuesta<Fl /></button></div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}
