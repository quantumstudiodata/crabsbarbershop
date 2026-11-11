"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icono } from "@/components/Icono";
import { PalomitaAnimada } from "@/components/PalomitaAnimada";
import { formatoDinero } from "@/lib/money";
import { cancelarCobroQr, cobrosQrEnEspera, estadoCobroQr, type CobroQrAbierto, type EstadoQr } from "./actions";

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
            </div>
          ) : (
            <div className="cqr-c">
              <span className="cqr-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <b className="big">{formatoDinero(cobro.total)}</b>
              <span className="muted">{detalle}</span>
              <span className="cqr-est espera" aria-live="polite"><i />{estado.estado === "pagado" ? "Pago recibido, registrando la venta" : "Esperando el pago del cliente"}</span>
              <Vigencia vence={cobro.vence} />
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

/** Mini QR de la tarjeta flotante. */
function MiniQr({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#13171c", light: "#ffffff" } }).then(setSvg).catch(() => setSvg("")); }, [url]);
  return <span className="tq-mini" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Anillo con la cuenta regresiva de la vigencia del enlace. */
function Anillo({ vence }: { vence: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const resta = Math.max(0, vence - ahora);
  const c = 2 * Math.PI * 20;
  return (
    <span className="tq-anillo" role="timer" aria-label={`Vence en ${Math.ceil(resta / 60000)} minutos`}>
      <svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="20" className="tq-pista" /><circle cx="23" cy="23" r="20" className="tq-avance" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, resta / VIGENCIA_MS))} /></svg>
      <span>{reloj(resta)}</span>
    </span>
  );
}

type Resuelto = { c: CobroQrAbierto; estado: string; total?: number; folio?: string };

/**
 * Tarjetas flotantes de los cobros con QR: mientras esperan pago muestran el QR pequeño y el tiempo que queda;
 * cuando Stripe verifica el pago cambian a "Pago verificado". Al tocarlas se abre el QR o la confirmación, y la tarjeta se quita.
 */
export function TarjetasQr({ nuevo, abrir, vistos }: { nuevo: CobroQrAbierto | null; abrir: (c: CobroQrAbierto) => void; vistos: string[] }) {
  const [lista, setLista] = useState<CobroQrAbierto[]>([]);
  const [hechos, setHechos] = useState<Resuelto[]>([]);
  const seguidos = useRef<Map<string, CobroQrAbierto>>(new Map());
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
      const nuevos: Resuelto[] = [];
      for (const x of r.resueltos) {
        const c = seguidos.current.get(x.id);
        seguidos.current.delete(x.id);
        if (c) nuevos.push({ c, estado: x.estado, total: x.total, folio: x.folio });
      }
      if (nuevos.length) setHechos((hs) => [...hs.filter((h) => !nuevos.some((n) => n.c.id === h.c.id)), ...nuevos]);
    };
    consultar();
    const t = setInterval(consultar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const quitar = (id: string) => setHechos((hs) => hs.filter((h) => h.c.id !== id));
  const pendientes = lista.filter((c) => !vistos.includes(c.id));
  const resueltos = hechos.filter((h) => !vistos.includes(h.c.id));
  if (!pendientes.length && !resueltos.length) return null;
  const pago = resueltos.find((h) => h.estado === "pagado");
  const otro = resueltos.find((h) => h.estado !== "pagado");
  const proximo = [...pendientes].sort((a, b) => a.vence - b.vence)[0];
  return (
    <>
    {/* Teléfono: una pestaña pegada a la barra de Cobrar. Primero avisa del pago verificado; si no, del cobro en espera. */}
    {pago ? (
      <button type="button" className="tq-tab ok" onClick={() => { quitar(pago.c.id); abrir(pago.c); }}>
        <span className="tq-tab-pal"><Icono n="palomita" /></span>
        <span className="tq-tab-t"><b>{formatoDinero(pago.total ?? pago.c.total)}</b> pago verificado</span>
        <span className="tq-tab-ver">Ver</span>
      </button>
    ) : otro ? (
      <button type="button" className="tq-tab fin" onClick={() => quitar(otro.c.id)}>
        <i />
        <span className="tq-tab-t"><b>{formatoDinero(otro.total ?? otro.c.total)}</b> {otro.estado === "reembolsado" ? "pago devuelto" : "venció sin pago"}</span>
        <span className="tq-tab-ver">Entendido</span>
      </button>
    ) : proximo ? (
      <button type="button" className="tq-tab" onClick={() => abrir(proximo)}>
        <i className="tq-punto" />
        <span className="tq-tab-t">{pendientes.length > 1 ? <><b>{pendientes.length}</b> cobros con QR en espera</> : <><b>{formatoDinero(proximo.total)}</b> con QR en espera</>}</span>
        <Restante vence={proximo.vence} />
        <span className="tq-tab-ver">Ver</span>
      </button>
    ) : null}
    <div className="tq-pila" aria-live="polite">
      {resueltos.map((h) => (
        <button type="button" key={h.c.id} className={`tq ${h.estado === "pagado" ? "ok" : "fin"}`}
          onClick={() => { quitar(h.c.id); if (h.estado === "pagado") abrir(h.c); }}>
          {h.estado === "pagado" ? <PalomitaAnimada t={46} /> : <span className="tq-x"><Icono n="cerrar" /></span>}
          <span className="tq-t">
            <span className="tq-lab">{h.estado === "pagado" ? "Pago verificado" : h.estado === "reembolsado" ? "Pago devuelto" : "Venció sin pago"}</span>
            <b>{formatoDinero(h.total ?? h.c.total)}</b>
            <small>{h.estado === "pagado" ? h.folio ? `Folio ${h.folio}, ver confirmación` : "Ver confirmación" : h.c.detalle || "Cobro con QR"}</small>
          </span>
          {h.estado === "pagado" && <Icono n="derecha" />}
        </button>
      ))}
      {pendientes.map((c) => (
        <button type="button" key={c.id} className="tq" onClick={() => abrir(c)} aria-label={`Ver el QR del cobro de ${formatoDinero(c.total)}`}>
          <MiniQr url={c.url} />
          <span className="tq-t">
            <span className="tq-lab"><i className="tq-punto" />Esperando pago</span>
            <b>{formatoDinero(c.total)}</b>
            <small>{c.detalle || "Cobro con QR"}</small>
          </span>
          <Anillo vence={c.vence} />
        </button>
      ))}
    </div>
    </>
  );
}

/** Minutos y segundos que le quedan al enlace, en vivo. */
function Restante({ vence }: { vence: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <span className="tq-tab-r" role="timer">{reloj(vence - ahora)}</span>;
}
