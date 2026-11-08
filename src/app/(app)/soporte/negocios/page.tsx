import Link from "next/link";
import { Icono } from "@/components/Icono";
import { negocios } from "@/lib/plataforma";
import { hace } from "@/lib/soporte";
import { CabezaSoporte } from "../Comunes";

export const metadata = { title: "Negocios" };

export default async function Negocios({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().slice(0, 60) ?? "";
  const filas = await negocios(q || undefined);
  return (
    <>
      <CabezaSoporte titulo="Negocios" sub="Cuentas, configuración y diagnóstico de cada negocio" />
      <section className="glass panel-s">
        <form className="buscar-s chico" action="/soporte/negocios"><Icono n="buscar" /><input name="q" className="input" defaultValue={q} placeholder="Nombre, propietario o identificador del negocio" aria-label="Buscar un negocio" /></form>
        {!filas.length ? <p className="muted vacio-s">No se encontró ningún negocio{q ? ` con "${q}"` : ""}.</p> : (
          <div className="lista-s">
            {filas.map((n) => (
              <Link key={n.id} href={`/soporte/negocios/${n.id}`} className="fila-s">
                <span className="t-s"><b>{n.nombre}</b><small>{n.propietario ?? "Sin titular activo"}, {n.usuarios} {n.usuarios === 1 ? "cuenta" : "cuentas"}, {n.ventas} ventas</small></span>
                <span className="meta-s">
                  {n.prueba && <span className="chip-p">Prueba</span>}
                  {n.estado !== "activa" && <span className="chip-p alerta">{n.estado}</span>}
                  <small>{n.ultima ? `Última venta: ${hace(n.ultima)}` : "Sin ventas"}</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
