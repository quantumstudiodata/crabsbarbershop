import { NoEncontrada } from "@/components/NoEncontrada";

export default function PagoNoExiste() {
  return <NoEncontrada titulo="Este enlace de pago ya no está disponible" texto="Puede que ya se haya pagado o que haya vencido. Pide al negocio que te comparta uno nuevo." />;
}
