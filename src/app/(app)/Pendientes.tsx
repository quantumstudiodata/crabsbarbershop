"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "@/components/Icono";
import { cambiarEstadoCita, comprobantePorWhatsApp, confirmarTransferencia, verComprobante } from "./citas/actions";
import { Modal } from "@/components/ui";
import type { Pendiente } from "./pendientes";

const ICONO = { llegar: "reloj", cobrar: "efectivo", pago: "palomita", transferencia: "cobro", recordar: "enviar" } as const;

/** Pendientes por registrar en Inicio: máximo tres a la vista, el resto en la agenda. Solo aparece si hay algo. */
export function Pendientes({ items, className = "" }: { items: Pendiente[]; className?: string }) {
  const [hechos, setHechos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();
  const [revisar, setRevisar] = useState<{ x: Pendiente; datos?: string; error?: string } | null>(null);
  const [recordar, setRecordar] = useState<Pendiente | null>(null);
  const [enviados, setEnviados] = useState<string[]>([]);
  const recibida = (x: Pendiente) => iniciar(async () => { const r = await confirmarTransferencia(x.citaId); if (r.error) setError(r.error); else { setError(null); setRevisar(null); setHechos((h) => [...h, x.id]); router.refresh(); } });
  const porWhats = (x: Pendiente) => iniciar(async () => { const r = await comprobantePorWhatsApp(x.citaId); if (r.error) setError(r.error); else { setError(null); router.refresh(); } });
  const abrir = (x: Pendiente) => { setRevisar({ x }); verComprobante(x.citaId).then((r) => setRevisar({ x, datos: r.datos, error: r.error })); };
  const router = useRouter();
  const xs = items.filter((x) => !hechos.includes(x.id));
  if (!xs.length) return null;
  // Si no llegó, se marca y se le escribe por WhatsApp con su enlace para elegir otro día.
  const noVino = (x: Pendiente) => {
    const d = (x.tel ?? "").replace(/\D/g, "");
    const url = x.enlace ? `${window.location.origin}${x.enlace}` : "";
    const msg = `Te esperábamos a las ${x.hora} y no pudimos verte. Elige otro día y hora para tu cita aquí: ${url}`;
    if (d) window.open(`https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(msg)}`, "_blank");
    estado(x, "no_asistio");
  };
  const llego = (x: Pendiente) => estado(x, "llego");
  const estado = (x: Pendiente, e: string) => iniciar(async () => {
    const r = await cambiarEstadoCita(x.citaId, e);
    if (r.error) setError(r.error); else { setError(null); setHechos((h) => [...h, x.id]); router.refresh(); }
  });
  return (
    <section className={`glass pnd ${className}`}>
      <div className="entre"><span className="lab">Pendientes por registrar</span><span className="pnd-n">{xs.length}</span></div>
      <div className="pnd-l">
        {[...xs.filter((x) => x.tipo !== "recordar").slice(0, 3), ...xs.filter((x) => x.tipo === "recordar")].map((x) => (
          <div key={x.id} className="pnd-f">
            <span className={`pnd-i ${x.tipo === "cobrar" ? "osc" : ""}`} aria-hidden="true"><Icono n={ICONO[x.tipo]} /></span>
            <span className="pnd-t"><b>{x.titulo}</b><small>{x.detalle}</small></span>
            {x.tipo === "recordar" ? <button type="button" className="pnd-b" onClick={() => setRecordar(x)}>Recordar</button>
              : x.tipo === "transferencia" ? (x.comprobante ? <button type="button" className="pnd-b" onClick={() => abrir(x)}>Revisar</button>
              : <span className="pnd-dos"><button type="button" className="pnd-b sec" disabled={pend} onClick={() => porWhats(x)} title="El cliente mandó su comprobante por WhatsApp">Por WhatsApp</button><button type="button" className="pnd-b" disabled={pend} onClick={() => recibida(x)}>Recibida</button></span>)
              : x.tipo === "llegar" ? <span className="pnd-dos"><button type="button" className="pnd-b sec" disabled={pend} onClick={() => noVino(x)}>No vino</button><button type="button" className="pnd-b" disabled={pend} onClick={() => llego(x)}>Llegó</button></span>
              : x.tipo === "cobrar" ? <Link className="pnd-b" href={`/cobrar?cita=${x.citaId}`}>Cobrar</Link>
              : <Link className="pnd-b sec" href={`/citas?vista=lista&dia=${x.dia}`}>Ver</Link>}
          </div>
        ))}
      </div>
      {error && <small className="aviso error" role="alert">{error}</small>}
      {xs.filter((x) => x.tipo !== "recordar").length > 3 && <Link className="ini-link" href="/citas?vista=lista">Ver todos ({xs.length})</Link>}
      {recordar && (
        <Modal abierto cerrar={() => setRecordar(null)} etiqueta="WhatsApp" titulo="Citas de mañana">
          <div className="pila">
            <p className="muted" style={{ margin: 0 }}>Toca cada cliente para mandarle su recordatorio. El mensaje ya lleva la hora y su enlace para cambiar la cita.</p>
            <div className="pnd-rec">
              {(recordar.lista ?? []).map((c) => {
                const d = c.tel.replace(/\D/g, "");
                const url = c.enlace ? `${window.location.origin}${c.enlace}` : "";
                const msg = `Te recordamos tu cita de mañana a las ${c.hora} con ${c.con}.${url ? ` Si necesitas cambiarla, aquí puedes hacerlo: ${url}` : ""}`;
                const hecho = enviados.includes(c.id);
                return (
                  <a key={c.id} className={`pnd-rec-f ${hecho ? "ok" : ""}`} href={d ? `https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(msg)}` : undefined} target="_blank" rel="noreferrer" onClick={() => setEnviados((e) => [...e, c.id])}>
                    <b>{c.hora}</b><span>{c.cliente}<small>con {c.con}</small></span><span className="pnd-rec-e">{hecho ? <><Icono n="palomita" />Enviado</> : <><Icono n="enviar" />Enviar</>}</span>
                  </a>
                );
              })}
            </div>
            <div className="acciones"><button type="button" className="bt" onClick={() => { setHechos((h) => [...h, recordar.id]); setRecordar(null); }}>Listo<Icono n="palomita" /></button></div>
          </div>
        </Modal>
      )}
      {revisar && (
        <Modal abierto cerrar={() => setRevisar(null)} etiqueta="Comprobante de transferencia" titulo="Comprobante de transferencia">
          <div className="pila">
            <p className="muted" style={{ margin: 0 }}>{revisar.x.detalle}. Revisa que el monto y el concepto coincidan.</p>
            {revisar.error ? <p className="aviso">Lo mandó por WhatsApp: revísalo en el chat del negocio y compáralo con tu banco.</p> : !revisar.datos ? <p className="muted">Cargando…</p>
              : revisar.datos.startsWith("data:application/pdf") ? <iframe className="pnd-pdf" src={revisar.datos} title="Comprobante" />
              /* eslint-disable-next-line @next/next/no-img-element */
              : <img className="pnd-img" src={revisar.datos} alt="Comprobante de transferencia" />}
            <div className="acciones"><button type="button" className="bt" disabled={pend || (!revisar.datos && !revisar.error)} onClick={() => recibida(revisar.x)}><Icono n="palomita" />Confirmar que llegó</button></div>
          </div>
        </Modal>
      )}
    </section>
  );
}
