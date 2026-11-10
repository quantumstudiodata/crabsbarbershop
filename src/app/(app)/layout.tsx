import { eq } from "drizzle-orm";
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
  const { items, sub: subAnalitica, atiende } = menuDe(rol, s.puede, s.barberia.usaCitas);
  const masEnAvatar = items.some((i) => i.href === "/cobrar") && items.filter((i) => i.href !== "/cobrar").length >= 4;
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
          <MenuUsuario
            nombre={s.usuario.nombre}
            usuario={s.usuario.usuario}
            rol={s.usuario.puesto}
            avatar={s.usuario.avatar}
            ajustes={s.puede("usuarios.ver") || s.puede("servicios.ver") || PERMISOS_CONFIG.some((p) => s.puede(p))}
            historial={s.puede("ventas.ver_todas") || atiende}
            masMovil={masEnAvatar ? {
              extra: items.filter((i) => i.href !== "/cobrar").slice(4).map((i) => ({ href: i.href, texto: i.texto, icono: i.icono })),
              ideas: s.puede("ideas.decidir"), ayuda: !soporte, soporte: soporte && !s.vista,
            } : undefined}
            formaPago={atiende ? describirRegla(copiaRegla(elegirRegla(await reglasDe(s.barberia.id), s.usuario.id, null, new Date())), formatoDinero) : null}
          />
          <TituloMovil nombre={s.usuario.nombre.split(" ")[0]} fecha={fechaLarga(fechaLocal(new Date(), s.barberia.zonaHoraria))} items={items} sub={{ base: "/analitica", items: subAnalitica }} />
          <Nav items={items} sub={{ base: "/analitica", items: subAnalitica }} destacado={soporte && !s.vista ? { href: "/soporte", texto: "Soporte", icono: "llave" } : undefined} />
          <div className="herramientas">
            {!soporte && <Suspense fallback={null}><CentroAyuda {...await conteoAyuda(s.usuario.id)} /></Suspense>}
            <Campana />
            {s.puede("ideas.decidir") && <PanelIdeas />}
          </div>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      <BarraInferior items={items} masEnAvatar={masEnAvatar} mas={{
        historial: s.puede("ventas.ver_todas") || atiende,
        ajustes: s.puede("usuarios.ver") || s.puede("servicios.ver") || PERMISOS_CONFIG.some((p) => s.puede(p)),
        ideas: s.puede("ideas.decidir"), ayuda: !soporte, soporte: soporte && !s.vista,
      }} />
      <VentanaVivo />
    </>
  );
}
