import { eq } from "drizzle-orm";
import { QrGlobal } from "./cobrar/QrGlobal";
import { cobraEnLinea } from "@/lib/stripe";
import { headers } from "next/headers";
import { Suspense } from "react";
import { CambiarVista } from "@/components/CambiarVista";
import { CentroAyuda } from "@/components/CentroAyuda";
import { conteoAyuda } from "@/lib/ayuda";
import { MenuUsuario } from "@/components/MenuUsuario";
import { Nav } from "@/components/Nav";
import { BarraInferior, TituloMovil } from "@/components/BarraMovil";
import { fechaLarga, fechaLocal } from "@/lib/fechas";
import { menuDe } from "@/lib/menu";
import { Campana } from "@/components/Campana";
import { Icono } from "@/components/Icono";
import { PanelIdeas } from "@/components/PanelIdeas";
import { VentanaVivo } from "@/components/VentanaVivo";
import { AvisoPagoLinea } from "@/components/AvisoPagoLinea";
import { Guia } from "@/components/Guia";
import { requerirSesion } from "@/lib/auth";
import { describirRegla, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, reglasDe } from "@/lib/datos";
import { db, schema } from "@/lib/db";
import { formatoDinero } from "@/lib/money";
import { NOMBRE_ROL, PERMISOS_CONFIG, PLANTILLAS } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const rol = s.usuario.rol;
  const { items, grupos, atiende } = menuDe(rol, s.puede, s.barberia.usaCitas);
  // En el teléfono caben cuatro secciones abajo (más Cobrar aparte); las demás van en el menú de la cuenta.
  const extraMovil = items.filter((i) => i.href !== "/cobrar").slice(4).map((i) => ({ href: i.href, texto: i.texto, icono: i.icono }));
  const soporte = s.usuario.esSoporte;
  const experiencias = soporte ? [
    ...PLANTILLAS.map((r) => ({ como: r, texto: NOMBRE_ROL[r] })),
    ...(await db.select({ id: schema.puestos.id, nombre: schema.puestos.nombre }).from(schema.puestos).where(eq(schema.puestos.barberiaId, s.barberia.id)))
      .map((p) => ({ como: `puesto:${p.id}`, texto: p.nombre })),
  ] : [];

  return (
    <>
      {s.vista && (await headers()).get("sec-fetch-dest") !== "iframe" && (
        <div className="banda-vista" role="status">
          <span><Icono n="ojo" /><b>Modo de visualización:</b> {s.vista}{s.barberia.esPrueba ? ` en ${s.barberia.nombre}, negocio de prueba: las acciones sí se guardan ahí.` : ". Así lo ve este puesto; no se guarda ningún cambio."}</span>
          <span className="fila" style={{ gap: 8 }}>
            <CambiarVista opciones={experiencias} actual={s.vista} />
            <a className="bt chico" href="/api/vista?salir=1">Salir</a>
          </span>
        </div>
      )}
      <header className="barra">
        <div className="barra-in">
          <b className="negocio-n">{s.barberia.nombre}</b>
          <TituloMovil negocio={s.barberia.nombre} nombre={s.usuario.nombre.split(" ")[0]} fecha={fechaLarga(fechaLocal(new Date(), s.barberia.zonaHoraria))} items={items} grupos={grupos} />
          <Nav items={items} grupos={grupos} destacado={soporte && !s.vista ? { href: "/soporte", texto: "Soporte", icono: "llave" } : undefined} />
          <div className="herramientas">
            {!soporte && <Suspense fallback={null}><CentroAyuda {...await conteoAyuda(s.usuario.id)} /></Suspense>}
            <Campana />
            {s.puede("ideas.decidir") && <PanelIdeas />}
            <MenuUsuario
              nombre={s.usuario.nombre}
              usuario={s.usuario.usuario}
              rol={s.usuario.puesto}
              avatar={s.usuario.avatar}
              ajustes={s.puede("usuarios.ver") || s.puede("servicios.ver") || s.puede("citas.horarios") || PERMISOS_CONFIG.some((p) => s.puede(p))}
              historial={s.puede("ventas.ver_todas") || atiende}
              mas={{ extra: extraMovil, ideas: s.puede("ideas.decidir"), ayuda: !soporte, soporte: soporte && !s.vista }}
              formaPago={atiende ? describirRegla(copiaRegla(elegirRegla(await reglasDe(s.barberia.id), s.usuario.id, null, new Date())), formatoDinero) : null}
            />
          </div>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      {(s.puede("ventas.registrar") || s.puede("ventas.registrar_otros")) && cobraEnLinea(s.barberia) && <QrGlobal />}
      <BarraInferior items={items} mas={{
        historial: s.puede("ventas.ver_todas") || atiende,
        ajustes: s.puede("usuarios.ver") || s.puede("servicios.ver") || s.puede("citas.horarios") || PERMISOS_CONFIG.some((p) => s.puede(p)),
        ideas: s.puede("ideas.decidir"), ayuda: !soporte, soporte: soporte && !s.vista,
      }} />
      <VentanaVivo />
      {!s.vista && <Suspense fallback={null}><GuiaDe usuario={s.usuario.id} nombre={s.usuario.nombre.split(" ")[0]} puntos={puntosGuia(s, atiende)} /></Suspense>}
      {s.barberia.usaCitas && s.puede("citas.ver") && <AvisoPagoLinea />}
    </>
  );
}

/** Lo que la guía de primer uso le enseña a esta persona, según lo que su puesto puede hacer. */
function puntosGuia(s: Awaited<ReturnType<typeof requerirSesion>>, atiende: boolean): string[] {
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  const citas = s.barberia.usaCitas;
  return [
    "acc",
    ...(cobra ? ["cobro", "atajos", "qr"] : []),
    ...(s.puede("caja.retiros") ? ["retiro", "gasto"] : s.puede("gastos.registrar") ? ["egreso"] : []),
    ...(s.puede("caja.operar") ? ["corte"] : s.puede("cortes.ver") ? ["cortesver"] : []),
    ...(cobra || s.puede("ventas.ver_todas") ? ["ventas"] : []),
    ...(citas && s.puede("citas.modificar") ? ["citas"] : []),
    ...(citas && s.puede("citas.ver") ? ["agenda"] : []),
    ...(s.puede("reportes.ver") ? ["analitica"] : []),
    ...(s.puede("ventas.ver_todas") || s.puede("equipo.pagar") ? ["equipo"] : []),
    ...(atiende || s.puede("resenas.responder") ? ["resenas"] : []),
    ...(s.usuario.rol === "duena" || s.usuario.rol === "admin" ? ["ajustes"] : []),
    ...(s.usuario.rol === "contador" ? ["libreta"] : []),
  ];
}

/** Guía de primer uso: se muestra hasta que la persona la termina (guardado en su usuario). */
async function GuiaDe({ usuario, nombre, puntos }: { usuario: string; nombre: string; puntos: string[] }) {
  const [u] = await db.select({ v: schema.usuarios.consejosVistos }).from(schema.usuarios).where(eq(schema.usuarios.id, usuario)).limit(1).catch(() => [] as { v: string[] }[]);
  return <Guia vistos={u?.v ?? []} puntos={puntos} nombre={nombre} />;
}
