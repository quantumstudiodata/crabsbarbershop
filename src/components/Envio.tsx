"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Evita que un formulario se mande dos veces por un doble toque: el segundo envío se ignora
 * hasta que termina el primero. Se pone como onSubmit del formulario.
 */
export function useUnEnvio(guardando: boolean) {
  const enviando = useRef(false);
  useEffect(() => { if (!guardando) enviando.current = false; }, [guardando]);
  return (e: React.FormEvent) => {
    if (enviando.current) { e.preventDefault(); return; }
    enviando.current = true;
    // Por si el envío no llega a empezar, se libera solo después de unos segundos (el servidor también ignora repetidos).
    setTimeout(() => { enviando.current = false; }, 8000);
  };
}

/** Pide mostrar el aviso de "guardado" (lo muestra AvisoGuardado, que vive una sola vez en la app). */
export function avisarGuardado(texto?: string) {
  if (texto && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("crabs:guardado", { detail: texto }));
}

/** Aviso corto abajo de la pantalla que confirma que algo se guardó. Se va solo. */
export function AvisoGuardado() {
  const [visible, setVisible] = useState<{ texto: string; n: number } | null>(null);
  useEffect(() => {
    const f = (e: Event) => setVisible({ texto: String((e as CustomEvent).detail), n: Date.now() });
    window.addEventListener("crabs:guardado", f);
    return () => window.removeEventListener("crabs:guardado", f);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return createPortal(<div key={visible.n} className="aviso-guardado" role="status">{visible.texto}</div>, document.body);
}
