"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { cancelarCobroQr, cobrosQrEnEspera, estadoCobroQr, type CobroQrAbierto, type EstadoQr } from "./actions";

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const faltan = (ms: number) => Math.max(0, Math.ceil((ms - Date.now()) / 60000));

/**
 * Cobro con QR: el cliente escanea y paga en su teléfono. La venta se registra sola cuando Stripe confirma el pago.
 * Cerrar la ventana no cancela el cobro: el enlace vale 30 minutos y el cobro queda en espera en la pantalla de Cobro.
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
  const [, tic] = useState(0);
  const id = useId();
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    QRCode.toString(cobro.url, { type: "svg", margin: 1, color: { dark: "#13171c", light: "#ffffff" } }).then(setSvg).catch(() => setSvg(""));
  }, [cobro.url]);
  useEffect(() => {
    if (estado.estado !== "pendiente" && !(estado.estado === "pagado" && !estado.folio)) return;
    const consultar = async () => { const r = await estadoCobroQr(cobro.id).catch(() => null); if (r) setEstado(r); tic((x) => x + 1); };
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
              <span className="cqr-pal"><Icono n="palomita" /></span>
              <b className="big">{formatoDinero(estado.total ?? cobro.total)}</b>
              <span>{detalle}<br />Folio {estado.folio}</span>
              <span className="vs-caja cqr-vs">
                <span className="vs-tit"><Icono n="candado" /><b>Verificado por Stripe</b></span>
                <span className="vs-grid">
                  {estado.confirmado && <span><small>Confirmado a las</small>{estado.confirmado}</span>}
                  {estado.tarjeta && <span><small>Tarjeta</small>{estado.tarjeta}</span>}
                  <span><small>Cobrado</small>{formatoDinero(estado.total ?? cobro.total)}</span>
                  {(estado.propina ?? 0) > 0 && <span><small>Propina incluida</small>{formatoDinero(estado.propina!)}</span>}
                  {estado.referencia && <span className="vs-ref"><small>Referencia de Stripe</small><code>{estado.referencia}</code></span>}
                </span>
                <small className="muted">La venta ya está registrada. Stripe confirmó el pago, no el teléfono del cliente.</small>
              </span>
              <button type="button" className="bt grande" onClick={() => listo({ folio: estado.folio!, total: estado.total ?? cobro.total })}>Nuevo cobro</button>
            </div>
          ) : terminado ? (
            <div className="cqr-c">
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est"><i />{estado.estado === "reembolsado" ? "El pago se devolvió al cliente" : "El enlace se canceló o venció sin pago"}</span>
              <small className="cqr-nota">No se registró ninguna venta. Si el cliente todavía quiere pagar, haz un cobro nuevo.</small>
            </div>
          ) : (
            <div className="cqr-c">
              <span className="cqr-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est" aria-live="polite"><i />{estado.estado === "pagado" ? "Pago recibido, registrando la venta…" : "Esperando el pago del cliente"}</span>
              <small className="cqr-nota">Puedes cerrar esta ventana: el cobro sigue activo hasta las {hora(cobro.vence)} ({faltan(cobro.vence)} min) y te avisamos en Cobro cuando Stripe confirme el pago.</small>
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

/**
 * Cobros con QR que siguen esperando el pago. Se actualiza sola; cuando Stripe confirma uno, abre el aviso de pago recibido.
 * `nuevo` agrega a la lista el cobro que se acaba de dejar en espera al cerrar la ventana.
 */
export function CobrosEnEspera({ nuevo, abrir }: { nuevo: CobroQrAbierto | null; abrir: (c: CobroQrAbierto) => void }) {
  const [lista, setLista] = useState<CobroQrAbierto[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
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
      for (const x of r.resueltos) {
        const c = seguidos.current.get(x.id);
        seguidos.current.delete(x.id);
        if (x.estado === "pagado" && c) abrir(c);
        else if (x.estado === "cancelado" && c) setAviso(`El cobro de ${formatoDinero(c.total)} venció sin pago.`);
      }
      tic((n) => n + 1);
    };
    consultar();
    const t = setInterval(consultar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [abrir]);
  if (!lista.length && !aviso) return null;
  return (
    <section className="glass cqr-espera" aria-label="Cobros con QR en espera">
      {lista.length > 0 && <span className="lab">Cobros con QR en espera</span>}
      {lista.map((c) => (
        <button type="button" key={c.id} className="cqr-fila" onClick={() => abrir(c)}>
          <span className="cqr-pulso" aria-hidden="true" />
          <span className="cqr-fila-t"><b>{formatoDinero(c.total)}</b><small>{c.detalle || "Cobro con QR"}</small></span>
          <span className="cqr-vence">{faltan(c.vence)} min</span>
          <Icono n="derecha" />
        </button>
      ))}
      {aviso && <p className="muted cqr-venc" role="status">{aviso} <button type="button" className="ac-link" onClick={() => setAviso(null)}>Entendido</button></p>}
    </section>
  );
}
