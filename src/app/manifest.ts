import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crabs Barbería",
    short_name: "Crabs",
    description: "Cobros, caja y reportes de Crabs Barbería.",
    start_url: "/",
    display: "standalone",
    background_color: "#e4e9ee",
    theme_color: "#e4e9ee",
    lang: "es-MX",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
