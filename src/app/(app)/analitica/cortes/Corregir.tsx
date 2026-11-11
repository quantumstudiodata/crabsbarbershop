"use client";

import { useState } from "react";
import { Fl, Icono } from "@/components/Icono";
import { Modal } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { corregirCierre } from "../../caja/actions";

const estado = (d: number) => (d === 0 ? "Cuadró" : `${d < 0 ? "Faltaron" : "Sobraron"} ${formatoDinero(Math.abs(d))}`);

/** Ajuste posterior a un corte. Se puede abrir con su propio botón o desde fuera (por ejemplo, desde el comprobante). */
export function Corregir({ id, dia, folio, diferencia, abierto: controlado, cerrar: cerrarFuera }: { id: string; dia: string; folio?: string; diferencia?: number; abierto?: boolean; cerrar?: () => void }) {
  const [propio, setPropio] = useState(false);
  const [signo, setSigno] = useState<"mas" | "menos">("mas");
  const [monto, setMonto] = useState("");
  const abierto = controlado ?? propio;
  const cerrar = cerrarFuera ?? (() => setPropio(false));
  const centavos = Math.round((Number(monto.replace(/[^\d.]/g, "")) || 0) * 100);
  const nueva = diferencia === undefined ? null : diferencia + (signo === "mas" ? centavos : -centavos);
  return (
    <>
      {controlado === undefined && <button type="button" className="enlace" onClick={() => setPropio(true)} aria-label={`Registrar un ajuste al corte del ${dia}`}>Registrar ajuste</button>}
      <Modal abierto={abierto} cerrar={cerrar} etiqueta={folio ? `Corte ${folio}, ${dia}` : `Corte del ${dia}`} titulo="Registrar ajuste">
        <form action={corregirCierre} className="pila aj-f">
          <input type="hidden" name="turnoId" value={id} />
          <input type="hidden" name="signo" value={signo} />
          <div className="aj-ops" role="radiogroup" aria-label="Qué pasó después del corte">
            {([["mas", "entrada", "Apareció dinero", "Sobró después de cerrar"], ["menos", "salida", "Faltó dinero", "Se descubrió un faltante"]] as const).map(([v, ic, t, d]) => (
              <button key={v} type="button" role="radio" aria-checked={signo === v} className={`aj-op ${signo === v ? "on" : ""}`} onClick={() => setSigno(v)}>
                <span className="aj-ic"><Icono n={ic} /></span><b>{t}</b><small>{d}</small>
              </button>
            ))}
          </div>
          <label className="campo"><span>Monto</span><input className="input grande" name="monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="$0" required /></label>
          <label className="campo"><span>Motivo</span><input className="input" name="motivo" maxLength={300} placeholder="Ejemplo: se encontró un billete en el cajón" required /></label>
          {nueva !== null && diferencia !== undefined && (
            <div className="aj-res">
              <span>Diferencia del corte</span>
              <span className="aj-cambio"><s>{estado(diferencia)}</s><Icono n="derecha" /><b>{estado(nueva)}</b></span>
            </div>
          )}
          <small className="muted">El corte original no cambia: el ajuste se guarda aparte, con tu nombre y el motivo.</small>
          <div className="acciones">
            <button className="bt" disabled={!centavos}>Guardar ajuste<Fl /></button>
          </div>
        </form>
      </Modal>
    </>
  );
}
