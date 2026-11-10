"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icono } from "./Icono";
import { Modal } from "./ui";

/** Después de cobrar: el cliente escanea el código o recibe el enlace para calificar su visita. */
export function EncuestaQR({ token }: { token: string }) {
  const [abierto, setAbierto] = useState(false);
  const [svg, setSvg] = useState("");
  const [copiado, setCopiado] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/e/${token}`;
  useEffect(() => {
    if (abierto && url) QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#13171c", light: "#ffffff" } }).then(setSvg).catch(() => setSvg(""));
  }, [abierto, url]);
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "¿Cómo te atendimos?", url });
      else { await navigator.clipboard.writeText(url); setCopiado(true); }
    } catch { /* el cliente canceló */ }
  };
  return (
    <>
      <button type="button" className="enlace enc-b" onClick={() => setAbierto(true)}><Icono n="chispa" />Encuesta para el cliente</button>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} etiqueta="Encuesta" titulo="¿Cómo te atendimos?">
        <div className="enc-qr">
          <p className="muted">Pide al cliente que escanee el código con su teléfono. Son dos preguntas.</p>
          {svg ? <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr" />}
          <div className="fila" style={{ justifyContent: "center" }}>
            <button type="button" className="bt solo chico" onClick={compartir}><Icono n="enviar" />{copiado ? "Enlace copiado" : "Enviar enlace"}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
