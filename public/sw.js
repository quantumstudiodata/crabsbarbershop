// Service worker mínimo: hace la app instalable. No guarda datos de ventas en el dispositivo.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
