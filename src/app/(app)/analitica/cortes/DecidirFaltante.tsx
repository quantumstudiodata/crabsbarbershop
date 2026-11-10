"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Fl } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { repartir } from "@/lib/reparto";
import { formatoDinero, leerPesos } from "@/lib/money";
import { asignarFaltante, type ReglaFaltante } from "../../caja/faltantes";
import type { Corte } from "./HistorialCortes";

const primer = (n: string) => n.split(" ")[0];

/** La encargada elige quién cubre el faltante de un corte. Lo asignado queda en revisión hasta que se autorice. */
export function DecidirFaltante({ c, cerrar }: { c: Corte; cerrar: () => void }) {
  const faltante = -c.diferencia;
  const cobradores = c.cobradores ?? [];
  const equipo = c.equipo ?? [];
  const [regla, setRegla] = useState<ReglaFaltante>(cobradores.length > 1 ? "iguales" : "abrio");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const conEfectivo = cobradores.filter((x) => x.efectivo > 0);
  const iguales = repartir(faltante, cobradores.map(() => 1));
  const prop = repartir(faltante, conEfectivo.map((x) => x.efectivo));
  const sumaManual = Object.values(manual).reduce((a, t) => a + (leerPesos(t) ?? 0), 0);
  const quienes = (xs: { nombre: string; avatar: string }[], montos: number[]) => (
    <span className="reparto-f">{xs.map((x, i) => <span key={x.nombre}><Avatar avatar={x.avatar} nombre={x.nombre} t={18} />{primer(x.nombre)} <b>{formatoDinero(montos[i])}</b></span>)}</span>
  );
  const opciones: { k: ReglaFaltante; t: string; d: React.ReactNode; ok: boolean }[] = [
    { k: "abrio", t: "Quien abrió la caja", d: quienes([c.abrio], [faltante]), ok: true },
    { k: "iguales", t: "Partes iguales entre quienes cobraron", d: cobradores.length ? quienes(cobradores, iguales) : <small>Nadie cobró en este turno.</small>, ok: cobradores.length > 0 },
    { k: "proporcional", t: "Según el efectivo que cobró cada quien", d: conEfectivo.length ? quienes(conEfectivo, prop) : <small>Nadie cobró en efectivo.</small>, ok: conEfectivo.length > 0 },
    { k: "manual", t: "Repartir a mano", d: <small>Escribe cuánto cubre cada persona.</small>, ok: true },
    { k: "negocio", t: "El negocio lo absorbe", d: <small>No se descuenta a nadie.</small>, ok: true },
  ];
  const guardar = () => iniciar(async () => {
    const r = await asignarFaltante({ turnoId: c.id, regla, manual: regla === "manual" ? manual : undefined });
    if (r.error) setError(r.error); else cerrar();
  });
  return (
    <Modal abierto cerrar={cerrar} etiqueta={`Corte ${c.folio}, ${c.fechaCorta}`} titulo={`Faltaron ${formatoDinero(faltante)}`}>
      <div className="pila" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Elige quién cubre el faltante. Queda en revisión y solo se descuenta si se autoriza en Equipo, Pagos.</p>
        <div className="tipos-p" role="radiogroup" aria-label="Quién cubre el faltante">
          {opciones.map((o) => (
            <button type="button" key={o.k} role="radio" aria-checked={regla === o.k} disabled={!o.ok} className={`tipo-p ${regla === o.k ? "on" : ""}`} onClick={() => { setRegla(o.k); setError(null); }}>
              <i className="radio-p" aria-hidden="true" /><span><b>{o.t}</b>{o.d}</span>
            </button>
          ))}
        </div>
        {regla === "manual" && (
          <div className="lista-sw manual-f">
            {equipo.map((e) => (
              <label key={e.id}><span className="persona"><Avatar avatar={e.avatar} nombre={e.nombre} t={22} />{primer(e.nombre)}</span>
                <input className="input" inputMode="decimal" placeholder="$0" value={manual[e.id] ?? ""} onChange={(x) => setManual({ ...manual, [e.id]: x.target.value })} aria-label={`Cuánto cubre ${primer(e.nombre)}`} /></label>
            ))}
            <div className={`suma-f ${sumaManual === faltante ? "ok" : ""}`}><span>Asignado</span><b>{formatoDinero(sumaManual)} de {formatoDinero(faltante)}</b></div>
          </div>
        )}
        {error && <p className="aviso error" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones"><button type="button" className="bt" disabled={pendiente} onClick={guardar}>{pendiente ? "Guardando…" : "Confirmar"}<Fl /></button></div>
      </div>
    </Modal>
  );
}
