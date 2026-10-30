import { obtenerSesion } from "@/lib/auth";
import { fechaLocal } from "@/lib/fechas";
import { aniosConDatos, libretaAnio, libretaBarberos, libretaMes } from "@/lib/libreta";
import { excelAnual, excelBarberos, excelMes } from "@/lib/libretaExcel";
import { MESES } from "@/lib/periodo";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Descarga la libreta en el mismo formato de Excel que usaba la contadora. */
export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || s.usuario.debeCambiar) return new Response("Inicia sesión.", { status: 401 });
  if (!s.puede("reportes.exportar")) return new Response("No tienes permiso para descargar reportes.", { status: 403 });
  const u = new URL(req.url);
  const zona = s.barberia.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const negocio = s.barberia.nombre;
  const corto = negocio.split(" ")[0].toUpperCase();
  const tipo = u.searchParams.get("tipo");
  let buffer: ArrayBuffer;
  let nombre: string;
  if (tipo === "mes") {
    const mes = u.searchParams.get("mes") ?? "";
    if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(mes) || mes > hoy.slice(0, 7)) return new Response("Mes no válido.", { status: 400 });
    buffer = await excelMes(negocio, await libretaMes(s.barberia.id, mes, zona)) as ArrayBuffer;
    nombre = `${corto}_${MESES[Number(mes.slice(5, 7)) - 1].toUpperCase()}-${mes.slice(2, 4)}`;
  } else if (tipo === "anual" || tipo === "barberos") {
    const anios = (await aniosConDatos(s.barberia.id, hoy)).reverse();
    if (tipo === "anual") {
      buffer = await excelAnual(negocio, await Promise.all(anios.map(async (anio) => ({ anio, filas: await libretaAnio(s.barberia.id, anio, zona) })))) as ArrayBuffer;
      nombre = `${corto}_ANUAL`;
    } else {
      const datos = await Promise.all(anios.map(async (anio) => ({ anio, ...(await libretaBarberos(s.barberia.id, anio, zona)) })));
      buffer = await excelBarberos(negocio, datos.filter((d) => d.meses.some((m) => Object.keys(m.valores).length))) as ArrayBuffer;
      nombre = `${corto}_POR_BARBERO_ANUAL`;
    }
  } else return new Response("Tipo de archivo no válido.", { status: 400 });
  return new Response(buffer, {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${nombre}.xlsx"`, "Cache-Control": "no-store" },
  });
}
