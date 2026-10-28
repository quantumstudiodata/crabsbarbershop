import { MenuUsuario } from "@/components/MenuUsuario";
import { Nav, type ItemNav } from "@/components/Nav";
import { Campana } from "@/components/Campana";
import { Icono } from "@/components/Icono";
import { PanelIdeas } from "@/components/PanelIdeas";
import { VentanaVivo } from "@/components/VentanaVivo";
import { requerirSesion } from "@/lib/auth";
import { NOMBRE_ROL } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const rol = s.usuario.rol;
  const atiende = rol === "barbera" || rol === "encargada";
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  const analitica = s.puede("reportes.ver") || s.puede("ventas.ver_todas");

  const items: ItemNav[] = [];
  if (rol !== "contador") items.push({ href: "/", texto: "Inicio", icono: "inicio" });
  if (cobra) items.push({ href: "/cobrar", texto: "Cobro", icono: "cobro" });
  if (atiende) items.push({ href: "/mis-ventas", texto: "Mis ventas", icono: "lista" });
  if (analitica) items.push({ href: "/analitica", texto: "Analítica", icono: "grafica" });
  if (rol === "contador") items.push({ href: "/cierres", texto: "Cierres y descargas", icono: "archivo" });

  return (
    <>
      <header className="barra">
        <div className="barra-in">
          <MenuUsuario
            nombre={s.usuario.nombre}
            usuario={s.usuario.usuario}
            rol={NOMBRE_ROL[rol]}
            avatar={s.usuario.avatar}
            ajustes={s.puede("ajustes.usuarios") || s.puede("ajustes.negocio")}
            historial={s.puede("historial.ver")}
          />
          <Nav items={items} />
          <div className="herramientas">
            {rol === "contador" ? <span className="est"><Icono n="candado" />Solo lectura</span> : <Campana verTodo={s.puede("historial.ver") ? "/historial" : "/mis-ventas"} />}
            {s.puede("ideas.decidir") && <PanelIdeas />}
          </div>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      {rol !== "contador" && <VentanaVivo />}
    </>
  );
}
