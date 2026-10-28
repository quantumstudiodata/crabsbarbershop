import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { requerirSesion } from "@/lib/auth";
import { equipoQueAtiende, metodosActivos, serviciosActivos, turnoAbierto } from "@/lib/datos";
import { FormCobro } from "./FormCobro";

export const metadata = { title: "Cobrar" };

export default async function Cobrar() {
  const s = await requerirSesion();
  if (!s.puede("ventas.registrar") && !s.puede("ventas.registrar_otros")) {
    return <p className="aviso error">No tienes permiso para cobrar.</p>;
  }
  const [turno, servicios, equipo, metodos] = await Promise.all([
    turnoAbierto(s.barberia.id), serviciosActivos(s.barberia.id), equipoQueAtiende(s.barberia.id), metodosActivos(s.barberia.id),
  ]);
  return (
    <>
      <Encabezado etiqueta="Nueva venta" titulo="¿Qué se hizo?" sub="Toca el servicio. Si fueron varios, toca todos." />
      {!turno ? (
        <div className="glass idea">
          <span className="punto" aria-hidden="true">!</span>
          <p><b>La caja está cerrada.</b><br /><span>Para cobrar, primero hay que abrirla con el fondo del día.</span></p>
          {s.puede("caja.operar") ? <Link href="/caja" className="btn pri">Abrir caja</Link> : <span className="muted">Pide a la encargada que la abra.</span>}
        </div>
      ) : servicios.length === 0 || metodos.length === 0 ? (
        <p className="aviso">Falta configurar servicios o formas de pago en Ajustes.</p>
      ) : (
        <FormCobro
          servicios={servicios.map(({ id, nombre, duracionMin, precio }) => ({ id, nombre, duracionMin, precio }))}
          equipo={equipo.map(({ id, nombre }) => ({ id, nombre }))}
          metodos={metodos.map(({ id, nombre, esEfectivo }) => ({ id, nombre, esEfectivo }))}
          yo={s.usuario.id}
          puedeOtros={s.puede("ventas.registrar_otros")}
        />
      )}
    </>
  );
}
