"use client";
import { useEffect } from "react";

/** Permite instalar Crabs como aplicación en la computadora, tableta o celular. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
