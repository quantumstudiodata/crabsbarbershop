import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No se usa el optimizador de imágenes: evita exponer esa ruta del servidor.
  images: { unoptimized: true },
  // Los comprobantes de egresos (fotos ya reducidas en el navegador) viajan en la acción del servidor.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Solo la propia app puede mostrarse dentro de un marco (vista previa de Soporte).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
