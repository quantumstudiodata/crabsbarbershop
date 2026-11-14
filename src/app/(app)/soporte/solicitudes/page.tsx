import { Suspense } from "react";
import { SelectorUrl } from "@/components/SelectorUrl";
import { solicitudes } from "@/lib/plataforma";
import { ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from "@/lib/soporte";
import { Icono } from "@/components/Icono";
import { CabezaSoporte, ListaSolicitudes } from "../Comunes";

export const metadata = { title: "Solicitudes de soporte" };

// "Abiertas" agrupa los estados sin resolver; los estados sueltos quedan dentro del desplegable.
const ESTADOS: { valor: string; texto: string }[] = [
  { valor: "", texto: "Abiertas" }, { valor: "demoradas", texto: "Sin respuesta en más de 24 h" },
  ...Object.entries(ESTADOS_SOLICITUD).map(([valor, texto]) => ({ valor, texto })), { valor: "todas", texto: "Todas" },
];
const MOTIVOS = [{ valor: "", texto: "Todos los motivos" }, ...Object.entries(TIPOS_SOLICITUD).map(([valor, v]) => ({ valor, texto: v.corto }))];

export default async function Solicitudes({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; tipo?: string }> }) {
  const q = await searchParams;
  const estado = ESTADOS.some((e) => e.valor === q.estado) ? q.estado! : "";
  const tipo = q.tipo && q.tipo in TIPOS_SOLICITUD ? q.tipo : "";
  const filas = await solicitudes({ estado: estado === "todas" ? "" : estado || "abiertas", q: q.q?.trim().slice(0, 60), tipo });
  const pendientes = filas.filter((f) => f.estado === "pendiente").length;
  return (
    <>
      <CabezaSoporte titulo="Solicitudes de soporte" sub={filas.length ? `${filas.length} en esta lista, ${pendientes ? `${pendientes} sin atender` : "ninguna sin atender"}` : "No hay solicitudes en esta lista"} />
      <section className="glass panel-s">
        <div className="filtro-c">
          <form className="con-icono buscar-c" action="/soporte/solicitudes">
            {estado && <input type="hidden" name="estado" value={estado} />}
            {tipo && <input type="hidden" name="tipo" value={tipo} />}
            <Icono n="buscar" />
            <input name="q" className="input" defaultValue={q.q} placeholder="Buscar solicitudes..." aria-label="Buscar solicitudes" />
          </form>
          <Suspense fallback={null}>
            <SelectorUrl nombre="estado" valor={estado} opciones={ESTADOS} etiqueta="Estado" />
            <SelectorUrl nombre="tipo" valor={tipo} opciones={MOTIVOS} etiqueta="Motivo" />
          </Suspense>
        </div>
        <ListaSolicitudes filas={filas} vacio="No hay solicitudes con esos filtros." />
      </section>
    </>
  );
}
