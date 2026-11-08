import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";
import { CambiarVista } from "@/components/CambiarVista";
import { CentroAyuda } from "@/components/CentroAyuda";
import { conteoAyuda } from "@/lib/ayuda";
import { MenuUsuario } from "@/components/MenuUsuario";
import { Nav, type ItemNav } from "@/components/Nav";
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
  const atiende = rol === "barbera" || rol === "encargada";
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  const analitica = s.puede("reportes.ver") || s.puede("ventas.ver_todas") || s.puede("gastos.ver") || s.puede("cortes.ver");
  // Pestañas de Analítica: aparecen en lugar del menú principal al entrar a la sección.
  const subAnalitica: [string, string][] = [];
  if (s.puede("reportes.ver")) subAnalitica.push(["/analitica", "Resumen"]);
  if (s.puede("ventas.ver_todas")) subAnalitica.push(["/analitica/ventas", "Ventas"]);
  if (s.puede("cortes.ver")) subAnalitica.push(["/analitica/cortes", "Cortes de caja"]);
  if (s.puede("reportes.ver") || s.puede("gastos.ver")) subAnalitica.push(["/analitica/finanzas", "Finanzas"]);

  const items: ItemNav[] = [];
  if (rol !== "contador") items.push({ href: "/", texto: "Inicio", icono: "inicio" });
  if (cobra) items.push({ href: "/cobrar", texto: "Cobro", icono: "cobro" });
  if (atiende) items.push({ href: "/mis-ventas", texto: "Mis ventas", icono: "lista" });
  if (analitica) items.push({ href: "/analitica", texto: "Analítica", icono: "grafica" });
  if (rol === "contador") items.push({ href: "/libreta", texto: "Libreta", icono: "lista" });

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
          <span><Icono n="ojo" /><b>Modo de visualización:</b> {s.vista}. Así lo ve este puesto; no se guarda ningún cambio.</span>
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
            formaPago={atiende ? describirRegla(copiaRegla(elegirRegla(await reglasDe(s.barberia.id), s.usuario.id, null, new Date())), formatoDinero) : null}
          />
          <Nav items={items} sub={{ base: "/analitica", items: subAnalitica }} destacado={soporte && !s.vista ? { href: "/soporte", texto: "Soporte", icono: "llave" } : undefined} />
          <div className="herramientas">
            {!soporte && <Suspense fallback={null}><CentroAyuda {...await conteoAyuda(s.usuario.id)} /></Suspense>}
            {rol === "contador" ? null : <Campana />}
            {s.puede("ideas.decidir") && <PanelIdeas />}
          </div>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      {rol !== "contador" && <VentanaVivo />}
    </>
  );
}
