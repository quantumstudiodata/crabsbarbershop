import { and, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Ayuda } from "@/components/Ayuda";
import { AvisoUrl } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/Periodo";
import { Cuenta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth";
import { describirRegla, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, reglasDe, turnoAbierto, ventasEntre } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { diasEntre, fechaLarga, fechaLocal, horaCorta, lunesDe } from "@/lib/fechas";
import { formatoDinero } from "@/lib/money";
import { leerPeriodo } from "@/lib/periodo";
import { CancelarVenta } from "../analitica/ventas/CancelarVenta";
import { MINUTOS_CORRECCION } from "@/lib/caja";

export const metadata = { title: "Mis ventas" };

export default async function MisVentas({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; aviso?: string; error?: string }> }) {
  const s = await requerirSesion();
  if (s.usuario.rol !== "barbera" && s.usuario.rol !== "encargada") redirect("/analitica");
  const q = await searchParams;
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const p = leerPeriodo(q, hoy, "semana");
  const yo = s.usuario.id;
  const [{ ventas }, reglas, pagos, turno] = await Promise.all([
    ventasEntre(s.barberia.id, p.desde, p.hasta, { barberoId: yo, zona }),
    reglasDe(s.barberia.id),
    db.select().from(schema.pagosComision).where(and(eq(schema.pagosComision.barberiaId, s.barberia.id), eq(schema.pagosComision.barberoId, yo),
      gte(schema.pagosComision.semana, lunesDe(p.desde)), lte(schema.pagosComision.semana, p.hasta))),
    turnoAbierto(s.barberia.id),
  ]);
  const pagadas = ventas.filter((v) => v.estado === "pagada");
  const mios = pagadas.flatMap((v) => v.conceptos.filter((c) => c.barberoId === yo));
  const vendido = mios.reduce((a, c) => a + c.precioCobrado, 0);
  const comision = mios.reduce((a, c) => a + c.comision, 0);
  const propinas = pagadas.flatMap((v) => v.propinas).filter((x) => x.barberoId === yo).reduce((a, x) => a + x.monto, 0);
  const regla = copiaRegla(elegirRegla(reglas, yo, null, new Date()));
  const tipo = regla?.tipo;
  const conComision = tipo === "porcentaje" || tipo === "fijo" || tipo === "mixto";
  const conSueldo = tipo === "sueldo" || tipo === "mixto";
  const semanas = Math.max(1, Math.ceil((diasEntre(lunesDe(p.desde), p.hasta > hoy ? hoy : p.hasta) + 1) / 7));
  const sueldo = conSueldo ? (regla?.montoSemanal ?? 0) * semanas : 0;
  const recibido = pagos.filter((x) => x.tipo === "pago").reduce((a, x) => a + x.monto, 0);
  const rentaPagada = pagos.filter((x) => x.tipo === "renta").reduce((a, x) => a + x.monto, 0);
  const renta = tipo === "renta" ? (regla?.montoSemanal ?? 0) * semanas : 0;
  const saldo = Math.max(comision * (conComision ? 1 : 0) + sueldo - recibido, 0);
  const dias = [...new Set(ventas.map((v) => v.fecha))];
  const ahora = Date.now();

  return (
    <>
      <AvisoUrl aviso={q.aviso} error={q.error} />
      <SelectorPeriodo ruta="/mis-ventas" p={p} hoy={hoy} conDia />
      <section className="hero subir">
        <div>
          <span className="lab">{p.etiqueta}</span>
          <p className="muted" style={{ margin: "18px 0 6px" }}>Ventas generadas<Ayuda titulo="Ventas generadas">Lo que se cobró por tus servicios, ya con descuentos. No incluye propinas.</Ayuda></p>
          <div className="big"><Cuenta valor={vendido} /></div>
          <p className="muted" style={{ marginTop: 10 }}>{describirRegla(regla, formatoDinero)}</p>
        </div>
        <div className="glass panel subir d2">
          <div className="datos">
            <div><span>Servicios realizados</span><b>{mios.length}</b></div>
            {conComision && <div><span>Comisión generada<Ayuda titulo="Comisión generada" izq>Lo que te corresponde por tus servicios según tu forma de pago.</Ayuda></span><b>{formatoDinero(comision)}</b></div>}
            {conSueldo && <div><span>Sueldo del periodo<Ayuda titulo="Sueldo" izq>Tu sueldo semanal por {semanas} {semanas === 1 ? "semana" : "semanas"}.</Ayuda></span><b>{formatoDinero(sueldo)}</b></div>}
            {tipo !== "renta" && <div><span>Pagos recibidos<Ayuda titulo="Pagos recibidos" izq>Lo que el negocio ya te entregó en estas fechas.</Ayuda></span><b>{formatoDinero(recibido)}</b></div>}
            {tipo !== "renta" && <div><span>Saldo por recibir<Ayuda titulo="Saldo por recibir" izq>Lo que te corresponde menos lo que ya recibiste.</Ayuda></span><b>{formatoDinero(saldo)}</b></div>}
            {tipo === "renta" && <div><span>Renta pagada<Ayuda titulo="Renta de silla" izq>Lo cobrado es tuyo. Pagas una renta fija por la silla.</Ayuda></span><b>{formatoDinero(rentaPagada)} <small className="muted" style={{ fontSize: 13, fontWeight: 500 }}>de {formatoDinero(renta)}</small></b></div>}
            <div><span>Propinas recibidas<Ayuda titulo="Propinas" izq>Son tuyas completas y van aparte.</Ayuda></span><b>{formatoDinero(propinas)}</b></div>
          </div>
        </div>
      </section>

      {dias.length === 0 ? <p className="muted">No hay servicios en estas fechas.</p> : dias.map((d) => (
        <section key={d} className="glass panel subir">
          <span className="lab">{fechaLarga(d)}</span>
          <div className="feed">
            {ventas.filter((v) => v.fecha === d).map((v) => {
              const cancelada = v.estado === "cancelada";
              const corregible = !cancelada && v.registradaPorId === yo && turno?.id === v.turnoId && ahora - v.creadoEn.getTime() <= MINUTOS_CORRECCION * 60000;
              return v.conceptos.filter((c) => c.barberoId === yo).map((c, i) => (
                <div key={`${v.id}${i}`} style={{ alignItems: "center" }}>
                  <span className="t">{horaCorta(v.creadoEn, zona)}</span>
                  <span className={cancelada ? "tachado" : ""}>{c.nombre}<small>Folio {v.folio}{cancelada ? `. Cancelada: ${v.motivoCancelacion}` : ""}</small></span>
                  <span className="fila" style={{ gap: 10 }}>
                    <span className={`num ${cancelada ? "tachado" : ""}`}>{formatoDinero(c.precioCobrado)}</span>
                    {corregible && i === 0 && <CancelarVenta id={v.id} folio={v.folio} total={formatoDinero(v.total)} regreso="/mis-ventas" texto="Anular" />}
                  </span>
                </div>
              ));
            })}
          </div>
        </section>
      ))}
      <p className="ayuda-txt">Si te equivocaste al cobrar, puedes anular tu cobro durante los primeros {MINUTOS_CORRECCION} minutos y volver a registrarlo.</p>
    </>
  );
}
