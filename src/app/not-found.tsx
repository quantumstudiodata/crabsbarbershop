import { NoEncontrada } from "@/components/NoEncontrada";

export const metadata = { title: "Página no encontrada" };

export default function NoExiste() {
  return <NoEncontrada titulo="Esta página no existe" texto="Puede que la dirección esté incompleta o que la página ya no esté disponible." inicio />;
}
