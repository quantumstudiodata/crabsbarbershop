import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { SelectorPeriodo } from "@/components/Periodo";
import { requerirSesion } from "@/lib/auth";
import { ajustesDeTurnos, turnosCerrados } from "@/lib/datos";
import { fechaLarga, fechaLocal, horaCorta } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { Corregir } from "./Corregir";

export const metadata = { title: "Cortes de caja" };

export default async function Cortes({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (!s.puede("caja.operar") && !s.puede("reportes.ver")) redirect("/");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "semana");
  const cortes = await turnosCerrados(s.barberia.id, 1000, { desde: p.desde, hasta: p.hasta });
  const ajustes = await ajustesDeTurnos(s.barberia.id, cortes.map((c) => c.id));
  const dias = [...new Set(cortes.map((c) => c.fechaOperativa))].sort().reverse();

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="entre">
        <SelectorPeriodo ruta="/analitica/cortes" p={p} hoy={hoy} conAnio />
        {s.puede("reportes.exportar") && <a className="bt sec solo" href={`/api/exportar?tipo=cortes&desde=${p.desde}&hasta=${p.hasta}`}><Icono n="descargar" />Descargar</a>}
      </div>
      <div>
        <span className="lab">{p.etiqueta}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>Cortes de caja
          <Ayuda titulo="¿Qué es un corte?">Cada vez que alguien cierra la caja queda un corte: el efectivo contado contra el esperado, y si las transferencias y la tarjeta coincidieron.<br /><br />En un mismo día puede haber varios, uno por cada vez que se abrió y cerró.</Ayuda>
        </h1>
      </div>
      {dias.length === 0 ? <p className="muted">No hay cortes en estas fechas.</p> : dias.map((d) => {
        const delDia = cortes.filter((c) => c.fechaOperativa === d).sort((a, b) => a.abiertoEn.getTime() - b.abiertoEn.getTime());
        const difDia = delDia.reduce((a, c) => a + (c.diferencia ?? 0), 0);
        return (
          <section key={d} className="dia-cortes subir">
            <div className="entre">
              <span><b style={{ fontSize: 15 }}>{fechaLarga(d)}</b><small className="muted" style={{ display: "block" }}>{delDia.length} {delDia.length === 1 ? "corte" : "cortes"}</small></span>
              {difDia === 0 ? <span className="cubierto"><i>✓</i>Todo cuadró</span> : <span className="pill warn">{difDia > 0 ? `Sobraron ${formatoDinero(difDia)}` : `Faltaron ${formatoDinero(-difDia)}`} en el día</span>}
            </div>
            <div className="cortes-g">
              {delDia.map((c, i) => {
                const dif = c.diferencia ?? 0;
                const ver = Object.entries((c.verificacion ?? {}) as Record<string, { total: number; coincide: boolean }>);
                const aj = ajustes.filter((x) => x.turnoId === c.id);
                return (
                  <article key={c.id} className="glass corte-t">
                    <div className="entre">
                      <span className="lab">Corte {i + 1}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{horaCorta(c.abiertoEn, zona)} a {c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}</span>
                    </div>
                    <span style={{ fontSize: 13 }}>Cerró <b>{c.cerradoPor?.split(" ")[0] ?? ""}</b></span>
                    <div className="corte-num">
                      <span><small>Esperado</small><b>{formatoDinero(c.efectivoEsperado ?? 0)}</b></span>
                      <span><small>Contado</small><b>{formatoDinero(c.efectivoContado ?? 0)}</b></span>
                    </div>
                    {dif === 0 ? <span className="cubierto"><i>✓</i>El efectivo cuadró</span> : <span className="est temp"><span className="d" style={{ background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />{dif > 0 ? `Sobraron ${formatoDinero(dif)}` : `Faltaron ${formatoDinero(-dif)}`}</span>}
                    {ver.map(([m, v]) => (
                      <span key={m} className={`est ${v.coincide ? "" : "temp"}`}><span className="d" style={v.coincide ? undefined : { background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />{m} {formatoDinero(v.total)}{v.coincide ? ", coincide" : ", no coincidió"}</span>
                    ))}
                    {c.notasCierre && <p className="nota-c">{c.notasCierre}</p>}
                    {aj.map((x, k) => <p key={k} className="nota-c">Ajuste de {formatoDinero(x.monto)} por {x.usuario.split(" ")[0]}: {x.motivo}</p>)}
                    {s.puede("caja.corregir") && (
                      <span className="fila" style={{ gap: 4 }}>
                        <Corregir id={c.id} dia={fechaLarga(c.fechaOperativa).toLowerCase()} />
                        <Ayuda titulo="Ajuste posterior">Si después de cerrar aparece dinero que no se contó, o se descubre un faltante, se registra aquí. El corte original no se modifica.</Ayuda>
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
