import { MenuUsuario } from "@/components/MenuUsuario";
import { Nav, type ItemNav } from "@/components/Nav";
import { Campana } from "@/components/Campana";
import { Icono } from "@/components/Icono";
import { PanelIdeas } from "@/components/PanelIdeas";
import { VentanaVivo } from "@/components/VentanaVivo";
import { requerirSesion } from "@/lib/auth";
import { describirRegla, elegirRegla } from "@/lib/comisiones";
import { copiaRegla, reglasDe } from "@/lib/datos";
import { formatoDinero } from "@/lib/money";
import { PERMISOS_CONFIG } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const rol = s.usuario.rol;
  const atiende = rol === "barbera" || rol === "encargada";
  const cobra = s.puede("ventas.registrar") || s.puede("ventas.registrar_otros");
  const analitica = s.puede("reportes.ver") || s.puede("ventas.ver_todas") || s.puede("gastos.ver") || s.puede("cortes.ver");

  const items: ItemNav[] = [];
  if (rol !== "contador") items.push({ href: "/", texto: "Inicio", icono: "inicio" });
  if (cobra) items.push({ href: "/cobrar", texto: "Cobro", icono: "cobro" });
  if (atiende) items.push({ href: "/mis-ventas", texto: "Mis ventas", icono: "lista" });
  if (analitica) items.push({ href: "/analitica", texto: "Analítica", icono: "grafica" });
  if (rol === "contador") items.push({ href: "/libreta", texto: "Libreta", icono: "lista" });
  if (rol === "contador") items.push({ href: "/cierres", texto: "Cierres y descargas", icono: "archivo" });

  return (
    <>
      {s.vista && (
        <div className="banda-vista" role="status">
          <span><Icono n="ojo" /><b>Modo de visualización:</b> {s.vista}. Así lo ve este puesto; no se guarda ningún cambio.</span>
          <span className="fila" style={{ gap: 8 }}>
            <a className="bt chico sec solo" href="/soporte">Cambiar experiencia</a>
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
            soporte={s.usuario.esSoporte}
            formaPago={atiende ? describirRegla(copiaRegla(elegirRegla(await reglasDe(s.barberia.id), s.usuario.id, null, new Date())), formatoDinero) : null}
          />
          <Nav items={items} />
          <div className="herramientas">
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
