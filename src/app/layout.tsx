import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display", adjustFontFallback: false });
const body = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Crabs Barbería",
  description: "Cobros, caja y reportes de Crabs Barbería.",
  applicationName: "Crabs",
  appleWebApp: { capable: true, title: "Crabs", statusBarStyle: "default" },
  // Next solo escribe "mobile-web-app-capable"; el iPhone necesita también la versión de Apple para abrir a pantalla completa.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#e4e9ee",
  width: "device-width",
  initialScale: 1,
  // Se siente como app: sin acercar con los dedos ni al tocar un campo.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
