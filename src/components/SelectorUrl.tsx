"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Selector } from "./ui";

/** Lista desplegable que guarda su valor en la dirección (para filtros). */
export function SelectorUrl({ nombre, valor, opciones, etiqueta }: { nombre: string; valor: string; opciones: { valor: string; texto: string }[]; etiqueta: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  return (
    <div className="sel-equipo">
      <Selector etiqueta={etiqueta} valor={valor} opciones={opciones} onChange={(v) => {
        const n = new URLSearchParams(params.toString());
        if (v) n.set(nombre, v); else n.delete(nombre);
        n.delete("pagina");
        const t = n.toString();
        router.replace(t ? `${ruta}?${t}` : ruta, { scroll: false });
      }} />
    </div>
  );
}
