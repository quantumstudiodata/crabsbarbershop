import { Geist } from "next/font/google";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-reserva" });

/** Páginas que ve el cliente (reservar y su cita): su propia letra, más moderna que la de la app. */
export default function LayoutReservar({ children }: { children: React.ReactNode }) {
  return <div className={`${geist.variable} fx-raiz`}>{children}</div>;
}
