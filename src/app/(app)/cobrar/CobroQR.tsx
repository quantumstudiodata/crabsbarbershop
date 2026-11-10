"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icono } from "@/components/Icono";
import { formatoDinero } from "@/lib/money";
import { cancelarCobroQr, estadoCobroQr } from "./actions";

/**
 * Cobro con QR: el cliente escanea y paga en su teléfono. La ventana consulta el estado cada pocos segundos;
 * la venta se registra sola cuando Stripe confirma el pago. Solo se cierra con la X (y así se cancela si no se ha pagado).
 */
export function CobroQR({ cobro, detalle, listo, cerrar }: {
  cobro: { id: string; url: string; total: number }; detalle: string;
  listo: (r: { folio: string; total: number }) => void; cerrar: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [estado, setEstado] = useState<{ estado: string; folio?: string; total?: number; tarjeta?: string; propina?: number }>({ estado: "pendiente" });
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
    const t = setInterval(async () => { const r = await estadoCobroQr(cobro.id).catch(() => null); if (r) setEstado(r); }, 2500);
    return () => clearInterval(t);
  }, [cobro.id, estado.estado, estado.folio]);
  const pagado = estado.estado === "pagado" && !!estado.folio;
  const salir = async () => {
    if (pagado) { listo({ folio: estado.folio!, total: estado.total ?? cobro.total }); return; }
    const r = await cancelarCobroQr(cobro.id);
    if (r.error) { setAviso(r.error); return; }
    cerrar();
  };
  const copiar = () => navigator.clipboard?.writeText(cobro.url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); });
  if (!montado) return null;
  return createPortal(
    <div className="capa">
      <div className="modal cqr" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-h">
          <div><span className="lab">Cobro con QR</span><h2 className="titulo" id={id}>{pagado ? "Pago recibido" : "Escanea para pagar"}</h2></div>
          <button type="button" className="icb cerrar-x" onClick={salir} aria-label={pagado ? "Cerrar" : "Cancelar el cobro con QR"}><Icono n="cerrar" /></button>
        </div>
        <div className="modal-c">
          {pagado ? (
            <div className="cqr-ok" role="status">
              <span className="cqr-pal"><Icono n="palomita" /></span>
              <b className="big">{formatoDinero(estado.total ?? cobro.total)}</b>
              <span>{detalle}{estado.tarjeta ? `, ${estado.tarjeta}` : ""}<br />Folio {estado.folio}</span>
              {(estado.propina ?? 0) > 0 && <small>Incluye {formatoDinero(estado.propina!)} de propina</small>}
              <button type="button" className="bt grande" onClick={() => listo({ folio: estado.folio!, total: estado.total ?? cobro.total })}>Nuevo cobro</button>
            </div>
          ) : (
            <div className="cqr-c">
              <span className="cqr-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est" aria-live="polite"><i />{estado.estado === "pagado" ? "Pago recibido, registrando la venta…" : estado.estado === "cancelado" ? "Este cobro se canceló" : "Esperando el pago del cliente"}</span>
              <small className="cqr-nota">La venta se registra sola cuando Stripe confirma el pago. El cliente puede agregar propina desde su teléfono.</small>
              {aviso && <p className="aviso error" style={{ margin: 0 }}>{aviso}</p>}
              <div className="cqr-acc">
                <button type="button" className="ac-link" onClick={copiar}><Icono n={copiado ? "palomita" : "copiar"} />{copiado ? "Enlace copiado" : "Copiar enlace"}</button>
                <a className="ac-link" href={`https://wa.me/?text=${encodeURIComponent(`Paga tu servicio aquí: ${cobro.url}`)}`} target="_blank" rel="noopener noreferrer"><Icono n="enviar" />Enviar por WhatsApp</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
