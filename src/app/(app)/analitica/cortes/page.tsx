import { redirect } from "next/navigation";
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
  const cortes = await turnosCerrados(s.barberia.id, 400, { desde: p.desde, hasta: p.hasta });
  const ajustes = await ajustesDeTurnos(s.barberia.id, cortes.map((c) => c.id));

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <div className="entre">
        <SelectorPeriodo ruta="/analitica/cortes" p={p} hoy={hoy} />
        {s.puede("reportes.exportar") && <a className="bt sec solo" href={`/api/exportar?tipo=cortes&desde=${p.desde}&hasta=${p.hasta}`}><Icono n="descargar" />Descargar</a>}
      </div>
      <div>
        <span className="lab">{p.etiqueta}</span>
        <h1 className="titulo" style={{ marginTop: 8 }}>{cortes.length} {cortes.length === 1 ? "corte de caja" : "cortes de caja"}</h1>
        <p className="sub">Efectivo contado contra el esperado, y la revisión de transferencias y tarjeta.</p>
      </div>
      {cortes.length === 0 ? <p className="muted">No hay cortes en estas fechas.</p> : (
        <div className="glass panel tabla-wrap subir">
          <table className="tabla">
            <thead><tr><th>Día</th><th>Cerró</th><th className="der">Esperado</th><th className="der">Contado</th><th>Resultado</th><th>Otras formas de pago</th><th></th></tr></thead>
            <tbody>
              {cortes.map((c) => {
                const aj = ajustes.filter((x) => x.turnoId === c.id);
                const dif = c.diferencia ?? 0;
                const ver = Object.entries((c.verificacion ?? {}) as Record<string, { total: number; coincide: boolean }>);
                return (
                  <tr key={c.id}>
                    <td>{fechaLarga(c.fechaOperativa)}<small className="muted" style={{ display: "block" }}>{horaCorta(c.abiertoEn, zona)} a {c.cerradoEn ? horaCorta(c.cerradoEn, zona) : ""}</small></td>
                    <td>{c.cerradoPor?.split(" ")[0] ?? ""}</td>
                    <td className="der num">{formatoDinero(c.efectivoEsperado ?? 0)}</td>
                    <td className="der num">{formatoDinero(c.efectivoContado ?? 0)}</td>
                    <td>
                      {dif === 0 ? <span className="cubierto"><i>✓</i>Cuadró</span> : <span className="est temp"><span className="d" style={{ background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />{dif > 0 ? `Sobraron ${formatoDinero(dif)}` : `Faltaron ${formatoDinero(-dif)}`}</span>}
                      {c.notasCierre && <small className="muted" style={{ display: "block", marginTop: 4 }}>{c.notasCierre}</small>}
                      {aj.map((x, i) => <small key={i} className="muted" style={{ display: "block", marginTop: 4 }}>Corrección de {formatoDinero(x.monto)} por {x.usuario.split(" ")[0]}: {x.motivo}</small>)}
                    </td>
                    <td>
                      {ver.length === 0 ? <small className="muted">Sin otras formas</small> : ver.map(([m, v]) => (
                        <span key={m} className={`est ${v.coincide ? "" : "temp"}`} style={{ display: "flex" }}><span className="d" style={v.coincide ? undefined : { background: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }} />{m} {formatoDinero(v.total)}{v.coincide ? "" : ", no coincidió"}</span>
                      ))}
                    </td>
                    <td className="der">{s.puede("caja.corregir") && <Corregir id={c.id} dia={fechaLarga(c.fechaOperativa).toLowerCase()} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
