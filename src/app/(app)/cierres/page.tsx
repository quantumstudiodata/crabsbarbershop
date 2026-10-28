import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { resumenPeriodo, turnosCerrados } from "@/lib/datos";
import { fechaLocal } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Cierres y descargas" };

export default async function Cierres({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("reportes.exportar")) redirect("/");
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(await searchParams, hoy, "semana");
  const [r, cortes] = await Promise.all([resumenPeriodo(s.barberia.id, p.desde, p.hasta, zona), turnosCerrados(s.barberia.id, 400, { desde: p.desde, hasta: p.hasta })]);
  const url = (tipo: string) => `/api/exportar?tipo=${tipo}&desde=${p.desde}&hasta=${p.hasta}`;
  const archivos = [
    { tipo: "ventas", titulo: "Ventas", detalle: `${r.clientes} ventas, una fila por servicio`, cifra: formatoDinero(r.netas) },
    { tipo: "gastos", titulo: "Gastos", detalle: "Gastos registrados en el sistema", cifra: formatoDinero(r.gastos) },
    { tipo: "cortes", titulo: "Cortes de caja", detalle: `${cortes.length} ${cortes.length === 1 ? "corte" : "cortes"} con su diferencia`, cifra: String(cortes.length) },
    { tipo: "equipo", titulo: "Equipo", detalle: "Comisiones, rentas y pagos por persona", cifra: formatoDinero(r.comisiones) },
  ];

  return (
    <>
      <SelectorPeriodo ruta="/cierres" p={p} hoy={hoy} />
      <section className="hero subir">
        <div>
          <span className="lab">{p.etiqueta}</span>
          <h1 className="titulo" style={{ marginTop: 8 }}>Cierres y descargas</h1>
          <p className="sub">Los archivos se abren en Excel.<br />Cada uno trae las fechas que elegiste arriba.</p>
          <div className="datos" style={{ marginTop: 22, maxWidth: 440 }}>
            <div><span>Ventas<Ayuda titulo="Ventas">Lo cobrado por servicios, ya con descuentos. Sin propinas ni ventas canceladas.</Ayuda></span><b>{formatoDinero(r.netas)}</b></div>
            <div><span>Comisiones generadas</span><b>{formatoDinero(r.comisiones)}</b></div>
            <div><span>Gastos registrados</span><b>{formatoDinero(r.gastos)}</b></div>
            <div><span>Descuentos dados</span><b>{formatoDinero(r.descuentos)}</b></div>
          </div>
        </div>
        <div className="glass panel subir d2" style={{ padding: 26 }}>
          <div className="pila-arch" aria-hidden="true">
            {archivos.map((a, i) => (
              <div key={a.tipo} className={`hoja h${i + 1}`}>
                <Icono n="archivo" />
                <span><b>{a.titulo}</b><br /><small className="muted">{a.cifra}</small></span>
              </div>
            ))}
          </div>
          <a className="bt grande" href={url("todo")}>Descargar todo<span className="fl" aria-hidden="true"><Icono n="descargar" /></span></a>
        </div>
      </section>
      <section className="glass panel subir d3">
        <span className="lab">Archivos por separado</span>
        <div className="lista">
          {archivos.map((a) => (
            <div key={a.tipo}>
              <span className="fila" style={{ gap: 12 }}><Icono n="archivo" /><span><b style={{ fontWeight: 600 }}>{a.titulo}</b><small>{a.detalle}</small></span></span>
              <a className="icb" href={url(a.tipo)} aria-label={`Descargar ${a.titulo}`}><Icono n="descargar" /></a>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
