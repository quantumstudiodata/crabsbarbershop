"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Selector } from "@/components/ui";

export function FiltroPersona({ personas, actual }: { personas: { id: string; nombre: string; avatar: string }[]; actual: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  return (
    <div style={{ minWidth: 210 }}>
      <Selector etiqueta="Filtrar por persona" valor={actual} onChange={(v) => {
        const q = new URLSearchParams(params.toString());
        if (v) q.set("persona", v); else q.delete("persona");
        router.push(`${ruta}?${q.toString()}`);
      }} opciones={[{ valor: "", texto: "Todo el equipo" }, ...personas.map((p) => ({ valor: p.id, texto: p.nombre.split(" ").slice(0, 2).join(" "), icono: <Avatar avatar={p.avatar} nombre={p.nombre} t={22} /> }))]} />
    </div>
  );
}
