"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icono } from "@/components/Icono";
import { PalomitaAnimada } from "@/components/PalomitaAnimada";
import { Modal } from "@/components/ui";
import { formatoDinero } from "@/lib/money";
import { cancelarCobroQr, cobrosQrEnEspera, estadoCobroQr, type CobroQrAbierto, type CobroQrHoy, type EstadoQr } from "./actions";

const VIGENCIA_MS = 30 * 60000;
const reloj = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Cuenta regresiva de la vigencia del enlace, con una barra que se vacía. */
function Vigencia({ vence }: { vence: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const resta = Math.max(0, vence - ahora);
  return (
    <span className="cqr-vig" role="timer" aria-label={`El enlace vence en ${Math.ceil(resta / 60000)} minutos`}>
      <span className="cqr-vig-t"><Icono n="reloj" />Enlace vigente<b>{reloj(resta)}</b></span>
      <span className="cqr-vig-b"><i style={{ transform: `scaleX(${Math.min(1, resta / VIGENCIA_MS)})` }} /></span>
    </span>
  );
}

/**
 * Cobro con QR: el cliente escanea y paga en su teléfono. La venta se registra sola cuando Stripe confirma el pago.
 * Cerrar la ventana no cancela el cobro: el enlace vale 30 minutos y el cobro se sigue desde el botón QR de Cobro.
 */
export function CobroQR({ cobro, detalle, listo, cerrar, cancelado }: {
  cobro: CobroQrAbierto; detalle: string;
  listo: (r: { folio: string; total: number }) => void; cerrar: () => void; cancelado: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [estado, setEstado] = useState<EstadoQr>({ estado: "pendiente" });
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  const id = useId();
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    QRCode.toString(cobro.url, { type: "svg", margin: 1, color: { dark: "#13171c", light: "#ffffff" } }).then(setSvg).catch(() => setSvg(""));
  }, [cobro.url]);
  useEffect(() => {
    if (estado.estado !== "pendiente" && !(estado.estado === "pagado" && !estado.folio)) return;
    const consultar = async () => { const r = await estadoCobroQr(cobro.id).catch(() => null); if (r) setEstado(r); };
    consultar();
    const t = setInterval(consultar, 2500);
    return () => clearInterval(t);
  }, [cobro.id, estado.estado, estado.folio]);
  const pagado = estado.estado === "pagado" && !!estado.folio;
  const terminado = estado.estado === "cancelado" || estado.estado === "reembolsado";
  const salir = () => { if (pagado) listo({ folio: estado.folio!, total: estado.total ?? cobro.total }); else if (terminado) cancelado(); else cerrar(); };
  const cancelar = async () => {
    const r = await cancelarCobroQr(cobro.id);
    if (r.error) { setAviso(r.error); return; }
    cancelado();
  };
  const copiar = () => navigator.clipboard?.writeText(cobro.url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); });
  if (!montado) return null;
  return createPortal(
    <div className="capa">
      <div className="modal cqr" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-h">
          <div><span className="lab">Cobro con QR</span><h2 className="titulo" id={id}>{pagado ? "Pago recibido" : terminado ? "Cobro sin pagar" : "Escanea para pagar"}</h2></div>
          <button type="button" className="icb cerrar-x" onClick={salir} aria-label="Cerrar"><Icono n="cerrar" /></button>
        </div>
        <div className="modal-c">
          {pagado ? (
            <div className="cqr-ok" role="status">
              <PalomitaAnimada />
              <b className="big">{formatoDinero(estado.total ?? cobro.total)}</b>
              <span>{detalle}<br />Folio {estado.folio}</span>
              <span className="vs-caja cqr-vs">
                <span className="vs-tit"><Icono n="candado" /><b>Verificado por Stripe</b></span>
                <span className="vs-grid">
                  {estado.confirmado && <span><small>Confirmado a las</small>{estado.confirmado}</span>}
                  {estado.tarjeta && <span><small>Tarjeta</small>{estado.tarjeta}</span>}
                  <span><small>Cobrado</small>{formatoDinero(estado.total ?? cobro.total)}</span>
                  {(estado.propina ?? 0) > 0 && <span><small>Propina incluida</small>{formatoDinero(estado.propina!)}</span>}
                  {estado.referencia && <span className="vs-ref"><small>Referencia</small><code>{estado.referencia}</code></span>}
                </span>
              </span>
              <button type="button" className="bt cqr-nuevo" onClick={() => listo({ folio: estado.folio!, total: estado.total ?? cobro.total })}><Icono n="mas" />Nuevo cobro</button>
            </div>
          ) : terminado ? (
            <div className="cqr-c">
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est fin">{estado.estado === "reembolsado" ? "El pago se devolvió al cliente" : "El enlace se canceló o venció sin pago"}</span>
              <small className="cqr-nota">No se registró ninguna venta. Si el cliente desea pagar, genera un cobro nuevo.</small>
            </div>
          ) : (
            <div className="cqr-c">
              <span className="cqr-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est espera" aria-live="polite"><i />{estado.estado === "pagado" ? "Pago recibido, registrando la venta" : "Esperando el pago del cliente"}</span>
              <Vigencia vence={cobro.vence} />
              <small className="cqr-nota">Puedes cerrar esta ventana sin cancelar el cobro. Su estado se consulta en el botón QR de Cobro y la confirmación aparecerá en cuanto Stripe valide el pago.</small>
              {aviso && <p className="aviso error" style={{ margin: 0 }}>{aviso}</p>}
              <div className="cqr-acc">
                <button type="button" className="ac-link" onClick={copiar}><Icono n={copiado ? "palomita" : "copiar"} />{copiado ? "Enlace copiado" : "Copiar enlace"}</button>
                <a className="ac-link" href={`https://wa.me/?text=${encodeURIComponent(`Paga tu servicio aquí: ${cobro.url}`)}`} target="_blank" rel="noopener noreferrer"><Icono n="enviar" />Enviar por WhatsApp</a>
              </div>
              <button type="button" className="ac-link cqr-cancelar" onClick={cancelar}>Cancelar este cobro</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ESTADO_HOY: Record<string, string> = { pagado: "Pagado", cancelado: "Sin pago", reembolsado: "Devuelto" };

/**
 * Botón QR junto al buscador de Cobro: muestra cuántos cobros con QR esperan pago y abre la lista de hoy
 * (en espera, pagados y sin pago). Cuando Stripe confirma uno, abre el aviso de pago recibido.
 */
export function CobrosQr({ nuevo, abrir }: { nuevo: CobroQrAbierto | null; abrir: (c: CobroQrAbierto) => void }) {
  const [lista, setLista] = useState<CobroQrAbierto[]>([]);
  const [hoy, setHoy] = useState<CobroQrHoy[]>([]);
  const [panel, setPanel] = useState(false);
  const seguidos = useRef<Map<string, CobroQrAbierto>>(new Map());
  const [, tic] = useState(0);
  useEffect(() => {
    if (nuevo) { seguidos.current.set(nuevo.id, nuevo); setLista((xs) => (xs.some((x) => x.id === nuevo.id) ? xs : [...xs, nuevo])); }
  }, [nuevo]);
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      const r = await cobrosQrEnEspera([...seguidos.current.keys()]).catch(() => null);
      if (!r || !vivo) return;
      for (const p of r.pendientes) seguidos.current.set(p.id, p);
      setLista(r.pendientes);
      setHoy(r.hoy);
      for (const x of r.resueltos) {
        const c = seguidos.current.get(x.id);
        seguidos.current.delete(x.id);
        if (x.estado === "pagado" && c) { setPanel(false); abrir(c); }
      }
      tic((n) => n + 1);
    };
    consultar();
    const t = setInterval(consultar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [abrir]);
  if (!lista.length && !hoy.length) return null;
  const ver = (c: CobroQrAbierto) => { setPanel(false); abrir(c); };
  return (
    <>
      <button type="button" className={`cqr-boton ${lista.length ? "con" : ""}`} onClick={() => setPanel(true)}
        aria-label={lista.length ? `${lista.length} cobros con QR en espera` : "Cobros con QR de hoy"}>
        <Icono n="cuadros" /><span>QR</span>{lista.length > 0 && <b>{lista.length}</b>}
      </button>
      <Modal abierto={panel} cerrar={() => setPanel(false)} etiqueta="Cobros con QR" titulo="Hoy">
        <div className="cqr-panel">
          {lista.length > 0 && <span className="lab">En espera de pago</span>}
          {lista.map((c) => (
            <button type="button" key={c.id} className="cqr-fila" onClick={() => ver(c)}>
              <span className="cqr-pulso" aria-hidden="true" />
              <span className="cqr-fila-t"><b>{formatoDinero(c.total)}</b><small>{c.detalle || "Cobro con QR"}</small></span>
              <span className="cqr-vence">{reloj(c.vence - Date.now())}</span>
              <Icono n="derecha" />
            </button>
          ))}
          {hoy.length > 0 && <span className="lab">Resueltos hoy</span>}
          {hoy.map((c) => (
            <div key={c.id} className={`cqr-fila hecho ${c.estado}`}>
              <span className="cqr-fila-t"><b>{formatoDinero(c.total)}</b><small>{c.hora}{c.detalle ? `, ${c.detalle}` : ""}</small></span>
              <span className="cqr-hoy-est">{c.estado === "pagado" && <Icono n="palomita" />}{ESTADO_HOY[c.estado] ?? c.estado}{c.folio ? <small>{c.folio}</small> : null}</span>
            </div>
          ))}
          {!lista.length && !hoy.length && <p className="muted">Hoy no hay cobros con QR.</p>}
        </div>
      </Modal>
    </>
  );
}
