"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { registrar } from "@/lib/historial";
import type { HorarioAgenda } from "@/lib/agenda";

const horaValida = (h: string) => /^\d{2}:\d{2}$/.test(h) && Number(h.slice(0, 2)) < 24 && Number(h.slice(3)) < 60 && Number(h.slice(3)) % 15 === 0;

export async function guardarAgenda(form: FormData) {
  const s = await requerirSesion();
  if (!s.puede("configuracion.cobros")) redirect("/?aviso=sin-permiso");
  const horario: HorarioAgenda = {};
  for (let i = 0; i < 7; i++) {
    const abierto = form.get(`abierto_${i}`) === "on";
    const abre = String(form.get(`abre_${i}`) ?? "10:00");
    const cierra = String(form.get(`cierra_${i}`) ?? "19:00");
    if (abierto && (!horaValida(abre) || !horaValida(cierra) || cierra <= abre)) redirect("/ajustes/citas?error=horario");
    horario[String(i)] = { abierto, abre: horaValida(abre) ? abre : "10:00", cierra: horaValida(cierra) ? cierra : "19:00" };
  }
  const activa = form.get("agendaActiva") === "on";
  if (activa && !Object.values(horario).some((h) => h.abierto)) redirect("/ajustes/citas?error=sin-horario");
  await db.update(schema.barberias).set({ agendaActiva: activa, horarioAgenda: horario }).where(eq(schema.barberias.id, s.barberia.id));
  await registrar(db, { barberiaId: s.barberia.id, usuarioId: s.usuario.id, tipo: "ajuste", accion: `${s.usuario.nombre} actualizó la agenda de citas`, detalle: { activa, horario } });
  revalidatePath("/ajustes/citas");
  revalidatePath(`/agendar/${s.barberia.id}`);
  redirect("/ajustes/citas?guardado=1");
}
