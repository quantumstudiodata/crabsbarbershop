import Link from "next/link";
import { solicitudes } from "@/lib/plataforma";
import { ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from "@/lib/soporte";
import { CabezaSoporte, ListaSolicitudes } from "../Comunes";

export const metadata = { title: "Solicitudes de soporte" };

const FILTROS: [string, string][] = [["abiertas", "Abiertas"], ...Object.entries(ESTADOS_SOLICITUD), ["todas", "Todas"]];

export default async function Solicitudes({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; tipo?: string }> }) {
  const q = await searchParams;
  const estado = FILTROS.some(([k]) => k === q.estado) ? q.estado! : "abiertas";
  const tipo = q.tipo && q.tipo in TIPOS_SOLICITUD ? q.tipo : "";
  const filas = await solicitudes({ estado: estado === "todas" ? "" : estado, q: q.q?.trim().slice(0, 60), tipo });
  const url = (e: string, t = tipo) => `/soporte/solicitudes?estado=${e}${t ? `&tipo=${t}` : ""}${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}`;
  return (
    <>
      <CabezaSoporte titulo="Solicitudes de soporte" sub={`${filas.filter((f) => f.estado === "pendiente").length} pendientes en esta lista`} />
      <section className="glass panel-s">
        <div className="filtro-c">
          <form className="buscar-c" action="/soporte/solicitudes">
            <input type="hidden" name="estado" value={estado} />
            <input name="q" className="input" defaultValue={q.q} placeholder="Buscar solicitudes..." aria-label="Buscar solicitudes" />
          </form>
          <nav className="chips-s" aria-label="Estado">
            {FILTROS.map(([k, t]) => <Link key={k} href={url(k)} aria-current={estado === k ? "page" : undefined}>{t}</Link>)}
          </nav>
          <nav className="chips-s" aria-label="Motivo">
            <Link href={url(estado, "")} aria-current={!tipo ? "page" : undefined}>Todos los motivos</Link>
            {Object.entries(TIPOS_SOLICITUD).map(([k, v]) => <Link key={k} href={url(estado, k)} aria-current={tipo === k ? "page" : undefined}>{v.corto}</Link>)}
          </nav>
        </div>
        <ListaSolicitudes filas={filas} vacio="No hay solicitudes con esos filtros." />
      </section>
    </>
  );
}
