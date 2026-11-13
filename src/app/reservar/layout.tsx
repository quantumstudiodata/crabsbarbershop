import { Geist } from "next/font/google";

// Páginas del cliente en fondo oscuro: Safari pinta sus barras de arriba y abajo con este color.
export const viewport = { themeColor: "#0c0d0f" };

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-reserva" });

/** Páginas que ve el cliente (reservar y su cita): su propia letra, más moderna que la de la app. */
export default function LayoutReservar({ children }: { children: React.ReactNode }) {
  return <div className={`${geist.variable} fx-raiz`}>{children}</div>;
}
